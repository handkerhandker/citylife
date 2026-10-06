// AI 链路联调（mock 中转站；真浏览器，进冒烟档 2）
// 第 128 单立：短信回信的五幕；第 130 单加测：⑥对白 ⑦日记 ⑧AI 在途时半途刷新。
//
// 为什么做：项目一直登记着"浸泡压不到真 AI（本地没中转线路）"这条盲区。本工具用 Playwright 的
// `page.route` 把 `/relay` 换成 mock（直连一律 abort，模拟"直连被拦截"这条最常见现场），八幕联调：
//   ① 成功：mock 回合法 JSON ⇒ 已读条目被 AI 内心覆盖（llm=true）＋ 追加一条「回了你的短信」（llm=true）；
//   ② 返回非 JSON ⇒ 回退模板、不追回信、零报错；③ 中转站 500 ⇒ 同上；
//   ④ 回信以语气词起手（"嘿…"）⇒ 客户端自动重写一次（第二次请求），最终落重写版；
//   ⑤ 短信那条提示词挂住 ⇒ 15 秒死线后回退模板＋落一条「AI 连线失败」系统提示（其它任务给合法包）；
//   ⑥ 对白：mock 回 `{dialogue,a_mem,b_mem}` ⇒ 对白落上墙（llm=true）＋两人各记一笔「记在心里」；
//   ⑦ 日记：把时钟推到 21:51 让"夜深了"那一轮触发 ⇒ 四段日记都换成 mock 文本（llm=true）；
//   ⑧ AI 在途时半途刷新：mock 挂住 → 发短信 → 在途（llmPending=true）→ reload ⇒ 回来后**没有任何
//      在途标残留**、那条落回兜底句、并按"读掉了却没等到回信"补一条「已读不回」。
// 边界（照实登记）：这是**协议层**联调——真中转站（真网络＋真模型）仍不在本机能力内。
// 用法：node tools/llm-audit/relay-mock.mjs [输出目录] [只跑某一幕，如 "⑥"]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'llm-audit'));
fs.mkdirSync(OUT, { recursive: true });
const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18952;   // 第 270 单批后自查：原 18950 与 live-walkgate/audit.mjs 撞车 ⇒ 改号
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
const 回退判据 = async p => {
  const L = await 读日志(p);
  const 读 = L.filter(e => e.sms === 'read');
  return 读.length > 0 && 读.every(e => !e.pending) && 读.every(e => !e.llm)
    && !L.some(e => e.sms === 'reply' && e.llm)
    && (L.some(e => e.text.includes('AI 连线失败')) || !!(await p.evaluate(() => window.__pv.state.llm.lastErr)));
};
// 默认驱动：进短信页 → 发一条 → 等"发出去了"
const 默认驱动 = async p => {
  await p.click('button.tab[data-tab="phone"]').catch(() => {});
  await p.waitForSelector('#ph-msgs button[data-msg]:not([disabled])', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(200);
  await p.click('#ph-msgs button[data-msg]').catch(() => {});
  const 发出了 = await 等条件(p, async () => (await 读日志(p)).some(e => e.sms === 'out'), 8000);
  return 发出了;
};

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const 报表 = [];
const 只跑 = process.argv[3] || '';
async function 一幕(名, 应答, 检查, 驱动) {
  if (只跑 && 名.indexOf(只跑) < 0) return;
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript(() => { window.__relayHits = 0; window.__relayPrompts = []; });
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
    const hits = await page.evaluate(() => ++window.__relayHits);
    let prompt = '';
    try { prompt = String((r.request().postDataJSON() || {}).prompt || ''); } catch (_) {}
    await page.evaluate(x => { window.__relayPrompts.push(x); }, prompt.replace(/\s+/g, ' ').slice(0, 60)).catch(() => {});
    const 回 = 应答(hits, prompt);
    if (回 === 'HANG') return;
    await r.fulfill({ status: 回.status || 200, contentType: 'application/json', body: JSON.stringify(回.body) });
  });
  await page.goto(URL_, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(900);
  const 驱好 = await (驱动 || 默认驱动)(page);
  const 好 = (await 检查(page)) && 驱好 !== false;
  const hits = await page.evaluate(() => window.__relayHits);
  const 诊断 = 好 ? null : await page.evaluate(() => ({
    llm: JSON.parse(JSON.stringify(window.__pv.state.llm)),
    prompts: (window.__relayPrompts || []).slice(0, 8),
    聊天条: (window.__pv.state.world.log || []).filter(e => e.type === 'chat').map(e => ({ llm: !!e.llm, text: String(e.text || '').slice(0, 30) })).slice(-4),
    日志: (window.__pv.state.world.log || []).slice(-6).map(e => ({
      type: e.type || '', sms: e.sms || '', llm: !!e.llm, pending: !!e.llmPending,
      text: String(e.text || '').slice(0, 40), thought: String(e.thought || '').slice(0, 40),
    })),
  })).catch(() => null);
  await ctx.close();
  const 过 = 好 && 错.length === 0;
  报表.push({ 名, 好: 过, relay命中: hits, 错 });
  console.log((过 ? ' ok  ' : ' FAIL ') + 名 + `（relay 命中 ${hits} 次，报错 ${错.length}）`);
  if (!过 && 错.length) console.log('        ' + 错.slice(0, 3).join(' ; '));
  if (!过 && 诊断) console.log('        诊断：' + JSON.stringify(诊断));
}

await 一幕('① 成功（mock 回 JSON）',
  () => ({ body: { text: JSON.stringify({ inner: '（mock 内心）这号码又来了。', reply: '收到，我这就去。' }) } }),
  async p => 等条件(p, async () => {
    const L = await 读日志(p);
    return L.some(e => e.sms === 'reply' && e.thought.includes('收到，我这就去。') && e.llm)
      && L.some(e => e.sms === 'read' && e.thought.includes('（mock 内心）') && e.llm);
  }));
await 一幕('② 返回非 JSON', () => ({ body: { text: '抱歉，我不太会回答这个。' } }), async p => 等条件(p, () => 回退判据(p), 25000));
await 一幕('③ 中转站 500', () => ({ status: 500, body: { error: 'boom' } }), async p => 等条件(p, () => 回退判据(p), 25000));
await 一幕('④ 语气词起手→重写',
  h => h === 1
    ? ({ body: { text: JSON.stringify({ inner: '（mock 一版）嗯。', reply: '嘿，我这就去。' }) } })
    : ({ body: { text: JSON.stringify({ inner: '（mock 二版）好。', reply: '（重写版）好，去了。' }) } }),
  async p => 等条件(p, async () => {
    const L = await 读日志(p);
    return L.some(e => e.sms === 'reply' && e.thought.includes('（重写版）')) && (await p.evaluate(() => window.__relayHits)) >= 2;
  }));
await 一幕('⑤ 短信链路挂住（15s 超时）',
  (hits, prompt) => {
    if (/刚发来/.test(prompt)) return 'HANG';
    if (/"dialogue"/.test(prompt)) return { body: { text: JSON.stringify({ dialogue: ['嗯。', '好。'], a_mem: '', b_mem: '' }) } };
    return { body: { text: JSON.stringify({}) } };
  },
  async p => 等条件(p, async () => {
    const L = await 读日志(p), S = await p.evaluate(() => window.__pv.state.llm);
    return L.some(e => e.text.includes('AI 连线失败')) && !L.some(e => e.sms === 'reply' && e.llm)
      && L.some(e => e.sms === 'read' && !e.llm) && S.pending === 0 && !/思考中/.test(S.status);
  }, 60000));

// ⑥ 对白：mock 回干净 dialogue ＋ 两条"记在心里"
const 通用对白应答 = (hits, prompt) => {
  if (/"dialogue"/.test(prompt)) {
    return { body: { text: JSON.stringify({ dialogue: ['（mock）甲句。', '（mock）乙句。'], a_mem: '（mock）a记一笔', b_mem: '（mock）b记一笔' }) } };
  }
  return { body: { text: JSON.stringify({}) } };
};
const 驱动对白 = async page => {
  const 有 = await page.evaluate(() => {
    const Sim = window.__pv.Sim, w = window.__pv.state.world;
    for (let i = 0; i < 400; i++) { Sim.step(w, 10); if (w.log.some(e => e.type === 'chat' && !e.llm)) return true; }
    return w.log.some(e => e.type === 'chat');
  });
  return 有;
};
await 一幕('⑥ 对白（dialogue＋记在心里）', 通用对白应答,
  async p => 等条件(p, async () => {
    const L = await 读日志(p);
    const 记忆 = await p.evaluate(() => window.__pv.state.world.agents
      .flatMap(a => (a.personalLog || []).map(e => String(e.thought || '')))
      .some(x => x.includes('（mock）a记一笔') || x.includes('（mock）b记一笔')));
    // 对白落的是 **thought**（`e.text` 保持"和谁聊了几句"那行摘要）——第一版看错字段，是工具的坑
    return L.some(e => e.type === 'chat' && e.llm && e.thought.includes('（mock）甲句。')) && 记忆;
  }, 30000), 驱动对白);

// ⑦ 日记：把时钟推到 REFLECT_MIN 之后，让"夜深了"那一轮触发
const 驱动日记 = async page => {
  await page.evaluate(() => {
    const S = window.__pv.state, w = S.world;
    const day = 3;
    w.t = (day - 1) * 1440 + window.__pv.Sim.REFLECT_MIN + 1;
    S.lastReflectDay = day - 1;
  });
  return true;
};
await 一幕('⑦ 日记（四段）',
  (hits, prompt) => {
    if (/四位合租住户各写一段睡前日记/.test(prompt)) {
      return { body: { text: JSON.stringify({ a1: '（mock）日记一。', a2: '（mock）日记二。', a3: '（mock）日记三。', a4: '（mock）日记四。' }) } };
    }
    if (/"dialogue"/.test(prompt)) return 通用对白应答(hits, prompt);
    return { body: { text: JSON.stringify({}) } };
  },
  async p => 等条件(p, async () => {
    const L = await 读日志(p);
    const 日记 = L.filter(e => e.type === 'diary');
    return 日记.length >= 4 && 日记.slice(-4).every(e => e.llm && e.thought.includes('（mock）日记'));
  }, 30000), 驱动日记);

// ⑧ AI 在途时半途刷新：孤儿收尾（清在途标＋回落兜底＋补一条已读不回）
const 驱动半途刷新 = async page => {
  await page.click('button.tab[data-tab="phone"]').catch(() => {});
  await page.waitForSelector('#ph-msgs button[data-msg]:not([disabled])', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(200);
  await page.click('#ph-msgs button[data-msg]').catch(() => {});
  const 在途 = await 等条件(page, async () => (await 读日志(page)).some(e => e.sms === 'read' && e.pending), 15000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  return 在途;
};
await 一幕('⑧ 在途刷新（孤儿收尾）',
  (hits, prompt) => {
    if (/刚发来/.test(prompt)) return 'HANG';
    if (/"dialogue"/.test(prompt)) return { body: { text: JSON.stringify({}) } };
    return { body: { text: JSON.stringify({}) } };
  },
  async p => 等条件(p, async () => {
    const L = await 读日志(p);
    return L.every(e => !e.pending)
      && L.some(e => e.sms === 'read' && !e.llm)
      && L.some(e => e.sms === 'noreply');
  }, 15000), 驱动半途刷新);

await browser.close(); srv.close();
const 红 = 报表.filter(r => !r.好).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(报表, null, 2), 'utf8');
console.log('AI 链路联调：' + 红 + ' 幕不过 / 共 ' + 报表.length + ' 幕；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
