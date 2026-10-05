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
/* 第 115 单加：这 30 天里**每天给顾云帆发一条短信**（走生产 `Sim.sendMessage`，不是塞假数据）——
   跑完他那张卡上「和你」应该长到「熟（30）」（一天 +1）。这是玩家篇①期的真跑取证。 */
const 读数 = await page.evaluate((天) => {
  const P = window.__pv, w = P.state.world;
  let 发信 = 0;
  for (let d = 1; d <= 天; d++) {
    for (let i = 0; i < 144; i++) P.Sim.step(w, 10);
    if (P.Sim.sendMessage(w, 'a1', 'cheer')) 发信++;
  }
  const 边 = [];
  for (const a of w.agents) for (const id in (a.rel || {})) {
    const o = w.agents.find(x => x.id === id);
    边.push(a.name + '→' + (o ? o.name : id) + ' v=' + a.rel[id].v + ' 档=' + P.Sim.relTierName(a.rel[id].v));
  }
  const 你 = w.agents.map(a => a.name + '：' + P.Sim.relYouGet(a) + '（' + P.Sim.relTierName(P.Sim.relYouGet(a)) + '）');
  const 角色页签 = Array.from(document.querySelectorAll('#tabbar .tab')).find(b => b.dataset.tab === 'roles');
  if (角色页签) 角色页签.click();
  return { 天数: 天, 边: 边, 你: 你, 发信: 发信 };
}, 天);
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, '关系A档-角色页-桌面.png') });

const 行 = await page.$$eval('.rr-rel', els => els.map(e => e.textContent));
const 你行 = await page.$$eval('.rr-you', els => els.map(e => e.textContent));   // 第 115 单·「和你」
if (行.length) {
  const 卡 = await page.$('.rr-rel');
  /* 第 237 单：手账二期把角色页拉长了——固定尺寸的截图框会越出视口
     （Playwright 直接抛 `Clipped area is either empty or outside the resulting image`）。
     修法：先把那张卡滚进视口，再把框按视口**夹取**，尺寸不变、判据不变。 */
  if (卡) await 卡.scrollIntoViewIfNeeded();
  const 框 = 卡 ? await 卡.boundingBox() : null;
  if (框) {
    const vp = page.viewportSize() || { width: 1400, height: 900 }, W = 460, H = 180;
    const x = Math.max(0, Math.min(框.x - 90, vp.width - W));
    const y = Math.max(0, Math.min(框.y - 60, vp.height - H));
    await page.screenshot({ path: path.join(OUT, '关系A档-角色卡-桌面.png'), clip: { x, y, width: W, height: H } });
  }
}
// 打开第一张角色详情（那一行在详情里还带"（累计 N 次来往）"）
const 详情 = await page.$$('text=详情');
if (详情.length) { await 详情[0].click(); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '关系A档-角色详情-桌面.png') }); }
// 先关掉详情弹窗（不然它的遮罩会挡住下面短信页的点击）
{
  const 关 = await page.$('#dialog-root [data-close]');
  if (关) { await 关.click(); await page.waitForTimeout(250); }
  else { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
}
// 第 115 单：往来记录顶上那一行「你在他心里：…」
let 你线 = '';
{
  await page.evaluate(() => {
    const 短信页 = Array.from(document.querySelectorAll('#tabbar .tab')).find(b => b.dataset.tab === 'phone');
    if (短信页) 短信页.click();
  });
  await page.waitForTimeout(300);
  const 芯片 = await page.$('#ph-agents [data-to="a1"]');
  if (芯片) { await 芯片.click(); await page.waitForTimeout(300); }
  const el = await page.$('.ph-you');
  你线 = el ? (await el.textContent()) : '';
  await page.screenshot({ path: path.join(OUT, '玩家篇-往来记录-桌面.png') });
}

const 判据 = /^和 .+ · (生疏|点头之交|熟|老友|家人一样)（\d+）$/;
const 好 = 行.filter(t => 判据.test(t)).length;
console.log('跑了 ' + 读数.天数 + ' 天；关系表 ' + 读数.边.length + ' 条边：');
for (const e of 读数.边) console.log('  ' + e);
console.log('角色页那一行（' + 行.length + ' 张卡）：' + 行.map(t => '「' + t + '」').join(' '));
console.log('第 115 单「和你」（' + 你行.length + ' 张卡）：' + 你行.map(t => '「' + t + '」').join(' ')
  + '；账：' + 读数.你.join('／') + '（30 天里发了 ' + 读数.发信 + ' 条）');
console.log('往来记录那一行：' + JSON.stringify(你线));
console.log('网络类报错 ' + 网络类.length + ' 条（只印不算：favicon／没起本地中转站）；真 JS 异常 ' + 真异常.length + ' 条');
if (真异常.length) console.log('  真异常前三条：' + 真异常.slice(0, 3).join(' / '));
const 判你 = /^(还没说上过话|(生疏|点头之交|熟|老友|家人一样)（\d+）)$/;
const 你好 = 你行.filter(t => 判你.test(t)).length, 你有值 = 你行.some(t => t !== '还没说上过话');
const 线好 = /你在他心里：(生疏|点头之交|熟|老友|家人一样)（\d+）/.test(你线);
console.log((好 === 行.length && 好 > 0) ? ('✔ ' + 好 + '/' + 行.length + ' 张卡都印出了「和 X · 档位（值）」') :
  ('✘ 只有 ' + 好 + '/' + 行.length + ' 张卡合判据 —— 页面那一行没长对'));
console.log((你好 === 你行.length && 你行.length > 0 && 你有值 && 线好)
  ? ('✔ 玩家篇①期：' + 你好 + '/' + 你行.length + ' 张卡都印出了「和你」，且**至少一张有值**；往来记录顶上那行也在')
  : ('✘ 玩家篇①期：合规 ' + 你好 + '/' + 你行.length + '，有值=' + 你有值 + '，往来记录那行=' + 线好));
console.log('图在：' + OUT);
await browser.close(); srv.close();
process.exit((好 === 行.length && 好 > 0 && 你好 === 你行.length && 你行.length > 0 && 你有值 && 线好
  && 真异常.length === 0) ? 0 : 1);
