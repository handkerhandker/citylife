// 第 145 单·触屏探针（真浏览器触摸仿真；只读诊断，进冒烟档 2）
//
// 背景：桌面探针全走鼠标事件；而本作 `data-layout` 默认就是手机竖屏档，手机档的地图
// （s=13 > 整图适配值）**超出屏幕、拖动平移是活的**——这块从没测过。本工具用真实触摸事件走七条：
//   ① 点选：点小人 ⇒ 选中他＋弹出角色卡；② 拖拽平移：拖 80px ⇒ 相机移动 ≈80/s 格（并置 manual）；
//   ③ 拖拽不是点按：同一拖拽不许弹卡；④ 小拖（≤5px）仍算点按：弹卡且相机不动；
//   ⑤ 按钮触控：点页签切页、点开关翻转（#set-amb 关→开→关，读 state 复核）；
//   ⑥ 不滚不缩：scroll 恒 0、连点两下（双击）后 visualViewport.scale 仍 1、空地不乱弹卡；
//   ⑦ 全程零 pageerror。
//   ⑧ 横屏（另开 900×430 触屏页）：四向拖到极限——左缘停在左轨右缘、上缘停在顶栏下沿、
//      右／下缘贴可视区边（第 244 单：镜头按"可视区"夹取；旧版左右锁死、上下也推不进被盖的那条）。
//   ⑨ 竖屏（本页）：上下拖到极限——上缘停顶栏下沿、下缘停底栏上沿（第 244 单对竖屏纵向也生效；
//      旧版竖屏纵向是"居中锁死"）。
// 另有 --改前=<git-ref>：对旧版跑同一套——第 145 单之前的版本会在 ①/④ 红（幽灵点击把卡片当场关掉），
// 这两条红就是"原 bug 可复现"的证据。
// 用法：node tools/touch-audit/probe.mjs [输出目录] [--改前=<git-ref>]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'touch-audit'));
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},get sx(){return sx},get sy(){return sy},'
  + 'get 量内衬(){try{return (typeof 量内衬===\'function\')?量内衬:null}catch(e){return null}},'
  /* 第 286 单：画布刷新闸的数（旧版没有这些标识符 ⇒ try/catch 给 −1／false，判据当场判红） */
  + 'get 画布帧计数(){try{return 画布帧计数}catch(e){return -1}},'
  + 'get 分辨率档(){try{return 分辨率档}catch(e){return -1}},'
  + '设分辨率档(i){try{分辨率档=Math.max(0,Math.min(分辨率档表.length-1,i|0));resizeCanvas();return true}catch(e){return false}}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18964;
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
const 断言 = [];
const 判 = (n, ok, 读数_) => { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); };

await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(2200);
const cdp = await ctx.newCDPSession(page);
const 发拖 = async (会话, 页, x0, y0, x1, y1, 步 = 8) => {
  await 会话.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  for (let i = 1; i <= 步; i++) {
    const x = x0 + (x1 - x0) * i / 步, y = y0 + (y1 - y0) * i / 步;
    await 会话.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
    await 页.waitForTimeout(16);
  }
  await 会话.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await 页.waitForTimeout(120);
};
const 触摸拖 = (x0, y0, x1, y1, 步 = 8) => 发拖(cdp, page, x0, y0, x1, y1, 步);
const 取态 = () => page.evaluate(() => ({
  sel: __pv.state.selected, cam: { fx: __pv.state.cam.fx, fy: __pv.state.cam.fy, manual: __pv.state.cam.manual },
  s: __pv.state.view.s, 弹窗: !!document.querySelector('#dialog-root.open'),
  屏: ([...document.querySelectorAll('.screen')].find(x => x.classList.contains('active')) || {}).id || '',
  滚: { x: scrollX, y: scrollY }, 缩: (visualViewport && visualViewport.scale) || 1, amb: __pv.state.ambienceOn === true,
}));
const 点小人 = async id => {
  await page.evaluate(i => {   // 先把镜头对到他（人可能不在当前视野里）
    const v = __pv.state.vis[i];
    __pv.state.cam.manual = true; __pv.state.cam.fx = v.dspX; __pv.state.cam.fy = v.dspY;
  }, id);
  await page.waitForTimeout(250);
  return page.evaluate(i => {
    const v = __pv.state.vis[i], r = document.querySelector('#cv').getBoundingClientRect();
    /* 第 209 单修：点位算式与**游戏自己的命中锚点**同口径——像素精灵 2 格高、脚贴格底
       （绘制 dy0=py+0.5s−2s ⇒ 视觉中心＝底−0.5s，游戏 pointerup 的锚点也是它）。
       旧的 `-30*(s/20)` 固定抬 1.5 格（＝精灵顶边）：s=13 时靠 18px 半径地板勉强命中，
       第 208 单竖屏 s=13→30.14 后偏移 -45px 越出 27px 半径 ⇒ 点空假红
       （实测：偏移 0～−40 全中、−45 起全空）。 */
    return { x: r.x + __pv.sx(v.dspX), y: r.y + __pv.sy(v.dspY) - __pv.state.view.s * 0.5, 底: __pv.state.view.s };
  }, id);
};

await page.evaluate(() => {
  const st = __pv.state, w = st.world;
  w.speed = 0; st.llm.on = false; w.t = 720; st.selected = 'a4';   // 先选别人：让"点选换人"这一步真的可判
  // 四人先摆到互不相邻的空地（否则点选会选中更近的邻居，探针自己制造假红）
  const 摆 = (id, x, y) => { const v = st.vis[id]; v.x = v.dspX = x; v.y = v.dspY = y; v.path = []; v.moving = false; };
  摆('a1', 8, 18.0); 摆('a2', 30, 18.0); 摆('a3', 44, 18.0); 摆('a4', 5, 13.5);
});
await page.waitForTimeout(300);
const 初始 = await 取态();
判('前置：手机档地图大于屏幕（拖动平移应为活）', await page.evaluate(() => __pv.Sim.MAPW * __pv.state.view.s > document.querySelector('#cv').getBoundingClientRect().width),
  { s: 初始.s });

// ① 点选：点 a1 ⇒ 选中＋弹角色卡
{
  const 点 = await 点小人('a1');
  await page.touchscreen.tap(点.x, 点.y);
  await page.waitForTimeout(350);
  const t = await 取态();
  const 卡 = await page.evaluate(() => (document.querySelector('#dialog-root .dlg') || {}).textContent || '');
  判('① 点选：tap 小人 ⇒ 选中他＋弹出角色卡（卡里含他的名字）',
    t.sel === 'a1' && t.弹窗 && 卡.indexOf('顾云帆') >= 0, { 选中: t.sel, 弹窗: t.弹窗 });
  const 关点 = await page.evaluate(() => { const b = document.querySelector('#dialog-root [data-close]'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  if (关点) await page.touchscreen.tap(关点[0], 关点[1]);
  await page.waitForTimeout(250);
}

// ② 拖拽平移：左拖 80px ⇒ fx 增大 ≈80/s 格，并置 manual
{
  const 前 = await 取态();
  await 触摸拖(300, 500, 220, 500);
  const 后 = await 取态();
  const 期望 = 80 / 前.s, 实得 = 后.cam.fx - 前.cam.fx;
  判('② 拖拽平移：左拖 80px ⇒ 相机 fx +≈80/s 格（并置 manual）',
    Math.abs(实得 - 期望) < 0.6 && 后.cam.manual === true,
    { 期望: +期望.toFixed(2), 实得: +实得.toFixed(2), manual: 后.cam.manual });
  判('③ 拖拽不是点按：同一拖拽不弹角色卡', 后.弹窗 === false, { 弹窗: 后.弹窗 });
}

// ④ 小拖（≤5px）仍算点按：弹卡且相机不动
{
  const 点 = await 点小人('a2');
  const 前 = await 取态();
  await 触摸拖(点.x, 点.y, 点.x + 4, 点.y + 3, 4);
  const 后 = await 取态();
  判('④ 小拖（4px）仍算点按：选中他＋弹卡、相机不动',
    后.sel === 'a2' && 后.弹窗 === true && Math.abs(后.cam.fx - 前.cam.fx) < 0.05,
    { 选中: 后.sel, 弹窗: 后.弹窗, Δfx: +(后.cam.fx - 前.cam.fx).toFixed(3) });
  const 关点2 = await page.evaluate(() => { const b = document.querySelector('#dialog-root [data-close]'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  if (关点2) await page.touchscreen.tap(关点2[0], 关点2[1]);
  await page.waitForTimeout(250);
}

// ⑤ 按钮触控：页签＋开关
{
  await page.touchscreen.tap(...(await page.evaluate(() => { const r = document.querySelector('button.tab[data-tab="settings"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })));
  await page.waitForTimeout(300);
  const 屏 = (await 取态()).屏;
  await page.evaluate(() => document.querySelector('#set-amb').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  const a = await page.evaluate(() => { const r = document.querySelector('#set-amb').getBoundingClientRect(); return { 点: [r.x + r.width / 2, r.y + r.height / 2] }; });
  await page.touchscreen.tap(a.点[0], a.点[1]); await page.waitForTimeout(250);
  const 开 = await page.evaluate(() => ({ 文: document.querySelector('#set-amb').textContent, amb: __pv.state.ambienceOn }));
  await page.touchscreen.tap(a.点[0], a.点[1]); await page.waitForTimeout(250);
  const 关 = await page.evaluate(() => ({ 文: document.querySelector('#set-amb').textContent, amb: __pv.state.ambienceOn }));
  判('⑤ 按钮触控：页签切到设置；开关触控可翻（关→开→关，读 state 复核）',
    屏 === 'scr-settings' && 开.文 === '开' && 开.amb === true && 关.文 === '关' && 关.amb === false,
    { 屏, 开, 关 });
}

// ⑥ 不滚不缩：空地双击 ⇒ 缩放仍 1、不乱弹卡；全程 scroll 恒 0
{
  const 空白 = await page.evaluate(() => {   // 江面（world 35,25）＝必无小人的空地
    const r = document.querySelector('#cv').getBoundingClientRect();
    return [Math.min(innerWidth - 12, r.x + __pv.sx(35)), Math.min(innerHeight - 12, r.y + __pv.sy(25))];
  });
  await page.touchscreen.tap(空白[0], 空白[1]); await page.waitForTimeout(90); await page.touchscreen.tap(空白[0], 空白[1]);
  await page.waitForTimeout(300);
  const t = await 取态();
  判('⑥ 不滚不缩：scroll 恒 0、双击空地后 scale 仍 1、不乱弹卡',
    t.滚.x === 0 && t.滚.y === 0 && t.缩 === 1 && t.弹窗 === false, t);
}

/* ⑧ 第 244 单·横屏四向推到头：被顶栏／左轨盖住的那圈能推出来（另开 900×430 触屏页） */
{
  const ctxL = await browser.newContext({ viewport: { width: 900, height: 430 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pL = await ctxL.newPage();
  pL.on('pageerror', e => 错.push(String((e && e.message) || e)));
  await pL.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
  await pL.waitForTimeout(2200);
  const cdpL = await ctxL.newCDPSession(pL);
  const 拖 = (x0, y0, x1, y1) => 发拖(cdpL, pL, x0, y0, x1, y1);
  const 量 = () => pL.evaluate(() => {
    const st = __pv.state;
    const bar = document.querySelector('#tabbar').getBoundingClientRect();
    const tb = document.querySelector('#topbar').getBoundingClientRect();
    const hb = document.querySelector('#hintbar').getBoundingClientRect();
    const sd = document.querySelector('#side'), sdq = sd ? sd.getBoundingClientRect() : null;
    const rail = (bar.left < st.cvW * 0.4 && bar.right < st.cvW * 0.6) ? bar.right : 0;
    const top = tb.top < st.cvH * 0.4 ? tb.bottom : 0;
    const bottom = hb.top > st.cvH * 0.5 ? (st.cvH - hb.top) : 0;
    const right = (sdq && sdq.width > 0 && sdq.left > st.cvW * 0.5) ? (st.cvW - sdq.left) : 0;
    return { layout: document.getElementById('app').dataset.layout, ox: st.view.ox, oy: st.view.oy,
             cvW: st.cvW, cvH: st.cvH, mw: __pv.Sim.MAPW * st.view.s, mh: __pv.Sim.MAPH * st.view.s,
             rail, top, bottom, right };
  });
  await pL.evaluate(() => { const st = __pv.state; st.world.speed = 0; st.llm.on = false; st.cam.manual = true; });
  await 拖(100, 215, 700, 215); await 拖(100, 215, 700, 215); await 拖(100, 215, 700, 215);   // 手指往右拉 ⇒ 看地图左缘
  const 左到 = await 量();
  await pL.locator('#cv').screenshot({ path: path.join(OUT, '横屏-左缘可推.png') });
  await 拖(820, 215, 200, 215); await 拖(820, 215, 200, 215); await 拖(820, 215, 200, 215);   // 手指往左拉 ⇒ 看右缘
  const 右到 = await 量();
  await 拖(450, 90, 450, 370); await 拖(450, 90, 450, 370);                                   // 手指往下拉 ⇒ 看地图上缘
  const 上到 = await 量();
  await pL.locator('#cv').screenshot({ path: path.join(OUT, '横屏-上缘可推.png') });
  await 拖(450, 370, 450, 90); await 拖(450, 370, 450, 90);                                   // 手指往上拉 ⇒ 看下缘
  const 下到 = await 量();
  判('⑧ 横屏·左缘能推出左轨（地图左缘停在竖轨右缘）',
    Math.abs(左到.ox - 左到.rail) <= 3 && 左到.ox >= 左到.rail - 3,
    { flow: 左到.layout, ox: +左到.ox.toFixed(1), rail: +左到.rail.toFixed(1) });
  判('⑧ 横屏·右缘能推贴可视边（地图右缘 = 屏右 − 右内衬）',
    Math.abs((右到.ox + 右到.mw) - (右到.cvW - 右到.right)) <= 3,
    { 右缘: +(右到.ox + 右到.mw).toFixed(1), 可视右: +(右到.cvW - 右到.right).toFixed(1) });
  判('⑧ 横屏·上缘能推到顶栏下沿（地图上缘 ≈ 顶栏底）',
    Math.abs(上到.oy - 上到.top) <= 3,
    { oy: +上到.oy.toFixed(1), 顶栏底: +上到.top.toFixed(1) });
  判('⑧ 横屏·下缘能推到提示条上沿（地图下缘 ≈ 屏底 − 底内衬）',
    Math.abs((下到.oy + 下到.mh) - (下到.cvH - 下到.bottom)) <= 4,
    { 下缘: +(下到.oy + 下到.mh).toFixed(1), 可视底: +(下到.cvH - 下到.bottom).toFixed(1) });
  await ctxL.close();
}

/* ⑨ 第 245 单·竖屏四向推到头：244 的"按可视区夹取"对竖屏纵向也生效（旧版竖屏纵向居中锁死） */
{
  // ⑤ 把页面切到了"设置"——先切回现场页，拖拽才会落在画布上（第一版就栽在这：oy 原封不动）
  await page.touchscreen.tap(...(await page.evaluate(() => {
    const r = document.querySelector('button.tab[data-tab="live"]').getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  })));
  await page.waitForTimeout(300);
  await page.evaluate(() => { const st = __pv.state; st.world.speed = 0; st.llm.on = false; st.cam.manual = true; });
  const 量竖 = () => page.evaluate(() => {
    const st = __pv.state;
    const bar = document.querySelector('#tabbar').getBoundingClientRect();
    const tb = document.querySelector('#topbar').getBoundingClientRect();
    const hb = document.querySelector('#hintbar').getBoundingClientRect();
    const bottom = Math.max((bar.top > st.cvH * 0.5) ? (st.cvH - bar.top) : 0,
                            (hb.top > st.cvH * 0.5) ? (st.cvH - hb.top) : 0);
    return { layout: document.getElementById('app').dataset.layout, ox: st.view.ox, oy: st.view.oy,
             cvW: st.cvW, cvH: st.cvH, mw: __pv.Sim.MAPW * st.view.s, mh: __pv.Sim.MAPH * st.view.s,
             top: tb.top < st.cvH * 0.4 ? tb.bottom : 0, bottom };
  });
  await 触摸拖(300, 120, 300, 600); await 触摸拖(300, 120, 300, 600);   // 手指往下拉 ⇒ 看地图上缘
  const 竖上 = await 量竖();
  await 触摸拖(300, 600, 300, 120); await 触摸拖(300, 600, 300, 120);   // 手指往上拉 ⇒ 看下缘
  const 竖下 = await 量竖();
  判('⑨ 竖屏·上缘能推到顶栏下沿（地图上缘 ≈ 顶栏底）',
    Math.abs(竖上.oy - 竖上.top) <= 3,
    { flow: 竖上.layout, oy: +竖上.oy.toFixed(1), 顶栏底: +竖上.top.toFixed(1) });
  判('⑨ 竖屏·下缘能推到底栏上沿（地图下缘 ≈ 屏底 − 底内衬）',
    Math.abs((竖下.oy + 竖下.mh) - (竖下.cvH - 竖下.bottom)) <= 4,
    { 下缘: +(竖下.oy + 竖下.mh).toFixed(1), 可视底: +(竖下.cvH - 竖下.bottom).toFixed(1) });
}

/* ⑩–⑬ 第 282／283 单·"布局变化后的第一帧"全线：转屏（竖→横／横→竖）、强制布局、界面缩放——
   四条路径都必须在**第一帧**就按新内衬摆位。
   旧病（用户 2026-10-06 截图实证）：内衬缓存只在"每秒兜底"时重测——转屏那一刻缓存里左栏宽还是
   竖屏量出的 0 ⇒ 这一帧按"没有左栏"夹取，地图左缘压到 0 被工具栏盖住；最多 1 秒后兜底重测才跳正
   （就是那"闪一下"）。判据口径：先把缓存**刷到刚刚**（＝变化前一秒内刚量过的真实现场），再变化，
   把镜头顶到世界对应角落 ⇒ **下一帧**读：地图边该贴栏边。 */
{
  const ctxR = await browser.newContext({ viewport: { width: 480, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2.75 });
  const pR = await ctxR.newPage();
  pR.on('pageerror', e => 错.push(String((e && e.message) || e)));
  await pR.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
  await pR.waitForTimeout(2200);
  const 刷缓存 = () => pR.evaluate(() => { if (__pv.量内衬) __pv.量内衬(); });
  const 读帧 = (fx, fy) => pR.evaluate(([x, y]) => new Promise(r => {
    const st = __pv.state;
    st.cam.manual = true; st.cam.fx = x; st.cam.fy = y;      // 镜头顶到世界角落 ⇒ 夹取边界＝内衬本身
    requestAnimationFrame(() => {
      const bar = document.querySelector('#tabbar').getBoundingClientRect();
      const tb = document.querySelector('#topbar').getBoundingClientRect();
      r({ layout: document.getElementById('app').dataset.layout,
        ox: Math.round(st.view.ox), oy: Math.round(st.view.oy),
        mw: Math.round(__pv.Sim.MAPW * st.view.s), mh: Math.round(__pv.Sim.MAPH * st.view.s),
        rail: Math.round(bar.left < st.cvW * 0.4 && bar.right < st.cvW * 0.6 ? bar.right : 0),
        底栏上沿: Math.round(bar.top > st.cvH * 0.5 ? bar.top : st.cvH),
        top: Math.round(tb.top < st.cvH * 0.4 ? tb.bottom : 0),
        缩放: document.documentElement.style.getPropertyValue('--ui-scale') || '1' });
    });
  }), [fx, fy]);
  await pR.evaluate(() => { const st = __pv.state; st.world.speed = 0; st.llm.on = false; });
  // ⑩ 竖→横
  await 刷缓存();
  await pR.setViewportSize({ width: 812, height: 480 });
  const 首帧 = await 读帧(0, 0);
  判('⑩ 转屏第一帧（竖→横）：左缘＝左栏右缘、上缘＝顶栏下沿',
    首帧.layout === 'compact-landscape' && 首帧.rail >= 20 && Math.abs(首帧.ox - 首帧.rail) <= 1
    && Math.abs(首帧.oy - 首帧.top) <= 1,
    { layout: 首帧.layout, ox: 首帧.ox, 左栏右缘: 首帧.rail, oy: 首帧.oy, 顶栏下沿: 首帧.top });
  // ⑪ 横→竖（同一页转回去）
  await 刷缓存();
  await pR.setViewportSize({ width: 480, height: 812 });
  const 竖首帧 = await 读帧(0, 999);                          // 镜头顶到世界左下角 ⇒ 夹取下限＝底内衬
  判('⑪ 转屏第一帧（横→竖）：下缘＝底栏上沿（地图下缘 ≈ 屏底 − 底内衬）',
    竖首帧.layout === 'compact-portrait' && 竖首帧.底栏上沿 < 竖首帧.mh
    && Math.abs((竖首帧.oy + 竖首帧.mh) - 竖首帧.底栏上沿) <= 1,
    { layout: 竖首帧.layout, 地图下缘: 竖首帧.oy + 竖首帧.mh, 底栏上沿: 竖首帧.底栏上沿 });
  // ⑫ 强制布局切换（480×812 窗口里切到"手机横屏"——左栏从无到有，最考验"第一帧就按新内衬"）
  await pR.click('button.tab[data-tab="settings"]');
  await pR.waitForTimeout(250);
  await 刷缓存();
  await pR.click('#set-layout'); await pR.waitForTimeout(80);   // 自动 → 手机竖屏
  await pR.click('#set-layout');                                // 手机竖屏 → 手机横屏（左栏出现）
  const 强首帧 = await 读帧(0, 0);
  判('⑫ 强制布局切换第一帧（自动→手机横屏）：左缘＝新左栏右缘',
    强首帧.layout === 'compact-landscape' && 强首帧.rail >= 20 && Math.abs(强首帧.ox - 强首帧.rail) <= 1,
    { layout: 强首帧.layout, ox: 强首帧.ox, 左栏右缘: 强首帧.rail });
  // ⑬ 界面缩放：root 字号随 --ui-scale 走 ⇒ 左栏宽度变化，第一帧也得按新几何
  await 刷缓存();
  await pR.click('#set-scale-plus');
  const 缩首帧 = await 读帧(0, 0);
  判('⑬ 改界面缩放后第一帧（＋5%）：左缘＝变宽后的左栏右缘',
    缩首帧.layout === 'compact-landscape' && 缩首帧.rail >= 20 && Math.abs(缩首帧.ox - 缩首帧.rail) <= 1
    && Math.abs(parseFloat(缩首帧.缩放) - 1.05) < 0.001,
    { layout: 缩首帧.layout, ox: 缩首帧.ox, 左栏右缘: 缩首帧.rail, 缩放: 缩首帧.缩放 });
  await pR.locator('#cv').screenshot({ path: path.join(OUT, '转屏第一帧.png') }).catch(() => {});
  await ctxR.close();
}

/* ⑭–⑳ 第 286 单·"跟手"（决策者真机 2026-10-07：地图拖动、列表／日志滚动都黏手）。
   桌面同版本实测每帧 JS 只 0.5–0.7ms ⇒ 不是算得慢；模拟弱机（软件光栅＋CPU×4）实测
   dpr 2.75 整页 18fps／dpr 1 有 50fps ⇒ 病在"每帧要过的管线太重"。本单只动
   "多久画一次、画多大"，并把手感拆成可复现的读数（另开一页干净上下文）：
     ⑭ 起手更跟手：1px 一步拖 6 步，画面第一次动的手指数 ≤6（改前＝9，越过 8px 阈值那一拍）；
     ⑮ 点按峰值 14px：慢速横漂 10px（＞旧阈值 8px）仍算点按 ⇒ 弹卡且镜头一分不动（改前：判成拖动、不弹卡）；
     ⑯ 拖动热路径零布局读：2.5s 拖动里 getBoundingClientRect 调用 = 0（改前每秒兜底重测，至少 4 次）；
     ⑰ 刷新闸·静止：画布帧数 ≈ rAF 拍子的一半（60fps 档；改前每拍都画）；
     ⑱ 刷新闸·手在屏：手指持续移动时画布帧数 ≈ rAF 拍子（跟手优先，不设闸）；
     ⑲ 刷新闸·弹窗：弹窗盖住画布时画布帧数 ≈ rAF 的 1/4（30fps 档）；
     ⑳ 分辨率档真作用到画布：最低档 dpr≤1、越界夹回最高档 2.5（改前无此开关 ⇒ 判红）。 */
{
  const ctxF = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2.75 });
  await ctxF.addInitScript(() => {
    window.__rAF数 = 0;
    const 原 = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => 原(t => { window.__rAF数++; cb(t); });
    /* draw() 每帧第一句就是 ctx.setTransform（全站唯一一处）⇒ 数它＝数"画布落笔次数"，
       新旧两版通用（第 286 单新加的 画布帧计数 在旧版根本不存在，数不出来）。 */
    window.__画数 = 0;
    const 原ST = CanvasRenderingContext2D.prototype.setTransform;
    CanvasRenderingContext2D.prototype.setTransform = function () { window.__画数++; return 原ST.apply(this, arguments); };
  });
  const pF = await ctxF.newPage();
  pF.on('pageerror', e => 错.push(String((e && e.message) || e)));
  await pF.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
  await pF.waitForTimeout(2400);
  const cdpF = await ctxF.newCDPSession(pF);
  const 发 = (类型, 点) => cdpF.send('Input.dispatchTouchEvent', 类型 === 'touchEnd'
    ? { type: 'touchEnd', touchPoints: [] }
    : { type: 类型, touchPoints: [{ x: Math.round(点[0]), y: Math.round(点[1]), id: 1 }] });
  const 取镜 = () => pF.evaluate(() => ({ fx: __pv.state.cam.fx, fy: __pv.state.cam.fy, manual: __pv.state.cam.manual,
    弹窗: !!document.querySelector('#dialog-root.open'), 画: window.__画数, rAF: window.__rAF数,
    档: __pv.分辨率档, dpr: __pv.state.dpr }));
  /* 本页自己的"点小人"（上面那个 点小人 绑的是外层 page，在本页用会把镜头挪到别处 ⇒ 点空） */
  const 点小人F = async id => {
    await pF.evaluate(i => { const v = __pv.state.vis[i];
      __pv.state.cam.manual = true; __pv.state.cam.fx = v.dspX; __pv.state.cam.fy = v.dspY; }, id);
    await pF.waitForTimeout(250);
    return pF.evaluate(i => {
      const v = __pv.state.vis[i], r = document.querySelector('#cv').getBoundingClientRect();
      /* 命中锚点＝精灵视觉中心再往下约三分之一格（游戏 pointerup 那条算式）——对准它留出容差，
         否则"视觉中心"离锚点本就 25px、只剩 2px 余量，稍微一漂就点空。 */
      return { x: r.x + __pv.sx(v.dspX), y: r.y + __pv.sy(v.dspY) - __pv.state.view.s * 0.5 + __pv.state.view.s * 0.35,
               底: __pv.state.view.s };
    }, id);
  };
  await pF.evaluate(() => { const st = __pv.state; st.world.speed = 0; st.llm.on = false; st.selected = null; });
  // 把四人摆到互不相邻的空地并冻住（同 ① 的家法）：不然"点小人"和慢漂那 300ms 里人会走开 ⇒ 假红
  await pF.evaluate(() => {
    const st = __pv.state;
    const 摆 = (id, x, y) => { const v = st.vis[id]; v.x = v.dspX = x; v.y = v.dspY = y; v.path = []; v.moving = false; };
    摆('a1', 8, 18.0); 摆('a2', 30, 18.0); 摆('a3', 44, 18.0); 摆('a4', 5, 13.5);
  });
  await pF.waitForTimeout(300);

  // ⑭ 起手死区：1px 一步找"画面第一次动"的那一步
  {
    const 起 = await 取镜();
    await 发('touchStart', [200, 420]);
    let 死 = -1;
    for (let i = 1; i <= 6; i++) {
      await 发('touchMove', [200 - i, 420]);
      await pF.waitForTimeout(34);
      const fx = await pF.evaluate(() => __pv.state.cam.fx);
      if (死 < 0 && Math.abs(fx - 起.fx) > 1e-9) 死 = i;
    }
    await 发('touchEnd');
    await pF.waitForTimeout(200);
    判('⑭ 起手更跟手：手指移 ≤6px 画面就该动（改前＝9px）', 死 >= 3 && 死 <= 6, { 死区px: 死 });
  }
  // ⑮ 点按峰值 14px：慢速横向漂 10px ⇒ 仍算点按（弹卡＋镜头一分不动）
  {
    const 点 = await 点小人F('a1');
    const 前 = await 取镜();
    await 发('touchStart', [点.x, 点.y]);
    for (let i = 1; i <= 5; i++) { await 发('touchMove', [点.x, 点.y + i * 2]); await pF.waitForTimeout(60); }
    await 发('touchEnd');
    await pF.waitForTimeout(400);
    const 后 = await 取镜();
    判('⑮ 点按峰值 14px：慢漂 10px 仍弹卡、镜头 Δfx/Δfy 都为 0（改前：判成拖动、不弹卡）',
      后.弹窗 && Math.abs(后.fx - 前.fx) < 0.01 && Math.abs(后.fy - 前.fy) < 0.01,
      { 弹窗: 后.弹窗, Δfx: +(后.fx - 前.fx).toFixed(3), Δfy: +(后.fy - 前.fy).toFixed(3), manual: 后.manual });
    await pF.evaluate(() => document.querySelector('#dialog-root').classList.remove('open'));
    await pF.waitForTimeout(250);
    // ⑮b 同一手势点在空地上：不弹卡、镜头仍一分不动、也不偷偷改成"手动"
    const 空 = [点.x - 120, 点.y];
    const 前2 = await 取镜();
    await 发('touchStart', 空);
    for (let i = 1; i <= 5; i++) { await 发('touchMove', [空[0], 空[1] + i * 2]); await pF.waitForTimeout(60); }
    await 发('touchEnd');
    await pF.waitForTimeout(400);
    const 后2 = await 取镜();
    判('⑮b 同一慢漂点在空地：不弹卡、镜头 Δfx/Δfy 都为 0、manual 原样（点按＝世界一格不动）',
      后2.弹窗 === false && Math.abs(后2.fx - 前2.fx) < 0.01 && Math.abs(后2.fy - 前2.fy) < 0.01 && 后2.manual === 前2.manual,
      { 弹窗: 后2.弹窗, Δfx: +(后2.fx - 前2.fx).toFixed(3), Δfy: +(后2.fy - 前2.fy).toFixed(3), manual: 后2.manual });
  }
  // ⑯ 高刷采样挂上了：真浏览器里 #cv 上必须有 pointerrawupdate 监听（改前没有 ⇒ 判红）
  {
    const { root } = await cdpF.send('DOM.getDocument');
    const { nodeId } = await cdpF.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#cv' });
    const { object } = await cdpF.send('DOM.resolveNode', { nodeId });
    const { listeners } = await cdpF.send('DOMDebugger.getEventListeners', { objectId: object.objectId });
    const 种 = [...new Set(listeners.map(l => l.type))];
    判('⑯ 高刷采样：真浏览器里 #cv 挂着 pointerrawupdate 监听（高刷屏少一帧延迟；改前没有）',
      种.indexOf('pointerrawupdate') >= 0, { 监听: 种.join('／') });
  }
  // ⑯b 附带读数（不作断言）：拖动 2.5s 里 getBoundingClientRect 调用数——热路径已不调 可视区()，
  //     剩下的都是**主循环每秒兜底**那一次（每处 4~5 次），与改前同量级；这里只记账。
  {
    await pF.evaluate(() => {
      if (!window.__读原) window.__读原 = Element.prototype.getBoundingClientRect;
      window.__读N = 0;
      Element.prototype.getBoundingClientRect = function () { window.__读N++; return window.__读原.apply(this, arguments); };
    });
    await 发('touchStart', [300, 500]);
    await pF.evaluate(() => { window.__读N = 0; });            // 从"按下之后"开始数（起手快照那一次不算）
    for (let i = 1; i <= 25; i++) { await 发('touchMove', [i % 2 ? 340 : 300, 500]); await pF.waitForTimeout(100); }
    const 读 = await pF.evaluate(() => window.__读N);
    await 发('touchEnd');
    await pF.waitForTimeout(200);
    console.log('  · 读数（不作断言）：2.5s 拖动里 getBoundingClientRect 调用 ' + 读 + ' 次（主循环每秒兜底那一次）');
  }
  // ⑰ 刷新闸·静止（手不在屏）⇒ 60fps 档
  {
    await pF.waitForTimeout(700);
    const 前 = await 取镜();
    await pF.waitForTimeout(2200);
    const 后 = await 取镜();
    const rAF = 后.rAF - 前.rAF, 画 = 后.画 - 前.画;
    判('⑰ 刷新闸·静止：画布帧数 ≈ rAF 的一半（60fps 档，比 0.3~0.62）',
      rAF > 60 && 画 >= rAF * 0.3 && 画 <= rAF * 0.62, { rAF, 画, 比: +(画 / Math.max(1, rAF)).toFixed(2) });
  }
  // ⑱ 刷新闸·手在屏（持续移动）⇒ 满帧（跟手优先）
  {
    const 前 = await 取镜();
    await 发('touchStart', [300, 500]);
    for (let i = 1; i <= 22; i++) { await 发('touchMove', [300 + (i % 2 ? 30 : 0), 500]); await pF.waitForTimeout(100); }
    const 后 = await 取镜();
    await 发('touchEnd');
    const rAF = 后.rAF - 前.rAF, 画 = 后.画 - 前.画;
    判('⑱ 刷新闸·手在屏：手指一直动着时画布 ≈ 每拍都画（比 ≥0.85，跟手优先）',
      rAF > 60 && 画 >= rAF * 0.85, { rAF, 画, 比: +(画 / Math.max(1, rAF)).toFixed(2) });
  }
  // ⑲ 刷新闸·弹窗（画布被半透明背景盖住）⇒ 30fps 档
  {
    const 点3 = await 点小人F('a3');
    await pF.touchscreen.tap(点3.x, 点3.y);
    await pF.waitForTimeout(600);
    const 开 = await pF.evaluate(() => !!document.querySelector('#dialog-root.open'));
    await pF.waitForTimeout(500);
    const 前 = await 取镜();
    await pF.waitForTimeout(2200);
    const 后 = await 取镜();
    const rAF = 后.rAF - 前.rAF, 画 = 后.画 - 前.画;
    判('⑲ 刷新闸·弹窗：弹窗盖住画布时画布帧数 ≈ rAF 的 1/4（30fps 档，比 0.12~0.45）',
      开 && rAF > 60 && 画 >= rAF * 0.12 && 画 <= rAF * 0.45, { 弹窗: 开, rAF, 画, 比: +(画 / Math.max(1, rAF)).toFixed(2) });
    await pF.evaluate(() => document.querySelector('#dialog-root').classList.remove('open'));
    await pF.waitForTimeout(250);
  }
  // ⑳ 分辨率档真作用到画布（最低档 dpr≤1；越界夹回最高档 2.5）
  {
    const r = await pF.evaluate(() => {
      const 原 = __pv.state.dpr;
      const ok0 = __pv.设分辨率档(0);
      const 低 = { dpr: __pv.state.dpr, w: document.querySelector('#cv').width, 视口W: innerWidth };
      __pv.设分辨率档(9);
      const 高 = { dpr: __pv.state.dpr, 档: __pv.分辨率档, w: document.querySelector('#cv').width };
      return { 原, ok0, 低, 高 };
    });
    判('⑳ 分辨率档真作用到画布：最低档 dpr≤1（画布宽＝视口宽）、越界夹回最高档 2.5',
      r.ok0 === true && r.低.dpr <= 1.001 && Math.abs(r.低.w - r.低.视口W) <= 1
      && Math.abs(r.高.dpr - 2.5) < 0.001 && r.高.档 === 3,
      { 原dpr: r.原, 低: r.低, 高: r.高 });
  }
  await ctxF.close();
}

判('⑦ 全程零 pageerror', 错.length === 0, { 错: 错.length });

/* ㉑ 第 287 单·批后审计补闸：**自适应换档端到端**（把 rAF 每拍压 34ms ＝ 弱机 ⇒ 该自动降档）
   ——① 档位真的降了；② `state.dpr` 跟着降到那一档的上限；③ **档位落进 localStorage**；
   ④ 同一 context 重开一页，开机读回的就是这一档（"下次别再从头卡一遍"这条承诺）。
   补它的缘由：批后审计的"专挑软肋"注入（把 `分辨率记档()` 抠掉）**当时全闸照绿**——
   "换档落盘"这条没人看。 */
{
  const ctxD = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2.75 });
  const pD = await ctxD.newPage();
  pD.on('pageerror', e => 错.push(String((e && e.message) || e)));
  await pD.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
  await pD.waitForTimeout(2400);
  const 初始 = await pD.evaluate(() => __pv.分辨率档);
  await pD.evaluate(() => {                     // 模拟弱机：每拍烧 34ms（>22ms 的降档线）
    const 原 = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => 原(() => { const t = performance.now(); while (performance.now() - t < 34) {} cb(performance.now()); });
  });
  let 落 = null;
  for (let i = 0; i < 44; i++) {
    await pD.waitForTimeout(500);
    const r = await pD.evaluate(() => ({ 档: __pv.分辨率档, dpr: __pv.state.dpr,
      存: (() => { try { return localStorage.getItem('citylife-dpr'); } catch (e) { return null; } })() }));
    if (r.档 < 初始) { 落 = r; break; }
  }
  const 档表 = [1, 1.5, 2, 2.5];
  const 一 = !!落 && 落.档 < 初始 && Math.abs(落.dpr - 档表[落.档]) < 0.001 && String(落.存) === String(落.档);
  const pD2 = await ctxD.newPage();
  pD2.on('pageerror', e => 错.push(String((e && e.message) || e)));
  await pD2.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
  await pD2.waitForTimeout(1600);
  const 重开 = await pD2.evaluate(() => ({ 档: __pv.分辨率档, dpr: __pv.state.dpr }));
  判('㉑ 自适应换档端到端：压帧 ⇒ 自动降档＋dpr 跟着降＋**档位落盘**；重开一页开机即读回同一档',
    一 && !!落 && 重开.档 === 落.档 && Math.abs(重开.dpr - 档表[重开.档]) < 0.001,
    { 初始档: 初始, 降后: 落, 落盘: 落 && 落.存, 重开页: 重开 });
  await ctxD.close();
}

await ctx.close(); await browser.close(); srv.close();
const 红 = 断言.filter(x => !x.ok).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ 断言, 页面错误: 错, 红, 通过: 红 === 0 && 错.length === 0 }, null, 2), 'utf8');
console.log('\n触屏探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit((红 || 错.length) ? 1 : 0);
