// 第 20 单·走位取证截图：三处病症的前后对照，瞬移与穿桌两条给「移动过程」的连续帧。
//
// 与 preview_shots.mjs 的分工：那支管「静止观感目验」，这支管「运动过程取证」。
// 关键手法＝把主循环停掉改为手动逐帧驱动（冻结 rAF ＋ 冻结 Sim.step），
// 于是同一段走位在 before/after 两份源码上跑出逐帧可对齐的两串画面，
// 不受掉帧/调度抖动影响 —— 否则「瞬移」这种只占一帧的现象根本截不到。
//
// 用法: node walk_shots.mjs <html文件> <输出目录> <前缀 before|after>
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const SRC = process.argv[2], OUT = process.argv[3], TAG = process.argv[4] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PORT = 18907;

const INJECT = `
window.__pv={
  get state(){return state}, get Sim(){return Sim},
  freeze(){ window.requestAnimationFrame=function(){return 0}; },
  // 第 25 单：显示位推进已从 draw() 提到 loop()，手动驱动须照样补上这一步。
  // typeof 判定是为了同一支脚本能同时驱动治前/治后两份源码（治前没有 stepAllDisplays，
  // 推进仍在 draw() 内）—— before/after 取证靠的就是这个兼容写法。
  step(dt,now){ dtFrame=dt; updateWalkers(dt); if(typeof stepAllDisplays==='function') stepAllDisplays(dt); draw(now); },
  reset(id,anchor){ const ag=state.world.agents.find(a=>a.id===id); ag.anchor=anchor;
    const a=Sim.ANCHORS[anchor];
    state.vis[id]={x:a.x+0.5,y:a.y+0.5,path:[],anchor:anchor,dir:3,moving:false}; },
  go(id,anchor){ state.world.agents.find(a=>a.id===id).anchor=anchor; },
  disp(){ const o={}; for(const k in state.vis){ const v=state.vis[k];
    o[k]={x:v.dspX,y:v.dspY,px:v.x,py:v.y,path:v.path.length,moving:!!v.moving}; } return o; },
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 3 });
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`);
await new Promise(r => setTimeout(r, 2600));                    // 等素材侧载完成
await page.evaluate(() => { __pv.freeze(); __pv.state.cam.manual = true; __pv.state.world.speed = 1; });
await new Promise(r => setTimeout(r, 200));

const DT = 1 / 60;
const shot = async (name, wx0, wy0, wc, hc) => {
  const reg = await page.evaluate(([x0, y0, w, h]) => {
    const r = document.querySelector('#cv').getBoundingClientRect();
    const s = __pv.state.view.s;
    return { x: r.x + __pv.state.view.ox + x0 * s, y: r.y + __pv.state.view.oy + y0 * s, width: w * s, height: h * s };
  }, [wx0, wy0, wc, hc]);
  await page.screenshot({ path: path.join(OUT, `${TAG}-${name}.png`), clip: reg });
};
const LIVING = [0.7, 2.7, 10.6, 9.6];                            // 客厅（含底缘门洞）
const APTALL = [0.6, 0.6, 19.8, 11.8];                           // 公寓全景

// 场景装配：把四位住户摆到指定锚，逐帧推进 n 帧（不截图），返回逐帧显示位
async function setup(assign) {
  await page.evaluate(a => { for (const k in a) __pv.reset(k, a[k]); }, assign);
}
async function advance(n, capture) {
  return await page.evaluate(([n, dt, cap]) => {
    const trace = [];
    let now = 1000;
    for (let i = 0; i < n; i++) { now += dt * 1000; __pv.step(dt, now); if (cap) trace.push(__pv.disp()); }
    return trace;
  }, [n, DT, !!capture]);
}

/* ── 图一 · 病症一：四人落位于餐桌，看家具是否盖住人 ── */
await setup({ a1: 'home_table', a2: 'home_table', a3: 'home_table', a4: 'home_table' });
await advance(90, false);
await shot('sym1-home_table', ...LIVING);
console.log(`${TAG}-sym1-home_table.png`);

/* ── 图二 · 病症二：厨房就位（a4＝kitchen 表第 4 位，偏移 4.5,1 —— 旁路正是被它撑开的） ── */
// mode='arrive'：截「走到、v.path 清空」那一帧的前后。这是 before/after 都存在的同一个语义时刻，
//   两份源码据此对齐才可比 —— 若改用「单帧位移最大」定位，治后全程位移一样大，峰值会落在随机一帧，对不上。
//   病症二的瞬移恰恰就发生在这一帧（旧写法在此贴上站位偏移），故这个锚点同时也是案发现场。
// mode='start'：截离位起步后的连续若干帧（用于抓穿桌，看的是一整段轨迹而非某一帧）
// stride：隔几帧截一张（起步段慢，隔帧取样才看得出位移）
async function eventStrip(name, assign, mover, dest, region, opt = {}) {
  const { mode = 'arrive', maxFrames = 420, pre = 2, post = 4, stride = 1 } = opt;
  await setup(assign); await advance(60, false);
  await page.evaluate(([id, d]) => __pv.go(id, d), [mover, dest]);
  const trace = await advance(maxFrames, true);
  let peak = 0, peakI = 0, arriveI = -1;
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1][mover], b = trace[i][mover];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > peak) { peak = d; peakI = i; }
    if (arriveI < 0 && trace[i - 1][mover].path > 0 && trace[i][mover].path === 0) arriveI = i;
  }
  if (arriveI < 0) arriveI = peakI;
  // 第二趟：同样装配重跑，逐帧截图（手动驱动 ⇒ 两趟逐帧完全对齐，before/after 亦然）
  await setup(assign); await advance(60, false);
  await page.evaluate(([id, d]) => __pv.go(id, d), [mover, dest]);
  const start = (mode === 'arrive') ? Math.max(0, arriveI - pre) : 0;
  if (start > 0) await advance(start, false);
  const out = [];
  const shots = (mode === 'arrive') ? (pre + post) : post;
  for (let k = 0; k <= shots; k++) {
    const p = await page.evaluate(() => __pv.disp());
    out.push({ f: start + k * stride, x: p[mover].x, y: p[mover].y });
    await shot(`${name}-f${String(k).padStart(2, '0')}`, ...region);
    if (k < shots) await advance(mode === 'arrive' ? 1 : stride, false);
  }
  console.log(`${TAG}-${name}: 到位帧 #${arriveI}，全程峰值帧 #${peakI} 单帧位移 ${peak.toFixed(3)} 格 | ` +
    out.map(o => `f${o.f}(${o.x.toFixed(2)},${o.y.toFixed(2)})`).join(' → '));
  return { peak, peakI, arriveI, out };
}

const sym2 = await eventStrip('sym2-kitchen-arrive',
  { a1: 'home_table', a2: 'home_table', a3: 'kitchen', a4: 'home_table' }, 'a4', 'kitchen', APTALL);

/* ── 图三 · 病症三：离座去沙发。这一段是「同房间内两锚之间」，buildPath 只给一根直线，
      而这根直线的脚底轨迹正好压过餐桌实体格（3,8 / 4,8 / 4,9 / 5,9）—— 决策者说的「直线穿过桌子」就是它。
      a2＝home_table 表第 2 位＝左席，起步那一帧还叠着「撤销偏移」的跳变，两条病症同一串画面里都看得到。 ── */
const sym3 = await eventStrip('sym3-table-leave',
  { a1: 'home_table', a2: 'home_table', a3: 'home_table', a4: 'home_table' }, 'a2', 'home_tv', LIVING,
  { mode: 'start', post: 9, stride: 5 });

/* ── 图四 · 病症二之二：上座（走到餐桌落位那一刻） ── */
const sym2b = await eventStrip('sym2-table-arrive',
  { a1: 'bed1', a2: 'bed2', a3: 'bed3', a4: 'bed4' }, 'a2', 'home_table', LIVING);

fs.writeFileSync(path.join(OUT, `${TAG}-读数.json`), JSON.stringify({ tag: TAG, sym2, sym3, sym2b }, null, 1));
await browser.close(); srv.close();
console.log(`${TAG} 取证截图完成`);
process.exit(0);
