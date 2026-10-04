// 挂灯期灯串探针（真浏览器；只读诊断。第 156 单立，进冒烟档 2）
//
// 量什么：**岸线护栏带**（世界 y∈[SHORE_Y+0.6, SHORE_Y+1.4]、x∈[2,45]）里
//   "暖亮灯点"像素数——判据色 [r>200 且 g>165 且 b<190 且 r−b>60]（灯点色 255,217,138
//   夜里叠罩后仍 r≈236/g≈200/b≈130；路灯暖光斑 α≤0.22 ⇒ r≈95，够不到阈值）。
//   场景：挂灯期夜里（D45 19:30，节日当天） vs 对照（D40 19:30，非挂灯期）；
//   固定镜头、speed=0、等稳（含画布尺寸看门 + 1.5 秒保险，照第 153 单结论）。
//   判据：挂灯期 ≥ 40 且 对照 ≤ 5 且零 pageerror。
// 用法：node tools/festlight-audit/probe.mjs [输出目录]        （要 CITYLIFE_CHROME）
//   对照跑旧版：--改前=<git-ref>（旧版无灯串 ⇒ 挂灯期也应 ≈0 ⇒ 判红）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'festlight-audit'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
fs.mkdirSync(OUT, { recursive: true });

const raw = BEFORE
  ? execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:city-life-framework.html`], { maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }

const PORT = 18958;
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

const 等稳 = async () => {
  let 上 = null;
  for (let i = 0; i < 80; i++) {
    const v = await page.evaluate(() => {
      const box = document.querySelector('#live-wrap').getBoundingClientRect();
      const cv = document.querySelector('#cv');
      const st = __pv.state;
      return [box.width, box.height, st.view.ox, st.view.oy, st.view.s, cv.width, cv.height];
    });
    if (上 && Math.abs(v[0] - 上[0]) < 0.1 && Math.abs(v[1] - 上[1]) < 0.1
      && Math.abs(v[2] - 上[2]) < 0.002 && Math.abs(v[3] - 上[3]) < 0.002
      && v[4] === 上[4] && v[5] === 上[5] && v[6] === 上[6]) { await page.waitForTimeout(1500); return; }
    上 = v; await page.waitForTimeout(100);
  }
};

const 数点 = () => page.evaluate(() => {
  const st = __pv.state, s = st.view.s, cv = document.querySelector('#cv');
  const 岸线Y = 23;   // SHORE_Y（第 16 单常量；探针只按值采样，不依赖 Sim 暴露）
  const px = Math.round(st.view.ox + 2 * s), py = Math.round(st.view.oy + (岸线Y + 0.6) * s);
  const w = Math.max(4, Math.round((45 - 2) * s)), h = Math.max(2, Math.round(0.8 * s));
  const d = cv.getContext('2d').getImageData(px, py, w, h).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 200 && d[i + 1] > 165 && d[i + 2] < 190 && (d[i] - d[i + 2]) > 60) n++;
  }
  return n;
});

const 摆 = (t, 存图) => page.evaluate((t) => {
  const st = __pv.state, w = st.world;
  w.speed = 0; w.t = t; w.weather.rain = false; st.llm.on = false;
  st.cam.manual = true; st.cam.fx = 24; st.cam.fy = 22;
}, t);

await 摆(45 * 1440 - 1440 + 19 * 60 + 30);      // D45 19:30（节日当天，挂灯期）
await 等稳();
const 节 = await 数点();
await page.locator('#cv').screenshot({ path: path.join(OUT, '挂灯期-夜.png') });
await 摆(40 * 1440 - 1440 + 19 * 60 + 30);      // D40 19:30（对照）
await 等稳();
const 对 = await 数点();
await page.locator('#cv').screenshot({ path: path.join(OUT, '对照-夜.png') });
await browser.close(); srv.close();

const 结论 = { 挂灯期暖点: 节, 对照暖点: 对, 错误: 错 };
结论.通过 = (节 >= 40 && 对 <= 5 && 错.length === 0);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
console.log((结论.通过 ? '✔' : '✘') + ' 挂灯期灯串：' + JSON.stringify(结论));
process.exit(结论.通过 ? 0 : 1);
