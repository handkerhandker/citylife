// 夏夜萤火虫探针（真浏览器；只读诊断。第 158 单立，进冒烟档 2）
//
// 量什么：**江面带**（世界 x∈[3,45]、y∈[22,28]）里的"黄绿亮点"像素数——
//   判据色 [g>170 且 g−b>70 且 r>140]（萤火虫 216,240,106 叠夜底 ⇒ r≈190/g≈212/b≈99：
//   g−b≈113；岸线路灯光斑 g≈84 够不到 g>170，天然滤掉）。
//   场景：夏夜（D120 22:00）／夏白天（D120 12:00）／冬夜（D300 22:00），各 10 帧（300ms）。
//   判据：夏夜 ≥ 40 且 夏白天 ≤ 10 且 冬夜 ≤ 10 且零 pageerror。
// 用法：node tools/firefly-audit/probe.mjs [输出目录]        （要 CITYLIFE_CHROME）
//   对照跑旧版：--改前=<git-ref>（旧版无萤火虫 ⇒ 夏夜也 ≈0 ⇒ 判红）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'firefly-audit'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
fs.mkdirSync(OUT, { recursive: true });

const raw = BEFORE
  ? execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:city-life-framework.html`], { maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }

const PORT = 18965;   // 第 270 单批后自查：原 18961 与 ai-gate/client.mjs 撞车 ⇒ 改号
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

const 数萤 = () => page.evaluate(() => {
  const st = __pv.state, s = st.view.s, cv = document.querySelector('#cv');
  const px = Math.round(st.view.ox + 3 * s), py = Math.round(st.view.oy + 22 * s);
  const w = Math.max(4, Math.round(42 * s)), h = Math.max(4, Math.round(6 * s));
  const d = cv.getContext('2d').getImageData(px, py, w, h).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 1] > 170 && (d[i + 1] - d[i + 2]) > 70 && d[i] > 140) n++;
  }
  return n;
});

const 一景 = async (名, 天, 时) => {
  await page.evaluate(([天, 时]) => {
    const st = __pv.state, w = st.world;
    w.speed = 0; w.t = (天 - 1) * 1440 + 时 * 60; w.weather.rain = false; st.llm.on = false; st.reduceMotion = false;
    st.cam.manual = true; st.cam.fx = 24; st.cam.fy = 22;
  }, [天, 时]);
  await page.waitForTimeout(1200);
  let 合 = 0;
  for (let i = 0; i < 10; i++) { 合 += await 数萤(); await page.waitForTimeout(300); }
  return { 名, 合 };
};

const 夏夜 = (await 一景('夏夜', 120, 22)).合;
await page.locator('#cv').screenshot({ path: path.join(OUT, '夏夜.png') });
const 夏昼 = (await 一景('夏白天', 120, 12)).合;
const 冬夜 = (await 一景('冬夜', 300, 22)).合;
await browser.close(); srv.close();

const 结论 = { 夏夜: 夏夜, 夏白天: 夏昼, 冬夜: 冬夜, 错误: 错 };
结论.通过 = (夏夜 >= 40 && 夏昼 <= 10 && 冬夜 <= 10 && 错.length === 0);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
console.log((结论.通过 ? '✔' : '✘') + ' 夏夜萤火虫：' + JSON.stringify(结论));
process.exit(结论.通过 ? 0 : 1);
