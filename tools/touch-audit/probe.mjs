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
  'window.__pv={get state(){return state},get Sim(){return Sim},get sx(){return sx},get sy(){return sy}};\n})();\n</script>');
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

判('⑦ 全程零 pageerror', 错.length === 0, { 错: 错.length });

await ctx.close(); await browser.close(); srv.close();
const 红 = 断言.filter(x => !x.ok).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ 断言, 页面错误: 错, 红, 通过: 红 === 0 && 错.length === 0 }, null, 2), 'utf8');
console.log('\n触屏探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit((红 || 错.length) ? 1 : 0);
