// 第 139 单·雨天撑伞 实机取证（真浏览器；只读诊断，进冒烟档 2）
//
// 量什么（像素判据走"代表色计数"，与精灵动画相位无关——伞面是不透明覆盖层）：
//   ① 雨·户外：沈小满（a2，代表色 #d9a0b8）在街上 ⇒ 该色像素 >30（伞画上了）；
//   ② 雨·室内：把她挪回客厅 ⇒ 0（室内不打伞）；
//   ③ 晴·户外：同①位置、不下雨 ⇒ 0；
//   ④ 像素画风关掉（色块兜底路）·雨·户外 − 晴·户外 >30（兜底路同样撑伞）；
//   ⑤ 重复① ⇒ 计数与①相同（稳定性）；
//   ⑥ 「原样」截图一张（雨幕开着、reduceMotion 不强制）供目验。
// 旧版对照（--改前=<git-ref>）：同一场景跑一遍 ⇒ 三个场景全为 0（证明"伞"是新增的、且只在雨+户外出现）。
//
// 保真度：画的都是生产的 draw()；脚本只摆姿势（位置/天气/时钟冻结/相机），不碰渲染代码。
// 用法：node tools/umbrella/shots.mjs <输出目录> [--改前=<git-ref>]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', new Date().toISOString().slice(0, 10), 'umbrella'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const PORT = 18959;
fs.mkdirSync(OUT, { recursive: true });

const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},get pix(){return pix}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const 色 = { 伞面: [0x64, 0x7d, 0x9e] };   // 伞面固定灰蓝 #647d9e（代表色已改成"伞沿＋伞尖"的强调条，不作判据色）
const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const 错 = [];
const 读数 = { 改前基线: BEFORE || '（工作区当前版本）', 场景: {}, 红: 0 };

async function 开页() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => 错.push(String(e && e.message || e)));
  await page.goto(URL_); await page.waitForTimeout(2400);
  return page;
}
const 摆 = (page, 雨, 位, 像素开, 减动效 = true) => page.evaluate(([rain, pos, pixOn, rm]) => {
  const st = __pv.state, w = st.world;
  w.speed = 0; st.llm.on = false; st.reduceMotion = rm;
  w.t = 720;                                   // D1 正午：天光罩层"白天完全不盖"（第 33 单口径），颜色判据才干净
  __pv.pix.on = pixOn;
  w.weather.rain = rain; if (rain) w.weather.until = w.t + 99999;
  const a2 = w.agents.find(a => a.id === 'a2'), v2 = st.vis.a2;
  v2.x = v2.dspX = pos[0]; v2.y = v2.dspY = pos[1]; v2.path = []; v2.moving = false; v2.dir = 3;
  a2.activity = { type: 'idle', label: '在家待着', think: '' };
  w.agents.filter(a => a.id !== 'a2').forEach((a, i) => {
    const vv = st.vis[a.id];
    vv.x = vv.dspX = 5.5; vv.y = vv.dspY = 6 + i * 0.6; vv.path = []; vv.moving = false;
    a.activity = { type: 'idle', label: '在家待着', think: '' };
  });
  st.selected = 'a1';
  st.cam.manual = true; st.cam.fx = pos[0]; st.cam.fy = pos[1];
}, [雨, 位, 像素开, 减动效]);
const 数色 = (page, rgb) => page.evaluate(([r, g, b]) => {
  const cv = document.querySelector('#cv'), ctx2 = cv.getContext('2d');
  const d = ctx2.getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === b && d[i + 3] === 255) n++;
  return n;
}, rgb);
async function 截图(page, 名, 位) {
  const clip = await page.evaluate((pos) => {
    const r = document.querySelector('#cv').getBoundingClientRect(), v = __pv.state.view, s = v.s;
    return { x: Math.max(0, Math.round(r.x + v.ox + (pos[0] - 3.5) * s)), y: Math.max(0, Math.round(r.y + v.oy + (pos[1] - 6) * s)),
             width: Math.round(8 * s), height: Math.round(10 * s) };
  }, 位);
  await page.screenshot({ path: path.join(OUT, 名 + '.png'), clip });
}

const 户外 = [16, 14], 室内 = [6, 8];
const page = await 开页();
const pre = BEFORE ? '改前-' : '';
// ① 雨·户外
await 摆(page, true, 户外, true); await page.waitForTimeout(420);
const c1 = await 数色(page, 色.伞面); await 截图(page, pre + '①雨-户外', 户外);
// ② 雨·室内
await 摆(page, true, 室内, true); await page.waitForTimeout(420);
const c2 = await 数色(page, 色.伞面); await 截图(page, pre + '②雨-室内', 室内);
// ③ 晴·户外
await 摆(page, false, 户外, true); await page.waitForTimeout(420);
const c3 = await 数色(page, 色.伞面); await 截图(page, pre + '③晴-户外', 户外);
// ④ 像素关：雨 vs 晴（色块兜底路）
await 摆(page, true, 户外, false); await page.waitForTimeout(420);
const c4a = await 数色(page, 色.伞面); await 截图(page, pre + '④兜底-雨-户外', 户外);
await 摆(page, false, 户外, false); await page.waitForTimeout(420);
const c4b = await 数色(page, 色.伞面);
// ⑤ 重复①（稳定性）
await 摆(page, true, 户外, true); await page.waitForTimeout(420);
const c5 = await 数色(page, 色.伞面);
// ⑥ 原样截图（雨幕开）
await 摆(page, true, 户外, true, false); await page.waitForTimeout(420);
await 截图(page, pre + '⑥雨-户外-原样', 户外);
await page.close();
await browser.close(); srv.close();

读数.场景 = { '①雨户外': c1, '②雨室内': c2, '③晴户外': c3, '④兜底雨户外': c4a, '④兜底晴户外': c4b, '⑤重复雨户外': c5 };
const 判 = (名, ok) => { 读数.场景[名 + '·判定'] = ok ? '✓' : '✗'; if (!ok) 读数.红++; console.log((ok ? ' ok  ' : ' FAIL ') + 名 + '：' + JSON.stringify(读数.场景)); };
if (BEFORE) {
  判('改前·三场景全 0（伞是新画的）', c1 === 0 && c2 === 0 && c3 === 0);
} else {
  判('① 雨·户外 画了伞（>10）', c1 > 10);
  判('② 雨·室内 不画（=0）', c2 === 0);
  判('③ 晴·户外 不画（=0）', c3 === 0);
  判('④ 兜底路：雨比晴多 >10（同样撑伞）', (c4a - c4b) > 10);
  判('⑤ 重复① 稳定（计数相同）', c5 === c1);
}
判('全程零 pageerror', 错.length === 0);
fs.writeFileSync(path.join(OUT, (BEFORE ? '改前-' : '') + '读数.json'), JSON.stringify(读数, null, 2), 'utf8');
console.log('\n' + (BEFORE ? '改前对照' : '雨伞取证') + '：' + 读数.红 + ' 条不过；出图与读数在 ' + OUT);
process.exit(读数.红 ? 1 : 0);
