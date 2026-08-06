// 第 25 单·切页返回取证截图：「离开 → 停留 → 切回」的连续帧，前后对照。
//
// 与 walk_shots.mjs 的分工：那支管「一次走位的过程」，这支管「切页停摆再恢复」这一类时序。
// 关键手法沿用第 20 单：冻结 rAF 改为手动逐帧驱动，于是同一段时序在 before/after 两份源码上
// 跑出逐帧可对齐的两串画面 —— 「飞越」持续两三秒、跨几十帧，静止图根本说明不了问题。
//
// 保真度要点（本单新增）：
//   ① 切页走的是**生产的 setScreen()**，不是脚本自己拨 class；
//   ② 该不该出画，问的是**生产的那句判据** `#scr-live.classList.contains('active')`；
//   ③ 显示推进用 typeof 判定兼容两份源码 —— 治前没有 stepAllDisplays（推进还在 draw() 里，
//      故切页时它随 draw 一起停，病症自然复现）；治后有（推进在 loop 里，不随切页停）。
//   三条合起来保证：截到的是生产代码本身的行为，不是脚本模拟出来的行为。
//
// 用法: node pageswitch_shots.mjs <html文件> <输出目录> <前缀 before|after>
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const SRC = process.argv[2], OUT = process.argv[3], TAG = process.argv[4] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PORT = 18911;

const INJECT = `
window.__pv={
  get state(){return state},
  freeze(){ window.requestAnimationFrame=function(){return 0}; },
  // 一帧：复演 loop() 里与走位/出画有关的那几步。Sim.step 不跑 —— 与第 20 单同口径，
  // 让 before/after 两趟逐帧严格对齐（走位由 updateWalkers 沿既有折线推进，正是本单要看的那一层）。
  frame(dt,now){
    dtFrame=dt;
    updateWalkers(dt);
    if(typeof stepAllDisplays==='function') stepAllDisplays(dt);      // 治后：推进在 loop 里，切页不停
    if(document.querySelector('#scr-live').classList.contains('active')) draw(now);   // 生产判据原文
  },
  screen(id){ setScreen(id); },                                       // 生产切页函数原文
  // dt=0 的纯重绘：把「切回那一瞬间」画出来而不推进任何状态。
  // 必须置 dtFrame=0 —— 治前的 draw() 内部还会调 stepDisplay(ag,dtFrame,…)，
  // 不清零就会白白吃掉一帧的追赶量，f00 那张就不是「切回瞬间」了。
  // 也不调 updateWalkers：它会把 v.moving 置 false（budget=0），既改精灵动作又会触发兜底钳制。
  paint(){ dtFrame=0; if(document.querySelector('#scr-live').classList.contains('active')) draw(window.__now||1000); },
  onLive(){ return document.querySelector('#scr-live').classList.contains('active'); },
  reset(id,anchor){ const ag=state.world.agents.find(a=>a.id===id); ag.anchor=anchor;
    const a=Sim.ANCHORS[anchor];
    state.vis[id]={x:a.x+0.5,y:a.y+0.5,path:[],anchor:anchor,dir:3,moving:false}; },
  go(id,anchor){ state.world.agents.find(a=>a.id===id).anchor=anchor; },
  disp(){ const o={}; for(const k in state.vis){ const v=state.vis[k];
    o[k]={x:v.dspX,y:v.dspY,px:v.x,py:v.y,path:v.path.length,moving:!!v.moving}; } return o; },
  solid(){ return [...PIX_SOLID]; },
};
`;
const html = fs.readFileSync(SRC, 'utf8').replace(/\}\)\(\);\s*<\/script>/, INJECT + '\n})();\n</script>');

const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u.startsWith('/assets/')) {
    const f = path.join(REPO, 'assets', path.basename(u));
    if (!fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': 'image/png' }); r.end(fs.readFileSync(f)); return;
  }
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`);
await new Promise(r => setTimeout(r, 2600));                     // 等素材侧载完成
await page.evaluate(() => { __pv.freeze(); __pv.state.llm.on = false; __pv.state.cam.manual = true; __pv.state.world.speed = 1; });
await new Promise(r => setTimeout(r, 200));

const DT = 1 / 60;
fs.mkdirSync(OUT, { recursive: true });

// 截图区域按世界格给定，落到画布上再与画布可视区求交（防止取景跑到画布外）
const shot = async (name, wx0, wy0, wc, hc) => {
  const reg = await page.evaluate(([x0, y0, w, h]) => {
    const r = document.querySelector('#cv').getBoundingClientRect();
    const s = __pv.state.view.s;
    let x = r.x + __pv.state.view.ox + x0 * s, y = r.y + __pv.state.view.oy + y0 * s;
    let width = w * s, height = h * s;
    const x1 = Math.min(x + width, r.x + r.width), y1 = Math.min(y + height, r.y + r.height);
    x = Math.max(x, r.x); y = Math.max(y, r.y);
    return { x, y, width: Math.max(1, x1 - x), height: Math.max(1, y1 - y) };
  }, [wx0, wy0, wc, hc]);
  await page.screenshot({ path: path.join(OUT, `${TAG}-${name}.png`), clip: reg });
};
const APTALL = [0.6, 0.6, 19.8, 12.4];                           // 公寓全景（三间房）
const TOWN   = [0.0, 0.0, 30.0, 22.0];                           // 公寓＋街道＋公园一带

const advance = async (n, capture) => await page.evaluate(([n, dt, cap]) => {
  const trace = [];
  for (let i = 0; i < n; i++) { window.__now = (window.__now || 1000) + dt * 1000; __pv.frame(dt, window.__now); if (cap) trace.push(__pv.disp()); }
  return trace;
}, [n, DT, !!capture]);

/* ── 时序：四人都在公寓里 → 全部出门去远处 → 看 1 秒 → 切到日志页停 2.5 秒 → 切回，连续截 12 帧 ──
   这正是决策者的实测路径。切回后 before 会看到四人从公寓旧位沿直线飞向街上真实位（穿墙穿家具），
   after 则四人本来就在街上该在的地方、照常走路。 */
const HOME = { a1: 'home_table', a2: 'bed2', a3: 'kitchen', a4: 'home_tv' };
const AWAY = { a1: 'market', a2: 'park_bench', a3: 'river_walk', a4: 'store_counter' };
// 停留 2.5 秒。取值理由：四人去街市/公园/江边/便利店的脚程在 5 秒上下，
// 而「出门 1 秒 ＋ 停留 2.5 秒」＝3.5 秒 < 脚程，故切回那一刻四人都还在半路上 ——
// 治后那一串才能看出「切回后照常走路」，停久了人已到站站定，画面只剩静止、什么也证明不了。
// 真显差也够大：2.5 秒 ×5.5 格/秒 ≈ 13.75 格，足以让治前那条直线横穿墙体与家具。
const STALL_FRAMES = 150;
// 切回后连续 12 张、每 8 帧一张 ＝ 覆盖 88 帧≈1.5 秒，正好盖住治前那段飞越的全程
// （飞越时长≈真显差÷(5.5×速度+6)＝20÷11.5≈1.7 秒）。
const STRIP = 12, STRIDE = 8;

await page.evaluate(h => { for (const k in h) __pv.reset(k, h[k]); }, HOME);
await advance(60, false);
await page.evaluate(a => { for (const k in a) __pv.go(k, a[k]); }, AWAY);
await advance(60, false);                                         // 出门走一秒，玩家看得见

const beforeLeave = await page.evaluate(() => __pv.disp());
await shot('p0-离开前', ...TOWN);
await shot('p0-离开前-公寓', ...APTALL);

// ── 切页：走生产 setScreen，停留 STALL_FRAMES 帧 ──
await page.evaluate(() => __pv.screen('log'));
const onLiveDuringStall = await page.evaluate(() => __pv.onLive());
await advance(STALL_FRAMES, false);
const atReturn = await page.evaluate(() => __pv.disp());

// ── 切回：连续帧 ──
await page.evaluate(() => __pv.screen('live'));
await page.waitForTimeout(150);            // 等回流：切回那一刻 #scr-live 刚从 display:none 恢复，立刻量矩形会量到 0×0
await page.evaluate(() => __pv.paint());   // 把「切回瞬间」这一帧画出来（dt=0，零状态推进）
const strip = [];
for (let k = 0; k < STRIP; k++) {
  const d = await page.evaluate(() => __pv.disp());
  strip.push({ k, f: k * STRIDE, d });
  await shot(`p1-切回-f${String(k).padStart(2, '0')}`, ...TOWN);
  await shot(`p1-切回-公寓-f${String(k).padStart(2, '0')}`, ...APTALL);
  if (k < STRIP - 1) await advance(STRIDE, false);
}

// ── 读数：切回瞬间的真显差，以及连续帧里每人的最大单帧显示位移 ──
const ids = ['a1', 'a2', 'a3', 'a4'];
const gapAtReturn = {}, maxStep = {};
for (const id of ids) {
  const a = atReturn[id];
  gapAtReturn[id] = Math.hypot(a.px - a.x, a.py - a.y);
  let m = 0;
  for (let i = 1; i < strip.length; i++) {
    const p = strip[i - 1].d[id], q = strip[i].d[id];
    m = Math.max(m, Math.hypot(q.x - p.x, q.y - p.y) / STRIDE);
  }
  maxStep[id] = m;
}
const out = {
  tag: TAG, stallFrames: STALL_FRAMES, strip: STRIP, stride: STRIDE,
  切页期间_scrLive_active: onLiveDuringStall,
  离开前: beforeLeave, 切回瞬间: atReturn,
  切回瞬间真显差_格: gapAtReturn,
  切回后最大单帧显示位移_格: maxStep,
  连续帧: strip,
};
fs.writeFileSync(path.join(OUT, `${TAG}-读数.json`), JSON.stringify(out, null, 1));
console.log(`${TAG}：切页期间 #scr-live.active = ${onLiveDuringStall}`);
for (const id of ids) console.log(`  ${id} 切回瞬间真显差 ${gapAtReturn[id].toFixed(3)} 格 · 切回后最大单帧显示位移 ${maxStep[id].toFixed(5)} 格`);
await browser.close(); srv.close();
console.log(`${TAG} 切页取证截图完成 → ${OUT}`);
process.exit(0);
