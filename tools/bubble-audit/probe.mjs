// 气泡顶边稳定性探针（真浏览器；只读诊断。第 150 单立，进冒烟档 2）
//
// 病根（第 150 单取证）：选中者的气泡在**行数 1↔2 切换**（独白出现/消失）时，
//   盒高瞬间从 18px 变 30px ⇒ **顶边瞬跳 ~12px**（实测 64 秒里 8 次、单次 6.6–16.2px，
//   叠加人物走路的位移）。其余时间气泡顶几乎完全静止（1075/1280 样本零位移）。
//
// 量什么：**逐帧**（rAF）记录气泡盒顶 y 与行数（注入记录 sayBubble 的 top），跑 24 秒，
//   判据：
//     ① **逐帧 |Δtop| ≤ 5px**（无瞬跳；人物走路 ~1.8px/帧、名牌浮道滑动 ≤4.5px/帧都在线下，
//        行数切换的瞬跳改前是 12px）；
//     ② **行数切换 ≥1 次**（保证这 24 秒真的测到了切换——否则是空转，判红）；
//     ③ 零 pageerror。
// 场景：与名牌稳定性探针同一颗种子同一时段（seed 20261004、D45 19:30、1× 速度），
//   speed=1 让人物照常活动（行数才会切换）。
// 用法：node tools/bubble-audit/probe.mjs [输出目录]          （要 CITYLIFE_CHROME）
//   对照跑旧版：--改前=<git-ref>（旧版行数切换处应有 >5px 的瞬跳 ⇒ 判红）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'bubble-audit'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
fs.mkdirSync(OUT, { recursive: true });

const raw = BEFORE
  ? execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:city-life-framework.html`], { maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
/* 注入点兼容两版：改前=旧写法（gap-h／top+h）；改后=第 150 单的缓动版（gap-气泡显高／top+气泡显高） */
let html = raw.replace(/const top=yBottom-BUBBLE\.gap-[^,]+, l=x-w\/2, r=x\+w\/2, rr=4, bot=top\+[^;]+;/,
  m => m + ' window.__bubTop=top; window.__bubLines=行.length;');
if (html === raw) { console.error('sayBubble 注入点没找到'); process.exit(2); }
html = html.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state}};\n})();\n</script>');

const SEED = 20261004;
const PORT = 18953;
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
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html?seed=${SEED}`, { waitUntil: 'load' });
await page.waitForTimeout(2200);
await page.evaluate(() => {
  const st = __pv.state, w = st.world;
  w.t = 64530; w.weather.rain = false; st.llm.on = false; w.speed = 1;
  window.__rec = [];
  (function loop() {
    if (typeof window.__bubTop === 'number') window.__rec.push([performance.now(), window.__bubTop, window.__bubLines]);
    requestAnimationFrame(loop);
  })();
});
await page.waitForTimeout(24000);
const rec = await page.evaluate(() => window.__rec);
await browser.close(); srv.close();
fs.writeFileSync(path.join(OUT, 'raw.json'), JSON.stringify(rec), 'utf8');

// 分析：逐帧 Δtop；行数切换计数
let 跳 = 0, 切换 = 0, 帧 = 0;
const 跳例 = [];
for (let i = 1; i < rec.length; i++) {
  const [, t0, l0] = rec[i - 1], [, t1, l1] = rec[i];
  if (l0 !== l1) 切换++;
  const d = t1 - t0;
  if (Math.abs(d) > 5) { 跳++; if (跳例.length < 12) 跳例.push({ i, d: Math.round(d * 10) / 10, l0, l1 }); }
  帧++;
}
const 结论 = { 帧数: 帧, 行数切换: 切换, 超5px瞬跳: 跳, 瞬跳样例: 跳例, 错误: 错 };
结论.通过 = (跳 === 0 && 切换 >= 1 && 错.length === 0);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
console.log((结论.通过 ? '✔' : '✘') + ' 气泡顶边稳定性：' + JSON.stringify(结论));
process.exit(结论.通过 ? 0 : 1);
