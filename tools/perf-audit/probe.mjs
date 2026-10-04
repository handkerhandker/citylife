// 性能探针（真浏览器；只读诊断。第 155 单立，进冒烟档 2）
//
// 为什么：本项目从未量过"每帧要花多久"——第 148（烟花）、152（夜色挖空）、139（撑伞）等单
//   都在往每帧里加绘制。本探针把四个"最重"的场景各跑 8 秒 rAF，量帧间隔分布与长帧数：
//     ① 白天（12:30）② 夜晚（03:00）③ 雨夜（23:00，雨幕全开）④ 节日夜＋烟花＋选中者气泡。
//   口径：丢头 2 帧（起摆余波）；报 p50/p95/p99/max 与"长帧（>100ms）"计数。
// 判据（宽松、与机器无关的"卡死级"）：长帧 ≤2 且 p95 ≤ 22ms（= 掉到 ~45fps 以下才红）且零 pageerror。
//   —— 不拿绝对帧时卡机器差异；抓的是"某一改动把每帧拖垮"这类真回归。
// 用法：node tools/perf-audit/probe.mjs [输出目录]        （要 CITYLIFE_CHROME）
//   对照跑旧版：--改前=<git-ref>（读旧版 HTML 同口径跑）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'perf-audit'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
fs.mkdirSync(OUT, { recursive: true });

const raw = BEFORE
  ? execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:city-life-framework.html`], { maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }

const PORT = 18956;
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

const 场景 = async (名, 摆) => {
  await page.evaluate(摆);
  await page.waitForTimeout(1500);
  const 帧 = await page.evaluate(() => new Promise((res) => {
    const arr = []; let 上 = performance.now(); const t0 = 上;
    (function loop() {
      const now = performance.now();
      arr.push(now - 上); 上 = now;
      if (now - t0 < 8000) requestAnimationFrame(loop); else res(arr);
    })();
  }));
  const s = 帧.slice(2).sort((a, b) => a - b);
  const q = p => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { 名, n: s.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1], 长帧: s.filter(x => x > 100).length };
};

const 读数 = [];
读数.push(await 场景('白天(12:30)', () => { const st = __pv.state, w = st.world; w.speed = 0; w.t = 64110; w.weather.rain = false; st.llm.on = false; st.cam.manual = true; st.cam.fx = 24; st.cam.fy = 15; }));
读数.push(await 场景('夜晚(03:00)', () => { const st = __pv.state, w = st.world; w.speed = 0; w.t = 1440 * 6 + 180; w.weather.rain = false; st.cam.manual = true; st.cam.fx = 24; st.cam.fy = 15; }));
读数.push(await 场景('雨夜(23:00)', () => { const st = __pv.state, w = st.world; w.speed = 0; w.t = 1440 * 6 + 1380; w.weather.rain = true; w.weather.until = 1e9; st.cam.manual = true; st.cam.fx = 24; st.cam.fy = 15; }));
读数.push(await 场景('节日夜+烟花', () => { const st = __pv.state, w = st.world; w.speed = 0; w.t = 64530; w.weather.rain = false; st.cam.manual = true; st.cam.fx = 24; st.cam.fy = 15; st.selected = 'a1'; }));

/* 反向自查（真跑）：把 rAF 每帧压 30ms（模拟"每帧被拖垮"）——同口径必须明显超过判据阈值，
   证明"长帧/p95 ≤22"两条判据不是恒绿。 */
await page.evaluate(() => {
  const 原 = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => 原(() => { const t = performance.now(); while (performance.now() - t < 30) {} cb(performance.now()); });
});
const 拖 = await page.evaluate(() => new Promise((res) => {
  const arr = []; let 上 = performance.now(); const t0 = 上;
  (function loop() { const now = performance.now(); arr.push(now - 上); 上 = now;
    if (now - t0 < 2000) requestAnimationFrame(loop); else res(arr); })();
}));
const 拖序 = 拖.slice(2).sort((a, b) => a - b);
const 拖p50 = 拖序[Math.floor(拖序.length * 0.5)];
await browser.close(); srv.close();

const 长帧总 = 读数.reduce((a, x) => a + x.长帧, 0);
const p95最大 = Math.max(...读数.map(x => x.p95));
const 结论 = { 场景: 读数.map(x => ({ ...x, p50: +x.p50.toFixed(1), p95: +x.p95.toFixed(1), p99: +x.p99.toFixed(1), max: +x.max.toFixed(1) })), 长帧总数: 长帧总, p95最大: +p95最大.toFixed(1), 错误: 错 };
结论.反向自查 = { 拖慢后p50: +拖p50.toFixed(1), 预期超阈: 拖p50 > 22 };
结论.通过 = (长帧总 <= 2 && p95最大 <= 22 && 拖p50 > 22 && 错.length === 0);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
console.log((结论.通过 ? '✔' : '✘') + ' 性能：' + JSON.stringify(结论));
process.exit(结论.通过 ? 0 : 1);
