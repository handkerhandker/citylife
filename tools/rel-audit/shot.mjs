// 第 88 单·关系状态机 A 档的**看得见**取证（真浏览器截图 ＋ 机器读数；只读诊断，不进 gate.yml）
//
// 为什么要它：门禁能证"数长对了"，但"角色页那一行到底长什么样"只有真页面说了算。
// 做法：起一个本地静态站跑生产页（与第 40 单 page-sweep 同一套注入：把 `state`／`Sim` 挂到 window），
// 在页里把世界推 30 天（真跑，不塞假数据），再点开「角色」页与一张角色详情，逐张截图；
// 同时把那一行的文字读回来做判据——**没读到「和 X · 档位（值）」就退出码 1**。
//
// 用法：node tools/rel-audit/shot.mjs [输出目录]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || 'F:/临时/rel-shot');
const PORT = 18988;
const 天 = 30;
fs.mkdirSync(OUT, { recursive: true });

const rawHtml = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到（页面末尾的 })();</script>）'); process.exit(1); }

const MIME = { '.html': 'text/html;charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return;
  }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(r);
}).listen(PORT);

const exe = process.env.CITYLIFE_CHROME || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
/* 第 86 单立的口径：退出码只看**真 JS 异常**（pageerror）与按钮失败；
   网络类（首屏 favicon 404／没起本地 `/relay` 时的 CORS 与 ERR_FAILED）只印不算——
   这里没起中转站，硬把它算红就是"永久假红"。 */
const 真异常 = [], 网络类 = [];
page.on('pageerror', e => 真异常.push('pageerror: ' + (e && e.message || e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource|CORS policy|net::ERR_|ERR_FAILED|status of 404/.test(t)) 网络类.push(t); else 真异常.push('console.error: ' + t);
});
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

// 真跑 30 天（不塞假数据），跑完点回「角色」页让渲染层重新取词
const 读数 = await page.evaluate((天) => {
  const P = window.__pv, w = P.state.world;
  for (let i = 0; i < 天 * 144; i++) P.Sim.step(w, 10);
  const 边 = [];
  for (const a of w.agents) for (const id in (a.rel || {})) {
    const o = w.agents.find(x => x.id === id);
    边.push(a.name + '→' + (o ? o.name : id) + ' v=' + a.rel[id].v + ' 档=' + P.Sim.relTierName(a.rel[id].v));
  }
  const 角色页签 = Array.from(document.querySelectorAll('#tabbar .tab')).find(b => b.dataset.tab === 'roles');
  if (角色页签) 角色页签.click();
  return { 天数: 天, 边: 边 };
}, 天);
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, '关系A档-角色页-桌面.png') });

const 行 = await page.$$eval('.rr-rel', els => els.map(e => e.textContent));
if (行.length) {
  const 卡 = await page.$('.rr-rel');
  const 框 = 卡 ? await 卡.boundingBox() : null;
  if (框) await page.screenshot({ path: path.join(OUT, '关系A档-角色卡-桌面.png'),
    clip: { x: Math.max(0, 框.x - 90), y: Math.max(0, 框.y - 60), width: 460, height: 150 } });
}
// 打开第一张角色详情（那一行在详情里还带"（累计 N 次来往）"）
const 详情 = await page.$$('text=详情');
if (详情.length) { await 详情[0].click(); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '关系A档-角色详情-桌面.png') }); }

const 判据 = /^和 .+ · (生疏|点头之交|熟|老友|家人一样)（\d+）$/;
const 好 = 行.filter(t => 判据.test(t)).length;
console.log('跑了 ' + 读数.天数 + ' 天；关系表 ' + 读数.边.length + ' 条边：');
for (const e of 读数.边) console.log('  ' + e);
console.log('角色页那一行（' + 行.length + ' 张卡）：' + 行.map(t => '「' + t + '」').join(' '));
console.log('网络类报错 ' + 网络类.length + ' 条（只印不算：favicon／没起本地中转站）；真 JS 异常 ' + 真异常.length + ' 条');
if (真异常.length) console.log('  真异常前三条：' + 真异常.slice(0, 3).join(' / '));
console.log((好 === 行.length && 好 > 0) ? ('✔ ' + 好 + '/' + 行.length + ' 张卡都印出了「和 X · 档位（值）」') :
  ('✘ 只有 ' + 好 + '/' + 行.length + ' 张卡合判据 —— 页面那一行没长对'));
console.log('图在：' + OUT);
await browser.close(); srv.close();
process.exit((好 === 行.length && 好 > 0 && 真异常.length === 0) ? 0 : 1);
