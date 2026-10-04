// 第 177 单·AI 成本闸（客户端侧）取证（真浏览器，进冒烟档 2）
//
// 为什么要有它：客户端一档的额度闸（每天最多 N 次、用尽即**不发请求**、直接走模板）落在
//   DOM／AI 层，Node 侧够不着。本工具用 Playwright 打开真页面、把 `/relay` 换成 mock，
//   于是"页面向中转站发了几次"可以直接数——判据全是行为读数，不是看源码猜。
//
// 判据：
//   ① 基线：给 2 个额度，发一条短信 ⇒ 短信这一路命中 relay 1 次、回信是 mock 文本（llm=true）；
//   ② 用尽：把额度卡到"已用满"，再发一条 ⇒ **短信这一路命中不再增加**、回信落模板（llm≠true）、
//      日志落一条"今日 AI 额度已用尽"、设置页「今日额度」显 0；
//   ③ 刷新不清零：额度用掉一部分后 reload ⇒ used 原样（计数随存档信封走，刷新不能绕过）；
//   ④ 跨日重置：把世界时钟推过零点 ⇒ 下一笔又发得出去、used 从 1 重新起算（按游戏日重置）；
//   ⑤ 旧档兼容：把存档信封里的 `ai` 小账删掉再进 ⇒ 不崩、按满额起算。
// 用法：node tools/ai-gate/client.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'ai-gate-client'));
fs.mkdirSync(OUT, { recursive: true });
const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},get AI_GATE(){return AI_GATE}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18961;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const 读日志 = p => p.evaluate(() => (window.__pv.state.world.log || []).map(e => ({
  type: e.type || '', sms: e.sms || '', llm: !!e.llm, pending: e.llmPending === true,
  text: String(e.text || ''), thought: String(e.thought || ''),
})));
const 等条件 = async (p, fn, 上限 = 25000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < 上限) { if (await fn()) return true; await p.waitForTimeout(300); }
  return false;
};
const 发短信 = async p => {
  await p.click('button.tab[data-tab="phone"]').catch(() => {});
  await p.waitForSelector('#ph-msgs button[data-msg]:not([disabled])', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(200);
  await p.click('#ph-msgs button[data-msg]').catch(() => {});
  return 等条件(p, async () => (await 读日志(p)).some(e => e.sms === 'out'), 8000);
};
const 额度 = p => p.evaluate(() => {
  const S = window.__pv.state, cap = Math.floor(window.__pv.AI_GATE.daily);
  return { day: S.aiGate.day, used: S.aiGate.used, cap };
});
const 卡额度 = (p, 再给) => p.evaluate(k => {
  const S = window.__pv.state;
  window.__pv.AI_GATE.daily = Math.max(0, Math.floor((S.aiGate.used || 0) + k));
}, 再给);
const 设置页额度 = async p => {
  await p.click('button.tab[data-tab="settings"]').catch(() => {});
  await p.waitForTimeout(250);
  const t = await p.textContent('#set-llm-quota').catch(() => '');
  await p.click('button.tab[data-tab="live"]').catch(() => {});
  return String(t || '').trim();
};

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
let 红 = 0;
const 判 = (名, ok, 读) => { if (!ok) 红++; console.log((ok ? ' ok  ' : ' FAIL ') + 名 + '：' + JSON.stringify(读)); };

async function 开场(){
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript(() => { window.__relayHits = 0; window.__relaySms = 0; window.__relayPrompts = []; });
  const page = await ctx.newPage();
  const 错 = [];
  page.on('pageerror', e => 错.push('pageerror: ' + (e && e.message || e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() && m.location().url) || '';
    if (/favicon|\/relay|net::ERR/.test(u) || /Failed to load resource|CORS|Failed to fetch|api\.anthropic/i.test(m.text())) return;
    错.push('console: ' + m.text().slice(0, 120));
  });
  await page.route('**api.anthropic.com**', r => r.abort());
  await page.route('**/relay', async r => {
    let prompt = '';
    try { prompt = String((r.request().postDataJSON() || {}).prompt || ''); } catch (_) {}
    await page.evaluate(x => {
      window.__relayHits++;
      if (x.indexOf('刚发来') >= 0) window.__relaySms++;
      window.__relayPrompts.push(x.replace(/\s+/g, ' ').slice(0, 50));
    }, prompt).catch(() => {});
    await r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ text: JSON.stringify({ inner: '（mock 内心）这号码又来了。', reply: '收到，我这就去。' }) }) });
  });
  await page.goto(URL_, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(900);
  return { ctx, page, 错 };
}
const 短信命中 = p => p.evaluate(() => window.__relaySms);

/* ── 幕 A：基线 ＋ 用尽即走模板（不发请求） ───────────────────────────── */
{
  const { ctx, page, 错 } = await 开场();
  await 卡额度(page, 2);
  const 发好 = await 发短信(page);
  const 有AI = await 等条件(page, async () => {
    const L = await 读日志(page);
    return L.some(e => e.sms === 'reply' && e.llm && e.thought.includes('收到，我这就去。'))
      && L.some(e => e.sms === 'read' && e.llm);
  });
  const 命中1 = await 短信命中(page);
  判('① 基线：额度内发短信 ⇒ 短信这一路命中 relay 1 次、回信是 mock（llm=true）',
    发好 && 有AI && 命中1 === 1, { 发好, 有AI, 命中1 });
  const 前 = await 额度(page);
  await 卡额度(page, 0);                       // 卡到"已用满"
  await 发短信(page);
  const 落模板 = await 等条件(page, async () => {
    const L = await 读日志(page);
    const 读 = L.filter(e => e.sms === 'read');
    return 读.length >= 2 && 读[读.length - 1].llm === false && !读[读.length - 1].pending
      && L.some(e => e.text.includes('额度已用尽'));
  });
  const 命中2 = await 短信命中(page);
  const 后 = await 额度(page);
  const 设置行 = await 设置页额度(page);
  判('② 用尽：再发一条 ⇒ 命中不增、回信落模板、日志说"额度已用尽"、设置页显 0',
    落模板 && 命中2 === 命中1 && 后.used >= 后.cap && /^0\s*\//.test(设置行),
    { 落模板, 命中1, 命中2, 前后: [前, 后], 设置行 });
  await page.screenshot({ path: path.join(OUT, '幕A-额度用尽.png') }).catch(() => {});
  判('幕A 零页错', 错.length === 0, 错.slice(0, 3));
  await ctx.close();
}

/* ── 幕 B：刷新不清零（计数随存档信封走） ─────────────────────────────── */
{
  const { ctx, page, 错 } = await 开场();
  await 卡额度(page, 2);
  await 发短信(page);
  await 等条件(page, async () => (await 短信命中(page)) >= 1);
  const 前 = await 额度(page);
  await page.waitForTimeout(1500);              // 等自动存档落一笔
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const 后 = await 额度(page);
  await 卡额度(page, 0);
  await 发短信(page);
  const 命中 = await 短信命中(page);
  await page.waitForTimeout(1500);
  判('③ 刷新不清零：used 原样带回来，且刷新后用尽仍然不发请求',
    前.used >= 1 && 后.used >= 前.used && 命中 === 0, { 前, 后, 刷新后短信命中: 命中 });
  判('幕B 零页错', 错.length === 0, 错.slice(0, 3));
  await ctx.close();
}

/* ── 幕 C：跨日重置 ＋ 旧档兼容 ───────────────────────────────────────── */
{
  const { ctx, page, 错 } = await 开场();
  /* 把世界拨到当天的 23:50，好在几秒内真的**跨过零点**（把 t 硬加一天不会触发日切事件） */
  const 前日 = await page.evaluate(() => {
    const S = window.__pv.state, w = S.world;
    const 当日 = Math.floor(w.t / 1440);
    w.t = 当日 * 1440 + 1430;                    // 23:50
    S.lastReflectDay = 当日 + 1;                 // 跳过"夜深了"那一轮，免得日记抢额度
    for (const a of w.agents) a.busyUntil = w.t; // 让人立刻决策（睡眠分支也会每 30 分钟醒一次读信）
    return { 当日: 当日 + 1 };
  });
  await page.waitForTimeout(300);
  await 卡额度(page, 2);
  const 命中0 = await 短信命中(page);
  const 发1 = await 发短信(page);
  const 零点前发得出去 = await 等条件(page, async () => (await 短信命中(page)) > 命中0, 20000);
  await page.waitForTimeout(3500);               // 10 真实秒 ≈ 100 游戏分钟：足够从 23:50 跨过零点
  await 卡额度(page, 2);
  const 命中前 = await 短信命中(page);
  const 发2 = await 发短信(page);
  /* 午夜后人多半已"回卧室睡觉"，忙点直挂到早上——探针不陪它等天亮：
     把忙点拨回此刻，逼它跑一次 decide（读信那一段在 decide 最前，睡眠分支之前）。 */
  await page.evaluate(() => { const S = window.__pv.state; for (const a of S.world.agents) a.busyUntil = S.world.t; });
  const 零点后也发得出去 = await 等条件(page, async () => (await 短信命中(page)) > 命中前, 20000);
  const 命中后 = await 短信命中(page);
  const 后 = await 额度(page);
  判('④ 跨日重置：零点前那一笔发得出去；跨过零点后额度重新起算、又发得出去',
    零点前发得出去 && 零点后也发得出去 && 后.day === 前日.当日 + 1 && 后.used >= 1,
    { 发1, 发2, 零点前发得出去, 零点后也发得出去, 命中前, 命中后, 后, 前日 });
  if(红) console.log('        诊断：' + JSON.stringify(await page.evaluate(() => ({
    credits: window.__pv.state.world.credits, t: window.__pv.state.world.t,
    prompts: (window.__relayPrompts || []).slice(-6),
    尾六条: (window.__pv.state.world.log || []).slice(-6).map(e => ({ type: e.type || '', sms: e.sms || '', llm: !!e.llm, text: String(e.text || '').slice(0, 26) })),
  }))));
  /* 旧档兼容：把存档信封里的 ai 小账删掉再进 */
  const 清过 = await page.evaluate(() => {
    try {
      const k = 'citylife-save-v1';
      const s = JSON.parse(localStorage.getItem(k));
      if (s && s.meta) { delete s.meta.ai; localStorage.setItem(k, JSON.stringify(s)); return true; }
    } catch (_) {}
    return false;
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const 旧档 = await page.evaluate(() => ({ used: window.__pv.state.aiGate.used, day: window.__pv.state.aiGate.day, cap: window.__pv.AI_GATE.daily }));
  const 旧档设置行 = await 设置页额度(page);
  判('⑤ 旧档兼容：信封里没有 ai 小账 ⇒ 不崩、按满额起算（窗口里自然消耗至多 3 次）',
    清过 && 错.length === 0 && 旧档.used <= 3 && (旧档.cap - 旧档.used) >= 57,
    { 清过, 旧档, 旧档设置行 });
  判('幕C 零页错', 错.length === 0, 错.slice(0, 3));
  await ctx.close();
}

await browser.close();
srv.close();
console.log(红 ? ('成本闸·客户端侧：' + 红 + ' 条判红（图在 ' + OUT + '）') : ('成本闸·客户端侧：全绿（图在 ' + OUT + '）'));
process.exit(红 ? 1 : 0);
