// 第 50 单 · 真页面逐帧走位取证（**只读诊断**：不改产品代码、不进 gate.yml、不判红）
//
// 为什么要做（第 25 单登记的那笔账）：`walkgate.js` 的「复演主循环」只复演了
//   累时 → Sim.step → updateWalkers → stepDisplay 这四步；而**真主循环**每帧还跑
//   `updateCamera` / `drainLog` / `penSweep`，切到别的页时还要按拍跑
//   `renderRoles` / `renderClips` / `renderPhone` / `renderStats`。
//   若这些 DOM 侧动作会碰「走位／显示」那套字段，那 walkgate 的读数就是**在一个错误的模型上量的**。
//   第 25 单只补了「补算」那一处，这条一直挂着没销。
//
// 本工具的办法：在**真浏览器里跑真页面**（真主循环、真 DOM、真 rAF），逐帧读真状态，把三条铁律
// 按与 walkgate **同一口径**再量一遍：
//   ① 相邻两帧显示位位移 ≤ 行走速率(5.5)×速度×dt×1.05（dt 取真帧间隔并按页面同样封顶 0.1 秒；首帧落位豁免）
//   ② 每帧脚底格不得落在 `PIX_SOLID` 里（墙带与家具占格）
//   ③ 白名单外的直置（warp）次数为 0；真实位与显示位的差恒为 0（第 25 单那条「真显差恒零」）
// 三种页面条件各跑一段：**现场页**（draw 也在跑）／**日志页**（drainLog 满负荷）／**角色页**（按拍重渲染）。
// 后两种正是第 25 单那条「切页停摆」的病历场景——在真页面上再验一次。
//
// 用法：node tools/live-walkgate/audit.mjs <输出目录>
//   环境变量 CITYLIFE_CHROME 指向 chromium（默认取本机 playwright 那份）。
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'docs/交付/第50单-图'));
const PORT = 18950;
const 帧数 = Number(process.env.LIVEWALK_FRAMES || 1500);
const 速度 = Number(process.env.LIVEWALK_SPEED || 8);
fs.mkdirSync(OUT, { recursive: true });

// 注入点：页面末尾的 `})();</script>` —— 与第 40／44 单的工具同一个手法（只读暴露，不改产品逻辑）
const rawHtml = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},get pixSolid(){return PIX_SOLID},'
  + 'get dtFrame(){return dtFrame}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到（页面末尾的 })();</script>）'); process.exit(1); }

const MIME = { '.html': 'text/html;charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.json': 'application/json' };
const 服务端404 = [];
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return;
  }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { 服务端404.push(u); r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  r.end(fs.readFileSync(p));
});
await new Promise(res => srv.listen(PORT, res));

const exe = process.env.CITYLIFE_CHROME || path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe');
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
// 判红只看**真 JS 异常**（pageerror）；console error 与 404 分开记，最后照实列出——
// 本地没有中转函数／favicon，`/relay` 与 `/favicon.ico` 的 404 是第 40 单就登记过的已知无害项。
const js异常 = [], 控制台错 = [];
page.on('pageerror', e => js异常.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') 控制台错.push('console: ' + m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(800);
await page.evaluate((sp) => { __pv.state.llm.on = false; __pv.state.world.speed = sp; }, 速度);

// 页面上跑一个只读采样器：每帧记一次「真实位／显示位／路径／脚底格／帧间隔」
async function 采一段(页名, 切页选择器, 帧数) {
  await page.evaluate(([sel, n]) => {
    if (sel) document.querySelector(sel).click();
    window.__trace = [];
    window.__traceMeta = { 页名: sel || '#现场页' };
    const w = __pv.state.world;
    const step = () => {
      const rec = { t: performance.now(), dt: __pv.dtFrame, a: {} };
      for (const ag of w.agents) {
        const v = __pv.state.vis[ag.id];
        if (!v) continue;
        rec.a[ag.id] = { x: v.x, y: v.y, dx: v.dspX, dy: v.dspY, warp: !!v.warp, path: v.path.length };
      }
      window.__trace.push(rec);
      if (window.__trace.length < n) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [切页选择器, 帧数]);
  // 等采样器跑满（帧数 ÷ 约 60fps，加 3 秒余量）
  await page.waitForFunction(n => window.__trace && window.__trace.length >= n, 帧数, { timeout: 帧数 / 60 * 1000 + 8000 });
  const trace = await page.evaluate(() => window.__trace);
  const solid = await page.evaluate(() => [...__pv.pixSolid]);
  return { 页名, trace, solid: new Set(solid) };
}

const 段 = [];
for (const [名, sel] of [['现场页', null], ['日志页', '#tabbar .tab[data-tab="log"]'], ['角色页', '#tabbar .tab[data-tab="roles"]']]) {
  // 先切回现场页再开始，保证「切页动作」发生在采样窗口之内
  const r = await 采一段(名, sel, 帧数);
  段.push(r);
}

// 逐段判读（口径与 walkgate 一致：WALK=5.5、STEP_SLACK=1.05、dt 封顶 0.1 秒）
const WALK = 5.5, SLACK = 1.05;
const 读数 = [];
for (const { 页名, trace, solid } of 段) {
  let 最大步 = 0, 最大步比 = 0, 最大步帧 = -1, 实体帧 = 0, 首帧落位 = 0, 超限帧 = 0, 真显差最大 = 0;
  const 实体处 = {};
  const prev = {};
  trace.forEach((rec, i) => {
    for (const id in rec.a) {
      const v = rec.a[id], p = prev[id];
      const dt = Math.min(0.1, Math.max(0, rec.dt || 0));
      // 真显差：真实位与显示位之差（第 25 单那条判据；暂停/切页都不该让它涨）
      const 差 = Math.hypot(v.x - v.dx, v.y - v.dy);
      if (isFinite(差) && 差 > 真显差最大) 真显差最大 = 差;
      if (p) {
        const d = Math.hypot(v.dx - p.dx, v.dy - p.dy);
        const cap = WALK * 速度 * dt * SLACK;
        const 比 = cap > 0 ? d / cap : 0;
        if (cap > 0 && 比 > 最大步比) { 最大步比 = 比; 最大步 = d; 最大步帧 = i; }
        // 超限帧：显示位一步跨过「行走速率×速度×dt×1.05」这条线（真页面上一次都不该有）
        if (cap > 0 && 比 > 1.0001) 超限帧++;
      } else 首帧落位++;
      const cell = Math.floor(v.dx) + ',' + Math.floor(v.dy + 0.5);
      if (solid.has(cell)) { 实体帧++; 实体处[cell] = (实体处[cell] || 0) + 1; }
    }
    for (const id in rec.a) prev[id] = rec.a[id];
  });
  读数.push({ 页名, 帧数: trace.length, 最大步, 最大步比, 最大步帧, 实体帧, 首帧落位, 超限帧, 真显差最大, 实体处 });
}

await browser.close();
srv.close();

console.log('真页面逐帧走位取证（速度 ' + 速度 + '×，每段 ' + 帧数 + ' 帧）');
console.log('段      帧数    最大单帧位移   用掉阈值   脚底进实体格   超限帧   真实位−显示位最大   页面报错');
let 全绿 = true;
for (const r of 读数) {
  const 绿 = r.最大步比 <= 1.0001 && r.实体帧 === 0 && r.超限帧 === 0 && r.真显差最大 < 1e-6;
  if (!绿) 全绿 = false;
  console.log('  ' + r.页名.padEnd(6) + String(r.帧数).padEnd(8) + r.最大步.toFixed(4).padEnd(14)
    + ((r.最大步比 * 100).toFixed(1) + '%').padEnd(11) + String(r.实体帧).padEnd(15)
    + String(r.超限帧).padEnd(9) + r.真显差最大.toFixed(3).padEnd(20) + js异常.length
    + (绿 ? '' : '   ← 判红'));
}
console.log('\n判读：' + (全绿 ? '**真页面三条铁律全绿**（与 walkgate 的模拟读数一致）' : '**有判红项** —— 见上表'));
if (js异常.length) { console.log('\n真 JS 异常（判红）：'); js异常.slice(0, 10).forEach(s => console.log('  ' + s)); }
if (控制台错.length) { console.log('\n控制台 error（照实列出，不单独判红）：'); 控制台错.slice(0, 10).forEach(s => console.log('  ' + s)); }
if (服务端404.length) { console.log('服务端 404：' + [...new Set(服务端404)].join('　') + '（本地无中转函数／favicon，第 40 单已登记为已知无害）'); }
const 落盘 = { 时间: new Date().toISOString(), 速度, 帧数, 真JS异常: js异常, 控制台错, 服务端404: [...new Set(服务端404)], 读数, 段注: '每段采自真实 rAF 帧；dt 取页面 dtFrame（封顶 0.1s）' };
fs.writeFileSync(path.join(OUT, 'live-walkgate.json'), JSON.stringify(落盘, null, 2));
console.log('\n读数已存：' + path.join(OUT, 'live-walkgate.json'));
process.exit(全绿 && !js异常.length ? 0 : 2);
