// 第 183 单·手机返回键探针（真浏览器；只读诊断，进冒烟档 2）
//
// 为什么要有它：安卓壳把系统返回键先交给页面（`window.__back()`）——页面消化得了就不退 App。
// 这条链路的判据必须逐条钉住，否则会变成"退不出去"或"误退"：
//   ① 现场页、没弹窗 ⇒ `__back()` 返回 **false**（＝壳照常退出，别吞返回键）；
//   ② 有弹窗（导出存档）⇒ 返回 **true** 且弹窗关掉（不退 App）；
//   ③ 不在现场页（日志页）⇒ 返回 **true** 且回到现场页；
//   ④ 回到现场页后再问一次 ⇒ 又是 **false**（次序不粘）；
//   ⑤ 全程零 pageerror。
// 与页面里 `Input.on('back', …)` 同一套次序（键盘/手柄走那条、安卓返回键走这条）。
// 用法：node tools/back-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'back-audit'));
fs.mkdirSync(OUT, { recursive: true });
const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18975;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
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
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(900);

let 红 = 0;
const 判 = (名, ok, 读) => { if (!ok) 红++; console.log((ok ? ' ok  ' : ' FAIL ') + 名 + '：' + JSON.stringify(读)); };
const 问返回 = () => page.evaluate(() => (typeof window.__back === 'function') ? !!window.__back() : 'NO_HELPER');
const 状态 = () => page.evaluate(() => ({
  屏: window.__pv.state.screen,
  弹窗: document.getElementById('dialog-root').classList.contains('open'),
}));

const 有助手 = await page.evaluate(() => typeof window.__back === 'function');
判('⓪ 页面里有 window.__back（壳要问的就是它）', 有助手, { 有助手 });

const 初 = await 状态();
const 一 = await 问返回();
判('① 现场页、没弹窗 ⇒ 返回 false（壳照常退出，不吞返回键）', 一 === false && 初.屏 === 'live' && !初.弹窗, { 一, 初 });

/* ② 开一个弹窗：走真 UI（设置 → 导出） */
await page.click('button.tab[data-tab="settings"]').catch(() => {});
await page.waitForTimeout(200);
await page.click('#sv-export').catch(() => {});
await page.waitForTimeout(200);
const 开前 = await 状态();
const 二 = await 问返回();
const 开后 = await 状态();
判('② 有弹窗 ⇒ 返回 true 且弹窗关掉（不退 App）', 开前.弹窗 && 二 === true && !开后.弹窗, { 开前, 二, 开后 });

/* ③ 切到日志页（弹窗已关，人在设置页）⇒ 一次返回回现场页 */
await page.click('button.tab[data-tab="log"]').catch(() => {});
await page.waitForTimeout(200);
const 三前 = await 状态();
const 三 = await 问返回();
const 三后 = await 状态();
判('③ 不在现场页 ⇒ 返回 true 且回到现场页', 三前.屏 !== 'live' && 三 === true && 三后.屏 === 'live', { 三前, 三, 三后 });

const 四 = await 问返回();
判('④ 回到现场页后再问 ⇒ 又是 false（次序不粘）', 四 === false, { 四 });
判('⑤ 全程零 pageerror', 错.length === 0, 错.slice(0, 3));

await browser.close();
srv.close();
console.log(红 ? `返回键探针：${红} 条不过（图在 ${OUT}）` : '返回键探针：全绿');
process.exit(红 ? 1 : 0);
