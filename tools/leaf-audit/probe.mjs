// 深秋枫叶探针（真浏览器；只读诊断。第 161 单立，进冒烟档 2）
//
// 量什么：**画面顶部天空带**（地图上缘以上那一条，全宽）里的"橙红叶片像素"数——
//   第 187 单重标定：同 petal —— 铺满后写死的 "0..110px" 会把地图顶部框进来，
//   改成"0..地图上缘−2"（跟着布局走；量的仍是地图以上的纯天空）。
//   判据色 [r>150 且 r−g>40 且 g−b>10]（叶色 224,122,63／217,82,46／224,163,63 叠底后仍满足；
//   地图里的暖色元素在天空带外，室内矩形也被裁剪——双保险）。
//   场景：深秋（D255）／初秋（D200）／夏（D120）／春（D30）各 10 帧（300ms）。
//   判据：深秋 ≥ 60 且 其余三景各 ≤ 10 且零 pageerror。
// 用法：node tools/leaf-audit/probe.mjs [输出目录]        （要 CITYLIFE_CHROME）
//   对照跑旧版：--改前=<git-ref>（旧版无秋叶 ⇒ 深秋也 ≈0 ⇒ 判红）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'leaf-audit'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
fs.mkdirSync(OUT, { recursive: true });

const raw = BEFORE
  ? execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:city-life-framework.html`], { maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }

const PORT = 18963;
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

const 数叶 = () => page.evaluate(() => {
  const cv = document.querySelector('#cv');
  const 带高 = Math.max(6, Math.min(cv.height, Math.round(__pv.state.view.oy) - 2));
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, 带高).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 150 && (d[i] - d[i + 1]) > 40 && (d[i + 1] - d[i + 2]) > 10) n++;
  }
  return n;
});

const 一景 = async (名, 天) => {
  await page.evaluate((天) => {
    const st = __pv.state, w = st.world;
    w.speed = 0; w.t = (天 - 1) * 1440 + 12 * 60; w.weather.rain = false; st.llm.on = false; st.reduceMotion = false;
    st.cam.manual = true; st.cam.fx = 24; st.cam.fy = 15;
  }, 天);
  await page.waitForTimeout(1200);
  let 合 = 0;
  for (let i = 0; i < 10; i++) { 合 += await 数叶(); await page.waitForTimeout(300); }
  return 合;
};

const 深秋 = await 一景('深秋', 255);
await page.locator('#cv').screenshot({ path: path.join(OUT, '深秋.png') });
const 初秋 = await 一景('初秋', 200);
const 夏 = await 一景('夏', 120);
const 春 = await 一景('春', 30);
await browser.close(); srv.close();

const 结论 = { 深秋: 深秋, 初秋: 初秋, 夏: 夏, 春: 春, 错误: 错 };
结论.通过 = (深秋 >= 60 && 初秋 <= 10 && 夏 <= 10 && 春 <= 10 && 错.length === 0);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
console.log((结论.通过 ? '✔' : '✘') + ' 深秋枫叶：' + JSON.stringify(结论));
process.exit(结论.通过 ? 0 : 1);
