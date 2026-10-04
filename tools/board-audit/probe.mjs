// 第 216 单·云港公告栏探针（真浏览器；只读诊断，进冒烟档 2）
//
// 口径：把相机对到广场公告栏那一格，**同一天、同一时刻**只切换"今天有没有活"——
//   ① 有活（挂一个当天未办的委托）：牌子右上角出一枚金色"!"（金色像素显著多于无活态）；
//      点牌子 ⇒ 弹出「⚑ 云港公告栏」，正文含"翻翻短信"；
//   ② 无活（把委托撤掉）：无金色"!"；点牌子 ⇒ 弹出兜底句"今天没什么大事"；
//   ③ 每次弹窗都能用 ✕ 关掉；全程零 pageerror。
// --改前=<git-ref>：对旧版跑同一套（第 216 单之前没有这块牌子）⇒ 点不出弹窗、探针判红（反例）。
// 用法：node tools/board-audit/probe.mjs [输出目录] [--改前=<git-ref>]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'board-audit'));
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},get PURE(){return PURE}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18969;
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

// 造场景：挑一个"日历上没事"的安静日（非周五/周日、无生日今天明天、非江灯节），相机对到公告栏。
const 布置 = () => page.evaluate(() => {
  const st = __pv.state, w = st.world, S = __pv.Sim, P = __pv.PURE;
  w.speed = 0;
  w.agents.forEach(a => { a.req = null; });
  let day = 0;
  for (let D = 1; D <= 400; D++) {
    w.t = (D - 1) * 1440 + 9 * 60 + 30;
    const wd = P.weekday(w.t);
    const 有事 = wd === 4 || wd === 6 || S.inFestival(w)
      || w.agents.some(a => S.inBirthday(w, a) || S.bdayInDays(w, a) === 1);
    if (!有事) { day = D; break; }
  }
  w.t = (day - 1) * 1440 + 9 * 60 + 30;
  const A = S.ANCHORS.board || { x: 23.4, y: 16.8 };   // 旧版没有这块牌子时也给个位置，好在同一处点空
  st.cam.manual = true; st.cam.fx = A.x; st.cam.fy = A.y;
  let 没活 = [], 没活标志 = null;                      // 旧版没有这两个函数：留空，照常往下跑、逐条判红
  try { 没活 = S.公告内容(w); 没活标志 = S.公告有活(w); } catch (e) {}
  return { day, 没活, 没活标志 };
});

// 金色"!"像素计数（判据用"有活 − 无活"的差，背景两边完全相同）
const 数金色 = () => page.evaluate(() => {
  const st = __pv.state, S = __pv.Sim;
  const A = S.ANCHORS.board || { x: 23.4, y: 16.8 };
  const s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const bx = st.view.ox + A.x * s, by = st.view.oy + A.y * s;
  const gx = bx + s * 0.5, gy = by - s * 1.0;          // 与 `画布告板()` 的金色角标同点
  const x0 = Math.max(0, Math.round((gx - s * 0.6) * dpr)), y0 = Math.max(0, Math.round((gy - s * 0.6) * dpr));
  const wp = Math.round(s * 1.2 * dpr), hp = Math.round(s * 1.2 * dpr);
  const dd = g.getImageData(x0, y0, wp, hp).data;
  let n = 0;
  for (let i = 0; i < dd.length; i += 4) {
    if (Math.abs(dd[i] - 232) <= 25 && Math.abs(dd[i + 1] - 198) <= 25 && Math.abs(dd[i + 2] - 90) <= 30) n++;
  }
  return { n, box: [x0, y0, wp, hp], s: +s.toFixed(2) };
});

const 点板子 = async () => {
  const 点 = await page.evaluate(() => {
    const st = __pv.state, s = st.view.s, A = __pv.Sim.ANCHORS.board || { x: 23.4, y: 16.8 };
    const r = document.querySelector('#cv').getBoundingClientRect();
    return { x: r.x + st.view.ox + A.x * s, y: r.y + st.view.oy + A.y * s - s * 0.5 };
  });
  await page.touchscreen.tap(点.x, 点.y).catch(async () => { await page.mouse.click(点.x, 点.y); });
  await page.waitForTimeout(350);
  return 点;
};
const 读弹窗 = () => page.evaluate(() => {
  const root = document.querySelector('#dialog-root');
  return { open: root.classList.contains('open'), 文: root.textContent.replace(/\s+/g, ' ').trim() };
});
const 关弹窗 = async () => {
  await page.click('#dialog-root [data-close]').catch(() => {});
  await page.waitForTimeout(250);
  return 读弹窗();
};

const 安静 = await 布置();
await page.waitForTimeout(500);
const 无活 = await 数金色();
await page.screenshot({ path: path.join(OUT, '无活.png') });

// ① 有活：挂一个"今天未办"的委托
await page.evaluate(() => {
  const w = __pv.state.world, P = __pv.PURE;
  w.agents[0].req = { day: P.dayOf(w.t), ok: false, done: false };
});
await page.waitForTimeout(500);
const 有活 = await 数金色();
await page.screenshot({ path: path.join(OUT, '有活.png') });
await 点板子();
const 弹1 = await 读弹窗();
await page.screenshot({ path: path.join(OUT, '有活-弹窗.png') });
const 关1 = await 关弹窗();

// ② 无活：把委托撤掉，同一场景再点一次
await page.evaluate(() => { __pv.state.world.agents.forEach(a => { a.req = null; }); });
await page.waitForTimeout(500);
const 无活2 = await 数金色();
await 点板子();
const 弹2 = await 读弹窗();
await page.screenshot({ path: path.join(OUT, '无活-弹窗.png') });
const 关2 = await 关弹窗();

const 差 = 有活.n - 无活.n;
const 判 = [
  ['安静日找到（D' + 安静.day + '）且无活时是兜底句', 安静.day > 0 && 安静.没活标志 === false && 安静.没活.length === 1 && 安静.没活[0].indexOf('今天没什么大事') === 0],
  ['有活·金色"!"多于无活（' + 有活.n + ' − ' + 无活.n + ' = ' + 差 + '；判据 ≥20）', 差 >= 20 && 无活.n <= 5],
  ['有活·弹窗含「云港公告栏」与"翻翻短信"', 弹1.open && 弹1.文.indexOf('云港公告栏') >= 0 && 弹1.文.indexOf('翻翻短信') >= 0],
  ['有活·✕ 关得掉', !关1.open],
  ['无活·弹窗是兜底句、且不含"翻翻短信"', 弹2.open && 弹2.文.indexOf('今天没什么大事') >= 0 && 弹2.文.indexOf('翻翻短信') < 0],
  ['无活·✕ 关得掉', !关2.open],
  ['零 pageerror', 错.length === 0],
];
let 过 = true;
for (const [名, 值] of 判) { if (!值) 过 = false; console.log((值 ? ' ok ' : ' FAIL') + ' ' + 名); }
console.log('报表与截图：' + OUT + (错.length ? ('\n页错：' + 错.join(' | ')) : ''));
await browser.close(); srv.close();
process.exit(过 ? 0 : 1);
