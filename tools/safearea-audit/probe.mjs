// 第 186 单·安全区取数探针（真浏览器；只读诊断，进冒烟档 2）
//
// 为什么要有它：**新版 Android WebView（<140）里 `env(safe-area-inset-*)` 恒为 0**
//   （Capacitor 官方 SystemBars 文档原文；真机上表现为"顶栏钻到状态栏底下"）。
//   官方配方：平台把正确值注入成 `--safe-area-inset-*`，页面 CSS 先读它、再回落 env()：
//     padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px))
//   本探针就在浏览器里**模拟平台注入**，逐条钉住这条链：
//   ① 什么都不注入 ⇒ `--sa-t` 为 0px（桌面 Chromium 的 env() 就是 0），顶栏贴顶；
//   ② 模拟 SystemBars 注入 `--safe-area-inset-top: 37px`（＋左 3px／下 8px）⇒
//      `--sa-t` 立刻变 37px，且**顶栏的矩形上边真的被推到 ≥37px**（不是只改了个变量）；
//   ③ 壳兜底那条腿照样能用：把平台变量撤掉、直接写 `--sa-t`（壳的自补路径）⇒ 顶栏同样让位；
//   ④ 零 pageerror。
// 用法：node tools/safearea-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'safearea-audit'));
fs.mkdirSync(OUT, { recursive: true });
const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18979;
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
const 读 = () => page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const tb = document.getElementById('topbar');
  const 盒 = tb.getBoundingClientRect();
  const 头 = tb.firstElementChild ? tb.firstElementChild.getBoundingClientRect() : null;
  return {
    sa_t: cs.getPropertyValue('--sa-t').trim(),
    顶栏内边距上: Math.round(parseFloat(getComputedStyle(tb).paddingTop) || 0),
    顶栏内容上边: 头 ? Math.round(头.top) : -1,     // 量"内容"让位没有（`top` 恒 0：padding 只推内容）
    顶栏高: Math.round(盒.height),
  };
});

const 一 = await 读();
判('① 不注入 ⇒ --sa-t 为 0px、顶栏内容贴顶（内边距＝sp2 那 8px）',
   一.sa_t === '0px' && 一.顶栏内容上边 >= 4 && 一.顶栏内容上边 <= 14, 一);

/* ② 模拟 Capacitor SystemBars（insetsHandling='css'）注入：真机上这一步由平台做 */
await page.evaluate(() => {
  const s = document.documentElement.style;
  s.setProperty('--safe-area-inset-top', '37px'); s.setProperty('--safe-area-inset-left', '3px');
  s.setProperty('--safe-area-inset-bottom', '8px'); s.setProperty('--safe-area-inset-right', '0px');
});
await page.waitForTimeout(400);
const 二 = await 读();
判('② 平台注入 --safe-area-inset-top:37px ⇒ --sa-t 变 37px，**顶栏内容真的让位**（内容上边 ≥37）',
  二.sa_t === '37px' && 二.顶栏内容上边 >= 37, 二);

/* ③ 壳兜底那条腿：撤掉平台变量、直接写 --sa-t（安卓壳缺平台变量时的自补路径） */
await page.evaluate(() => {
  const s = document.documentElement.style;
  s.removeProperty('--safe-area-inset-top'); s.removeProperty('--safe-area-inset-left');
  s.removeProperty('--safe-area-inset-bottom'); s.removeProperty('--safe-area-inset-right');
  s.setProperty('--sa-t', '24px');
});
await page.waitForTimeout(400);
const 三 = await 读();
判('③ 平台没给时：壳自补 --sa-t:24px 同样让位（内容上边 ≥24）', 三.sa_t === '24px' && 三.顶栏内容上边 >= 24, 三);
判('④ 全程零 pageerror', 错.length === 0, 错.slice(0, 3));

await page.screenshot({ path: path.join(OUT, '安全区-壳自补.png') }).catch(() => {});
await browser.close();
srv.close();
console.log(红 ? `安全区探针：${红} 条不过（图在 ${OUT}）` : '安全区探针：全绿');
process.exit(红 ? 1 : 0);
