// 第 45 单 · 「有新版」提示的行为级验证（**只读诊断**：不进 gate.yml、不判红）
//
// 源码级闸（harness 闸十一）只能证明**代码写对了**；「提示到底出不出来、会不会误报」得真跑。
// 本工具起一个**会翻 `Last-Modified` 的本地站**，把四种情形逐条演一遍：
//   ① 什么都不动            ⇒ **不许出提示**（不误报）
//   ② 只翻**页面**的标识      ⇒ 出提示；点它 ⇒ 网址带上 `?fresh=`
//   ③ 只翻**素材**的标识      ⇒ 也要出提示（待办点名「代码与素材一并覆盖」）
//   ④ 服务端**不给标识**      ⇒ **不许出提示**（宁可不出，不许误报）
//
// 用法：node tools/fresh-gate/probe.mjs <输出目录>
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'docs/交付/第45单-图'));
const PORT = 18945;
fs.mkdirSync(OUT, { recursive: true });

const rawHtml = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state}};\n})();\n</script>');
const MIME = { '.html': 'text/html;charset=utf-8', '.png': 'image/png' };

// 三个可控的「版本标识」；`无标识` 为真时一个头都不发
let 标识 = { '/city-life-framework.html': 'Wed, 01 Oct 2026 00:00:00 GMT',
             '/assets/apartment.png':       'Wed, 01 Oct 2026 00:00:00 GMT',
             '/assets/characters.png':      'Wed, 01 Oct 2026 00:00:00 GMT' };
let 无标识 = false;
let 请求流水 = [];

const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  请求流水.push({ 方法: q.method, 路径: u, 带标识: !无标识 && !!标识[u] });
  if (q.method === 'HEAD') {
    if (u === '/favicon.ico') { r.writeHead(404); r.end(); return; }
    if (!(u in 标识) && u !== '/') { r.writeHead(404); r.end(); return; }
    const h = { 'content-type': u === '/' || u.endsWith('.html') ? MIME['.html'] : MIME['.png'] };
    if (!无标识 && 标识[u]) h['last-modified'] = 标识[u];
    r.writeHead(200, h); r.end(); return;
  }
  if (u === '/' || u.endsWith('city-life-framework.html')) {
    const h = { 'content-type': 'text/html; charset=utf-8' };
    if (!无标识) h['last-modified'] = 标识['/city-life-framework.html'];
    r.writeHead(200, h); r.end(html); return;
  }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p)) { r.writeHead(404); r.end(); return; }
  const h = { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' };
  if (!无标识 && 标识[u]) h['last-modified'] = 标识[u];
  r.writeHead(200, h); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const exe = process.env.CITYLIFE_CHROME || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: exe });
const settle = ms => new Promise(r => setTimeout(r, ms));
const 读数 = { 场景: [] };
const 有新提示 = page => page.evaluate(() => !!document.getElementById('fresh-hint'));
/* 页面自己的 `visibilitychange` 监听在**重新可见**时才查；playwright 没有"造真实切页"的 API，
   故直接派发同名事件——处理器只读 `document.visibilityState`，而页面本来就是可见的，
   故派发即等价于"切回来"。 */
const 假装切回来 = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(URL_); await settle(1800);   // 等开页那一次 HEAD 走完

// ① 什么都不动
await 假装切回来(page); await settle(900);
const 一 = await 有新提示(page);
读数.场景.push({ 场景: '①什么都不动', 期望: '无提示', 实测: 一 ? '有提示' : '无提示', 判定: 一 ? '✗ 误报' : '✓' });

// ② 只翻页面标识
标识['/city-life-framework.html'] = 'Thu, 02 Oct 2026 00:00:00 GMT';
await 假装切回来(page); await settle(900);
const 二 = await 有新提示(page);
读数.场景.push({ 场景: '②只翻页面标识', 期望: '出提示', 实测: 二 ? '有提示' : '无提示', 判定: 二 ? '✓' : '✗ 该出没出' });
let 点了以后 = '';
if (二) {
  await page.screenshot({ path: path.join(OUT, '提示出现.png') });
  await page.click('#fresh-hint').catch(() => {});
  await settle(1200);
  点了以后 = page.url();
  读数.场景.push({ 场景: '②点它', 期望: '网址带 ?fresh=', 实测: 点了以后.includes('fresh=') ? '带上了' : 点了以后, 判定: 点了以后.includes('fresh=') ? '✓' : '✗' });
}
await page.goto(URL_); await settle(1600);   // 换回干净的一页继续验

// ③ 只翻素材标识
const 页2 = await ctx.newPage();
await 页2.goto(URL_); await settle(1800);
标识['/assets/apartment.png'] = 'Thu, 02 Oct 2026 00:00:00 GMT';
await 假装切回来(页2); await settle(900);
const 三 = await 有新提示(页2);
读数.场景.push({ 场景: '③只翻素材标识', 期望: '出提示（素材也在缓存里）', 实测: 三 ? '有提示' : '无提示', 判定: 三 ? '✓' : '✗ 漏了素材' });
await 页2.close();

// ④ 服务端不给标识
无标识 = true;
const 页3 = await ctx.newPage();
await 页3.goto(URL_); await settle(1800);
await 假装切回来(页3); await settle(900);
const 四 = await 有新提示(页3);
读数.场景.push({ 场景: '④服务端不给标识', 期望: '无提示（不猜不误报）', 实测: 四 ? '有提示' : '无提示', 判定: 四 ? '✗ 误报' : '✓' });
await 页3.close();

读数.请求流水 = 请求流水;
fs.writeFileSync(path.join(OUT, '读数.json'), JSON.stringify(读数, null, 2), 'utf8');
await browser.close(); srv.close();
console.log('场景'.padEnd(18) + '期望'.padEnd(26) + '实测'.padEnd(12) + '判定');
for (const x of 读数.场景) console.log(x.场景.padEnd(18) + x.期望.padEnd(26) + x.实测.padEnd(12) + x.判定);
const 红 = 读数.场景.filter(x => /✗/.test(x.判定)).length;
console.log('\n' + (红 ? (红 + ' 项判红') : '四个场景全对') + '；出图在 ' + OUT);
process.exit(红 ? 1 : 0);
