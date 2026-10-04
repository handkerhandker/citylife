// 冬日间歇飘雪探针（真浏览器；只读诊断。第 163 单立，进冒烟档 2）
//
// 量什么：**画面顶部天空带**（canvas 0..110px 全宽）里的"白色雪花像素"数——
//   判据色 [r>200 且 g>200 且 b>200]（雪花 235,240,250 叠底后仍基本全亮；
//   地图元素在天空带外、室内矩也被裁剪）。
//   场景：冬（D300）——① **雪窗内**（相位 <50s，10 帧）② **雪窗外**（相位 60–130s，10 帧）
//   ③ 夏（D120）窗内对照。判据：冬窗内 ≥ 60 且 冬窗外 ≤ 10 且 夏 ≤ 10 且零 pageerror。
//   等窗用页面 performance.now()/1000 % 140 轮询（确定性周期，必到）。
// 用法：node tools/snow-audit/probe.mjs [输出目录]        （要 CITYLIFE_CHROME）
//   对照跑旧版：--改前=<git-ref>（旧版无雪 ⇒ 冬窗内也 ≈0 ⇒ 判红）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'snow-audit'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
fs.mkdirSync(OUT, { recursive: true });

const raw = BEFORE
  ? execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:city-life-framework.html`], { maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }

const PORT = 18966;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const 错 = [];
page.on('pageerror', e => 错.push('pageerror: ' + ((e && e.message) || e)));
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html?seed=20261004`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

/* 量"动的白"：雪花在飘（帧间白像素集合的对称差大）；地图里的静态白元素不动。
   全画布、白色判据 [r>200 且 g>200 且 b>200]。 */
const 数雪 = () => page.evaluate(() => {
  const cv = document.querySelector('#cv');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const 白 = new Set();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) 白.add(i);
  }
  let 对称差 = 0;
  if (window.__prev白) {
    for (const k of 白) if (!window.__prev白.has(k)) 对称差++;
    for (const k of window.__prev白) if (!白.has(k)) 对称差++;
  }
  window.__prev白 = 白;
  return 对称差;
});
const 等窗 = async (想要) => {
  for (let i = 0; i < 400; i++) {
    const p = await page.evaluate(() => (performance.now() / 1000) % 140);
    if ((想要 === 'in' && p > 6 && p < 44) || (想要 === 'out' && p > 60 && p < 130)) return p;
    await page.waitForTimeout(500);
  }
  return -1;
};
const 摆冬夏 = async (天) => {
  await page.evaluate((天) => {
    const st = __pv.state, w = st.world;
    w.speed = 0; w.t = (天 - 1) * 1440 + 12 * 60; w.weather.rain = false; st.llm.on = false; st.reduceMotion = false;
    st.cam.manual = true; st.cam.fx = 24; st.cam.fy = 15;
  }, 天);
  await page.waitForTimeout(1200);
};
const 采N = async (n) => { let 合 = 0; for (let i = 0; i < n; i++) { 合 += await 数雪(); await page.waitForTimeout(300); } return 合 / n; };   // 均值/帧

await 摆冬夏(300);                       // 冬
await 等窗('in');
const 冬内 = await 采N(24);
await page.locator('#cv').screenshot({ path: path.join(OUT, '冬-雪窗内.png') });
await 等窗('out');
const 冬外 = await 采N(24);
await 摆冬夏(120);                       // 夏（窗内对照）
await 等窗('in');
const 夏内 = await 采N(24);
await browser.close(); srv.close();

const 结论 = { 冬_雪窗内: 冬内, 冬_雪窗外: 冬外, 夏_雪窗内_参考不判: 夏内, 错误: 错 };
结论.通过 = (冬内 >= 120 && 冬内 >= 3 * 冬外 && 错.length === 0);   // 均值/帧
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
console.log((结论.通过 ? '✔' : '✘') + ' 冬日飘雪：' + JSON.stringify(结论));
process.exit(结论.通过 ? 0 : 1);
