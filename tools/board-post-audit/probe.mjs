// 第 217 单·玩家留言进板探针（真浏览器；只读诊断，进冒烟档 2）
//
// 口径：① 先在页面里真发一条短信（`Sim.sendMessage`），再点开广场公告栏 ⇒ 弹窗里出现
//      "把你的话也贴上去：给X的「…」"；② 点那一行 ⇒ 弹窗刷新成"板上贴着你写的「…」"，
//      且 `world.boardNote` 记下原句；③ 把一位住户摆到广场、调 `boardStep` ⇒ 日志里
//      恰一条"路过广场…「原句」"，再调一次不再重复；④ 全程零 pageerror。
// --改前=<git-ref>：对第 217 单之前的版本跑同一套（公告栏还没有"贴一句"）⇒ 点不出、判红。
// 用法：node tools/board-post-audit/probe.mjs [输出目录] [--改前=<git-ref>]  （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'board-post-audit'));
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},get PURE(){return PURE}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18970;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 440, height: 744 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push(String(e && e.message || e)));
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(2200);

// 先发一条短信（用游戏自己的发送入口）——板子上才有"你今天发过的话"可贴
const 标签 = await page.evaluate(() => {
  const st = __pv.state, w = st.world, S = __pv.Sim;
  w.speed = 0;
  const A = S.ANCHORS.board || { x: 23.4, y: 16.8 };
  st.cam.manual = true; st.cam.fx = A.x; st.cam.fy = A.y;   // 相机对到公告栏，好点它
  const m = S.MSGS.find(x => x.id === 'cheer');
  S.sendMessage(w, 'a1', 'cheer');
  return m.label;
});
await page.waitForTimeout(500);   // 等一帧把镜头移到公告栏后再算点击点

// 点开公告栏（与 board-audit 同一套点位）
const 点板子 = async () => {
  const 点 = await page.evaluate(() => {
    const st = __pv.state, s = st.view.s, A = __pv.Sim.ANCHORS.board || { x: 23.4, y: 16.8 };
    const r = document.querySelector('#cv').getBoundingClientRect();
    return { x: r.x + st.view.ox + A.x * s, y: r.y + st.view.oy + A.y * s - s * 0.5 };
  });
  await page.touchscreen.tap(点.x, 点.y).catch(async () => { await page.mouse.click(点.x, 点.y); });
  await page.waitForTimeout(350);
};
const 读弹窗 = () => page.evaluate(() => {
  const root = document.querySelector('#dialog-root');
  return { open: root.classList.contains('open'), 文: root.textContent.replace(/\s+/g, ' ').trim() };
});
// 红图钉像素计数（判据用"贴前 vs 贴后"的差；与 `画布告板()` 的钉位同点）
const 数红钉 = () => page.evaluate(() => {
  const st = __pv.state, S = __pv.Sim;
  const A = S.ANCHORS.board || { x: 23.4, y: 16.8 };
  const s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const bx = st.view.ox + A.x * s, by = st.view.oy + A.y * s;
  const px = bx - s * 0.01, py = by - s * 0.88;
  const x0 = Math.max(0, Math.round((px - s * 0.4) * dpr)), y0 = Math.max(0, Math.round((py - s * 0.4) * dpr));
  const wp = Math.round(s * 0.8 * dpr), hp = Math.round(s * 0.8 * dpr);
  const dd = g.getImageData(x0, y0, wp, hp).data;
  let n = 0;
  for (let i = 0; i < dd.length; i += 4) {
    if (Math.abs(dd[i] - 192) <= 45 && Math.abs(dd[i + 1] - 57) <= 45 && Math.abs(dd[i + 2] - 43) <= 45) n++;
  }
  return { n, box: [x0, y0, wp, hp] };
});

const 钉前 = await 数红钉();
await 点板子();
const 弹1 = await 读弹窗();
await page.screenshot({ path: path.join(OUT, '弹窗-可贴.png') });
const 按钮 = await page.$$eval('#dialog-root [data-post]', els => els.map(e => e.textContent.trim()));
let 弹2 = { open: false, 文: '' }, 状态 = null;
if (await page.$('#dialog-root [data-post]')) {
  await page.click('#dialog-root [data-post]');
  await page.waitForTimeout(350);
  弹2 = await 读弹窗();
  状态 = await page.evaluate(() => {
    const n = __pv.state.world.boardNote;
    return n && typeof n === 'object' && !Array.isArray(n) ? { txt: n.txt, toName: n.toName, read: !!n.read } : null;
  });
}
await page.screenshot({ path: path.join(OUT, '弹窗-已贴.png') });
await page.click('#dialog-root [data-close]').catch(() => {});
await page.waitForTimeout(300);
const 钉后 = await 数红钉();
await page.screenshot({ path: path.join(OUT, '关窗-有贴.png') });

// 一贴一读：把一位住户摆到广场，调 boardStep 两次
const 读反应 = await page.evaluate(() => {
  const st = __pv.state, w = st.world, S = __pv.Sim;
  if (typeof S.boardStep !== 'function') return { 一: -1, 二: -1, 行: [] };
  w.t = 9 * 1440 + 10 * 60;
  w.agents.forEach((a, i) => { a.anchor = i === 0 ? 'market' : 'bed1'; });
  const n0 = w.log.length;
  S.boardStep(w);
  const 一 = w.log.slice(n0).filter(e => String(e.text || '').indexOf('路过广场') === 0);
  const n1 = w.log.length;
  S.boardStep(w);
  const 二 = w.log.slice(n1).filter(e => String(e.text || '').indexOf('路过广场') === 0);
  return { 一: 一.length, 二: 二.length, 行: 一.map(e => e.text) };
});

const 判 = [
  ['点开公告栏（弹窗含「云港公告栏」）', 弹1.open && 弹1.文.indexOf('云港公告栏') >= 0],
  ['贴一句入口列出你今天发的那条（' + JSON.stringify(按钮) + '）', 按钮.length === 1 && 按钮[0].indexOf(标签) >= 0],
  ['点它 ⇒ 弹窗刷新为"板上贴着你写的「' + 标签 + '」"', 弹2.open && 弹2.文.indexOf('板上贴着你写的') >= 0 && 弹2.文.indexOf('「' + 标签 + '」') >= 0],
  ['world.boardNote 记下原句', !!状态 && 状态.txt === 标签],
  ['贴上之后板上看得见记号（红图钉 ' + 钉后.n + ' vs 贴前 ' + 钉前.n + '；判据 ≥15）', 钉后.n >= 15 && 钉前.n <= 5],
  ['一贴一读：恰一条"路过广场…「原句」"（' + JSON.stringify(读反应.行) + '）', 读反应.一 === 1 && 读反应.二 === 0 && 读反应.行.every(t => t.indexOf('「' + 标签 + '」') >= 0)],
  ['零 pageerror', 错.length === 0],
];
let 过 = true;
for (const [名, 值] of 判) { if (!值) 过 = false; console.log((值 ? ' ok ' : ' FAIL') + ' ' + 名); }
console.log('报表与截图：' + OUT + (错.length ? ('\n页错：' + 错.join(' | ')) : ''));
await browser.close(); srv.close();
process.exit(过 ? 0 : 1);
