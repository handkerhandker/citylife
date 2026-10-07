// 第 296 单·屏幕常亮探针（真浏览器；只读诊断，进冒烟档 2）
//
// 为什么要有它：本作是**看**的游戏（住户自己过日子），不碰屏幕时手机的息屏/锁屏会把画面掐掉。
//   第 296 单落成两条腿：① 安卓壳里 `SZGOShell.setKeepScreen(1)` → `FLAG_KEEP_SCREEN_ON`；
//   ② 网页侧 Screen Wake Lock（没装壳/浏览器时用）。判据（真页面＋假壳＋假 Wake Lock）：
//     ① 默认**开**：按钮显示"开"、壳收到 1、可见时请求过锁；
//     ② 点一下 ⇒ 显示"关"、localStorage 写 `'0'`、壳收到 0、并**放开**锁；
//     ③ 刷新后记住（仍是"关"、壳仍收 0）；
//     ④ 再点回来 ⇒ 显示"开"、localStorage 写 `'1'`、壳收 1、重新请求锁；
//     ⑤ 切走（visibilitychange→hidden）⇒ 放开锁；切回 ⇒ 重新请求（"离开 App 不占着"）；
//     ⑥ 全程零 pageerror。
// 用法：node tools/screen-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'screen-audit'));
fs.mkdirSync(OUT, { recursive: true });
const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18989;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  window.__壳 = [];                      // 假壳：记下页面每次调 setKeepScreen 的值
  window.SZGOShell = {
    setKeepScreen(v) { window.__壳.push(v); },
    setImmersive() {},
    getInsets() { return ''; },
  };
  window.__锁 = { 请: 0, 放: 0 };         // 假 Wake Lock：只在页面真的请求/释放时计数
  try {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: () => { window.__锁.请++; return Promise.resolve({ addEventListener() {}, release() { window.__锁.放++; } }); } },
    });
  } catch (e) {}
});
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push(String((e && e.message) || e)));
const 断言 = [];
const 判 = (n, ok, 读数_) => { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); };
const 读 = () => page.evaluate(() => ({
  按钮: (document.querySelector('#set-keepon') || {}).textContent || null,
  存: (() => { try { return localStorage.getItem('citylife-keepon'); } catch (e) { return 'ERR'; } })(),
  壳: window.__壳.slice(), 锁: window.__锁,
}));
const 开设置 = async () => {
  await page.click('button.tab[data-tab="settings"]').catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('#set-keepon').scrollIntoView({ block: 'center' })).catch(() => {});
  await page.waitForTimeout(150);
};
const 点开关 = async () => {
  const 位 = await page.evaluate(() => { const r = document.querySelector('#set-keepon').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.touchscreen.tap(位[0], 位[1]);
  await page.waitForTimeout(250);
};

await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await 开设置();
let R = await 读();
判('① 默认开：设置里那一行显示"开"、壳收到 1、可见时请求过屏锁', R.按钮 === '开' && R.壳.length > 0 && R.壳[R.壳.length - 1] === 1 && R.锁.请 >= 1, R);
await 点开关();
let R2 = await 读();
判('② 点一下 ⇒ 显示"关"、localStorage 写 0、壳收到 0、并放开屏锁',
  R2.按钮 === '关' && R2.存 === '0' && R2.壳[R2.壳.length - 1] === 0 && R2.锁.放 >= 1, R2);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
await 开设置();
let R3 = await 读();
判('③ 刷新后记住：仍是"关"、壳仍收 0', R3.按钮 === '关' && R3.存 === '0' && R3.壳[R3.壳.length - 1] === 0, R3);
await 点开关();
let R4 = await 读();
/* ★计数器在**刷新后是新的**（假锁对象随每次加载重建）⇒ 这里只要求"重新请求过 ≥1"，
   不能拿刷新前的累计数当门槛（本单第一版就是这么写红的）。 */
判('④ 再点回来 ⇒ 显示"开"、存 1、壳收 1、重新请求屏锁（刷新后计数从 0 起）',
  R4.按钮 === '开' && R4.存 === '1' && R4.壳[R4.壳.length - 1] === 1 && R4.锁.请 >= 1, R4);
/* ⑤ 切走／切回：页面自己那几个 visibilitychange 监听会放开／重请 —— 用假 visibilityState 触发 */
{
  const 前 = await 读();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);
  const 隐 = await 读();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);
  const 回 = await 读();
  判('⑤ 切走放开屏锁、切回重新请求（"离开 App 不占着"）',
    隐.锁.放 > 前.锁.放 && 回.锁.请 > 隐.锁.请, { 前: 前.锁, 隐: 隐.锁, 回: 回.锁 });
}
判('⑥ 全程零 pageerror', 错.length === 0, { 错: 错.slice(0, 3) });
await page.screenshot({ path: path.join(OUT, '设置页-屏幕常亮.png'), fullPage: false });
await browser.close(); srv.close();
const 红 = 断言.filter(x => !x.ok).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ 断言, 页面错误: 错, 红, 通过: 红 === 0 && 错.length === 0 }, null, 2), 'utf8');
console.log('\n屏幕常亮探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit((红 || 错.length) ? 1 : 0);
