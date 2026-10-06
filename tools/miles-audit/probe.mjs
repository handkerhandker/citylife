// 第 131 单·云港手账探针（真浏览器；只读诊断，进冒烟档 2）
//
// 判据：① 开局手账卡在（21 条、0/21；第 274 单四期 +1＝漂流瓶）；② 发一条短信 →（等回音落定）小账 sms≥1、replies≥1，
// 卡上也勾上那两条；③ 刷新 → 小账不重不漏（值与刷新前一致，**不翻倍**）；
// ④ 第 237 单·二期：打一通电话／回一次主意／捎一句话／收藏一张卡 ⇒ 三本小账各 +1、
//    四条新里程碑逐条打勾（"收藏满十张"仍空）；全程零 pageerror。
// 用法：node tools/miles-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'miles-audit'));
fs.mkdirSync(OUT, { recursive: true });
/* --改前=<git-ref>：对旧版跑同一套（第 237 单二期之前＝10 条、没有三本新小账）⇒ 判红。 */
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const raw = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state},get Sim(){return Sim},get PURE(){return PURE}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18955;   // 第 270 单批后自查：原 18953 与 bubble-audit/probe.mjs 撞车 ⇒ 改号
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const 读数 = p => p.evaluate(() => ({
  小账: JSON.parse(JSON.stringify(window.__pv.state.miles)),
  枚数: (document.querySelectorAll('#mile-list li') || []).length,
  计数: (document.querySelector('#mile-count') || {}).textContent || '',
  勾: [...document.querySelectorAll('#mile-list li')].filter(li => li.textContent.trim().startsWith('✓')).length,
}));
const 等 = async (p, fn, 上限 = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < 上限) { if (await fn()) return true; await p.waitForTimeout(300); } return false; };

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push('pageerror: ' + (e && e.message || e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const u = (m.location() && m.location().url) || '';
  if (/favicon|\/relay|net::ERR/.test(u) || /Failed to load resource|CORS|Failed to fetch|api\.anthropic/i.test(m.text())) return;
  错.push('console: ' + m.text().slice(0, 120));
});
const 断言 = [];
const 判 = (名, 好, 读数_) => { 断言.push({ 名, 好, 读数_ }); console.log((好 ? ' ok  ' : ' FAIL ') + 名 + '  ' + JSON.stringify(读数_)); };

await page.goto(URL_, { waitUntil: 'load' });
await page.waitForTimeout(800);
await page.click('button.tab[data-tab="roles"]');
await page.waitForTimeout(400);
let R = await 读数(page);
判('① 开局：手账卡 21 条、计数 0/21、小账清零',
  R.枚数 === 21 && R.计数 === '0/21' && R.小账.sms === 0 && R.小账.replies === 0, R);
await page.click('button.tab[data-tab="phone"]');
await page.waitForSelector('#ph-msgs button[data-msg]:not([disabled])', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(200);
await page.click('#ph-msgs button[data-msg]');
const 到了 = await 等(page, async () => {
  const x = await page.evaluate(() => window.__pv.state.miles);
  return x.sms >= 1 && x.replies >= 1;
}, 25000);
await page.click('button.tab[data-tab="roles"]');
await page.waitForTimeout(400);
R = await 读数(page);
判('② 发一条并等到回音：小账 sms≥1、replies≥1，卡上勾 ≥2',
  到了 && R.小账.sms >= 1 && R.小账.replies >= 1 && R.勾 >= 2, R);
const 刷新前 = { sms: R.小账.sms, replies: R.小账.replies };
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(900);
R = await 读数(page);
判('③ 刷新：小账不重不漏（与刷新前一致、不翻倍）',
  R.小账.sms === 刷新前.sms && R.小账.replies === 刷新前.replies, { 刷新前, 刷新后: R.小账 });

// ④ 第 237 单·手账二期：把新玩法各做一次 ⇒ 三本小账各 +1、四条新里程碑打勾
{
  await page.evaluate(() => {
    const st = window.__pv.state, w = st.world, S = window.__pv.Sim, P = window.__pv.PURE;
    w.speed = 0; w.credits = 3;
    const a1 = w.agents.find(a => a.id === 'a1');
    a1.activity = { type: 'idle', label: '在家歇着' }; a1.energy = 100; a1.hunger = 0;   // 带 label（坏档闸的硬要求；裸对象会让角色卡印 undefined）
    a1.req = { day: P.dayOf(w.t), ok: false, done: false, kind: 'pick', qi: 0 };
  });
  await page.click('button.tab[data-tab="phone"]'); await page.waitForTimeout(300);
  await page.click('#ph-agents [data-to="a1"]'); await page.waitForTimeout(200);
  // 回主意
  await page.click('#ph-ask [data-pick="0"]'); await page.waitForTimeout(250);
  // 打一通电话：点开场＋两轮选项＋挂断（生疏档两轮）
  await page.click('#ph-call'); await page.waitForTimeout(250);
  await page.click('#dialog-root [data-opt="day"]'); await page.waitForTimeout(150);
  await page.click('#dialog-root [data-opt="dinner"]'); await page.waitForTimeout(150);
  await page.click('#dialog-root [data-hang]'); await page.waitForTimeout(250);
  await page.click('#dialog-root [data-close]'); await page.waitForTimeout(150);
  // 捎一句话：a1 托你带给 a2
  await page.evaluate(() => {
    const w = window.__pv.state.world, P = window.__pv.PURE;
    w.agents.find(a => a.id === 'a1').req = { day: P.dayOf(w.t), ok: false, done: false, kind: 'deliver', to: 'a2', line: '帮你留了个门。' };
  });
  await page.click('#ph-agents [data-to="a2"]'); await page.waitForTimeout(200);
  await page.click('#ph-ask [data-deliver="1"]'); await page.waitForTimeout(250);
  // 收藏一张卡
  await page.evaluate(() => {
    const w = window.__pv.state.world;
    w.clips.push({ d: 9, wd: 1, id: 'a1', name: '顾云帆', score: 2.0, base: 10, full: true,
      items: [{ id: 'sit_flat', k: 2.0, v: { from: '阳台', tx: '测试' } }],
      q: [{ t: 8 * 1440 + 600, name: '顾云帆', text: '测试原文', type: 'act' }], sc: { a1: 2.0 } });
  });
  await page.click('button.tab[data-tab="clip"]'); await page.waitForTimeout(300);
  await page.click('#clip-list [data-keep]'); await page.waitForTimeout(250);
  // 让世界走一小段（手账在换拍时结算）
  await page.evaluate(() => { window.__pv.state.world.speed = 1; });
  const 记账了 = await 等(page, async () => {
    const m = await page.evaluate(() => window.__pv.state.miles);
    return m.calls >= 1 && m.delivers >= 1 && m.picks >= 1;
  }, 25000);
  await page.click('button.tab[data-tab="roles"]'); await page.waitForTimeout(400);
  const R2 = await 读数(page);
  const 条 = await page.evaluate(() => [...document.querySelectorAll('#mile-list li')].map(li => li.textContent.trim()));
  const 勾 = 名 => 条.some(t => t.indexOf('✓ ' + 名) === 0);
  const keeps = await page.evaluate(() => (window.__pv.state.keeps || []).length);
  判('④ 二期：电话／主意／捎话／收藏各记一笔、四条新里程碑逐条打勾',
    记账了 && R2.小账.calls >= 1 && R2.小账.delivers >= 1 && R2.小账.picks >= 1 && keeps >= 1
    && 勾('打过第一通电话') && 勾('替人拿过一次主意') && 勾('帮人捎过一句话') && 勾('收藏第一张剪辑卡')
    && !勾('收藏满十张'),
    { calls: R2.小账.calls, delivers: R2.小账.delivers, picks: R2.小账.picks, keeps, 计数: R2.计数 });
  await page.screenshot({ path: path.join(OUT, '手账-二期.png'), fullPage: true });
}
await ctx.close(); await browser.close(); srv.close();
const 红 = 断言.filter(x => !x.好).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ 断言, 错 }, null, 2), 'utf8');
console.log('云港手账探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报错 ' + 错.length + '；报表在 ' + OUT);
process.exit(红 || 错.length ? 1 : 0);
