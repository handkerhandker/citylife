// 第 184 单·诊断浮层探针（真浏览器；只读诊断，进冒烟档 2）
//
// 为什么要有它：鸿蒙 NEXT 上没有 adb，真机出问题只能靠屏幕上的字。诊断浮层把
//   「视口／密度／布局档／壳推下来的安全区四值／当前屏／帧率与 p95／缩放／速度」打在左上角，
//   截图即可当证据。判据：
//   ① 默认不显示（不能偷偷占屏）；
//   ② 设置里点开 ⇒ `#dbg.on`，且四行读数齐：视口/密度/布局档、安全区四值（与注入值一致）、
//      当前屏、帧率（含 p95）；
//   ③ **绝不拦触摸**：computedStyle.pointerEvents==='none'，且浮层正中那一点的
//      `elementFromPoint` 不是浮层自己（证明点得穿）；
//   ④ 刷新后保持（记住的是这台设备的选择）；再点一次关掉 ⇒ 不显示；
//   ⑤ 全程零 pageerror。
// 用法：node tools/diag-overlay/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'diag-overlay'));
fs.mkdirSync(OUT, { recursive: true });
const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18976;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
/* 第 190 单：注入一个假的壳接口——页面启动后会主动问它要安全区（投递第二腿）。 */
await ctx.addInitScript(() => { window.SZGOShell = { getInsets: () => '17,9,2,0,1' }; });
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push(String(e && e.message || e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const u = (m.location() && m.location().url) || '';
  if (/favicon|\/relay|net::ERR/.test(u) || /Failed to load resource|CORS|Failed to fetch|api\.anthropic/i.test(m.text())) return;
  错.push('console: ' + m.text().slice(0, 120));
});
await page.route('**api.anthropic.com**', r => r.abort());
await page.route('**/relay', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: '{}' }) }));

let 红 = 0;
const 判 = (名, ok, 读) => { if (!ok) 红++; console.log((ok ? ' ok  ' : ' FAIL ') + 名 + '：' + JSON.stringify(读)); };
const 显不显 = () => page.evaluate(() => {
  const el = document.getElementById('dbg');
  return { on: el.classList.contains('on'), display: getComputedStyle(el).display, 文: (el.textContent || '').slice(0, 400) };
});

await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(900);
/* 第 190 单·第二腿：页面自己问壳 —— 在没有任何平台/壳注入的情况下，--sa-t 应被拉到 17px。 */
{
  const 拉190 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sa-t').trim());
  判('⑥ 页面主动问壳（第二腿）：拿到壳测值 ⇒ --sa-t=17px', 拉190 === '17px', { '--sa-t': 拉190 });
}
/* 模拟安卓壳推下来的安全区（第 181 单那套） */
await page.evaluate(() => {
  const s = document.documentElement.style;
  s.setProperty('--sa-t', '11px'); s.setProperty('--sa-b', '8px');
  s.setProperty('--sa-l', '3px'); s.setProperty('--sa-r', '0px');
  /* 第 189 单：再模拟一层**平台原始值**（Capacitor SystemBars 注入的 `--safe-area-inset-*`），
     浮层现在两套并排打——真机截图能区分"平台没给值、壳兜的底"与"平台给了别的值"。 */
  s.setProperty('--safe-area-inset-top', '11px'); s.setProperty('--safe-area-inset-bottom', '8px');
  s.setProperty('--safe-area-inset-left', '3px'); s.setProperty('--safe-area-inset-right', '0px');
});

const 默 = await 显不显();
判('① 默认不显示（不能偷偷占屏）', 默.on === false && 默.display === 'none', 默);

await page.click('button.tab[data-tab="settings"]').catch(() => {});
await page.waitForTimeout(200);
await page.click('#set-dbg').catch(() => {});
await page.waitForTimeout(700);           // 等主循环那次节流刷新（4Hz）
const 开 = await 显不显();
const 真屏 = await page.evaluate(() => window.__pv.state.screen);
const 齐 = 开.on && 开.display !== 'none'
  && /视口 \d+×\d+ · dpr [\d.]+/.test(开.文)
  && /安全区 t11px b8px l3px r0px/.test(开.文)
  && /平台 t11px b8px l3px r0px/.test(开.文)                       // 第 189 单：平台原始值并排
  && /画布 \d+×\d+（buf \d+×\d+） · 地图 \d+×\d+ @ -?\d+,-?\d+ · 边带 t\d+ b\d+ l\d+ r\d+/.test(开.文)  // 第 189 单：画布/地图/边带
  && /· 屏 \d+×\d+/.test(开.文)                                     // 第 190 单：屏幕尺寸
  && /· 壳 t17 b9 l2 r0\(备\)/.test(开.文)                          // 第 190 单：壳测安全区（含兜底标记）
  && 开.文.indexOf('屏 ' + 真屏) >= 0          // 与当前屏一致（点开关时人在设置页，就应显示 settings）
  && /帧 \d+ fps · p95 [\d.]+ms/.test(开.文);
判('② 点开 ⇒ 显示且五行读数齐（视口/密度·安全区四值＋平台原始值·画布/地图/边带·当前屏·帧率p95）', 齐, { 文: 开.文, 真屏 });
await page.screenshot({ path: path.join(OUT, '诊断浮层-开.png') }).catch(() => {});   // 带浮层的样张（交付件引用）

const 穿透 = await page.evaluate(() => {
  const el = document.getElementById('dbg');
  const r = el.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  return { pe: getComputedStyle(el).pointerEvents, 命中: hit ? (hit.id || hit.className || hit.tagName) : 'null' };
});
判('③ 绝不拦触摸：pointer-events=none，且浮层正中那一点点得穿（不命中浮层）',
  穿透.pe === 'none' && 穿透.命中 !== 'dbg', 穿透);

await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(900);
const 刷 = await 显不显();
判('④ 刷新后保持（记住的是这台设备的选择）', 刷.on === true && 刷.display !== 'none', { on: 刷.on });
await page.click('button.tab[data-tab="settings"]').catch(() => {});
await page.waitForTimeout(200);
await page.click('#set-dbg').catch(() => {});
await page.waitForTimeout(200);
const 关 = await 显不显();
判('④b 再点一次 ⇒ 关掉且不再显示', 关.on === false && 关.display === 'none', { on: 关.on });
判('⑤ 全程零 pageerror', 错.length === 0, 错.slice(0, 3));

await page.screenshot({ path: path.join(OUT, '诊断浮层.png') }).catch(() => {});
await browser.close();
srv.close();
console.log(红 ? `诊断浮层探针：${红} 条不过（图在 ${OUT}）` : '诊断浮层探针：全绿');
process.exit(红 ? 1 : 0);
