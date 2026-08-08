// 第 31 单·活动指示器实机取证：在**真浏览器**里跑生产的 `draw()`，把七类活动、四人同锚、
// 手机竖屏、素材未就位兜底路径逐档截下来，呈决策者目验（机器闸管判据，决策者目验管观感）。
//
// 保真度口径（照第 19／20／25／26／30 单几支 shots 的先例，逐条同源）：
//   ① 画的是**生产源码自己的 draw()**，脚本一行渲染代码都没有；HTML 只在末尾追加一句
//      `window.__pv={…}` 把 state/pix 暴露出来（第 11 单 preview_shots.mjs 的原样做法），
//      渲染路径、`chip()`、`actChip()`、金框、素材加载全部逐字未动。
//   ② 「摆姿势」只动**显示态与 activity 两样**：`state.vis[id]` 的位置（照 preview_shots 先例）
//      与 `ag.activity`（本单要展示的正是它，不摆就只能干等 SIM 自己走到那一档）。
//      `w.speed=0` ⇒ `Sim.step` 不跑、`decide()` 不跑、`updateWalkers` 的 budget 恒 0，
//      故摆好之后世界与位置都不会自己动；**落盘的世界、SIM 源码、rng 流一概没碰**。
//   ③ 四人同锚用的是生产的 `STAND_SPOTS` 真站位（锚点显示点＋本表偏移），不是随手摆的坐标，
//      故截到的挤字观感就是四人真的同锚时的观感。
//   ④ 素材未就位那一档靠**真的拦掉 `assets/*.png`** 造（route abort），页面自己走 `pix.failed`
//      那条路退化成色块，不靠改代码、不靠点设置里的开关。
//   ⑤ `--改前` 用 `git show <基线>:city-life-framework.html` 取基线原文同法跑一遍，出改前对照图。
//
// 用法：node tools/act-icon/shots.mjs <输出目录> [--改前=<git-ref>]
//   浏览器用预装 Chromium（CITYLIFE_CHROME 可覆盖）。
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'docs/交付/第31单-图'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const PORT = 18931;
fs.mkdirSync(OUT, { recursive: true });

// 页面原文：改后＝工作区那份；改前＝git 里那份。两边都只在末尾追加同一句 __pv 导出。
const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get pix(){return pix},get Sim(){return Sim},get SPOTS(){return STAND_SPOTS},'
  + 'get ctx(){return ctx},get chip(){return chip},'
  + 'get actChip(){return typeof actChip==="function"?actChip:null}};\n})();\n</script>');
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
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const exe = process.env.CITYLIFE_CHROME || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: exe });
const 读数 = { 改前基线: BEFORE || '（工作区当前版本）', 档: [] };

// 摆姿势：把四人按生产的 STAND_SPOTS 摆到同一个锚上，并逐人指定 activity（type ＋ label 照 SIM 原样）
const pose = (page, anchor, acts) => page.evaluate(([anchor, acts]) => {
  const st = __pv.state, w = st.world, A = __pv.Sim.ANCHORS[anchor], sp = __pv.SPOTS[anchor] || [[0, 0]];
  w.speed = 0;                       // Sim.step 不跑、decide 不跑、updateWalkers budget 恒 0
  st.cam.manual = true;
  st.cam.fx = A.x + 0.5; st.cam.fy = A.y + 0.5;
  w.agents.forEach((ag, i) => {
    const o = sp[i % sp.length], v = st.vis[ag.id];
    v.x = v.dspX = A.x + 0.5 + o[0];
    v.y = v.dspY = A.y + 0.5 + o[1];
    v.path = []; v.moving = false; v.dir = 3;
    if (acts[i]) ag.activity = { type: acts[i][0], label: acts[i][1] };
  });
  return w.agents.map(ag => ({ 人: ag.name, 工种: ag.workKind, 活动: ag.activity.type, label: ag.activity.label }));
}, [anchor, acts]);

const settle = ms => new Promise(r => setTimeout(r, ms));

// 按世界坐标裁一块画布区域出图（照 preview_shots.mjs 的原样）
async function shotRegion(page, name, wx0, wy0, wc, hc, note) {
  const reg = await page.evaluate(([x0, y0, w, h]) => {
    const r = document.querySelector('#cv').getBoundingClientRect(), s = __pv.state.view.s;
    return { x: r.x + __pv.state.view.ox + x0 * s, y: r.y + __pv.state.view.oy + y0 * s, width: w * s, height: h * s };
  }, [wx0, wy0, wc, hc]);
  await page.screenshot({ path: path.join(OUT, name), clip: reg });
  console.log('出图', name, note || '');
}

const pre = BEFORE ? '改前-' : '';
const 记 = (档, 文件, 说明, 摆位) => 读数.档.push({ 档, 文件, 说明, 摆位 });

/* ═══ ① 七类活动各一张 ═══════════════════════════════════════════════════
   同一批人、同一个锚（客厅餐桌 home_table 的四个真站位）、同一块裁剪区，只换 activity.type。
   七张叠着看即「同一幅画面上，活动一变符号就变」。work 那张四人 workKind 互异，
   四个分档符号同时出现在一张图里。 */
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 3 });
  await page.goto(URL_); await settle(2600);
  const LAB = {
    eat: '做饭吃', nap: '小憩', work: '上班', stroll: '散步', idle: '在家待着', sleep: '睡觉', chat: '和谁聊天',
  };
  for (const t of ['eat', 'nap', 'work', 'stroll', 'idle', 'sleep', 'chat']) {
    const 摆位 = await pose(page, 'home_table', [[t, LAB[t]], [t, LAB[t]], [t, LAB[t]], [t, LAB[t]]]);
    await settle(400);
    const f = `${pre}01-活动-${t}.png`;
    await shotRegion(page, f, 0.7, 5.2, 10.6, 7.2, `（四人同摆 ${t}）`);
    记('① 七类活动各一张', f, `四人同处客厅餐桌四个站位，activity.type 一律 ${t}`, 摆位);
  }
  await page.close();
}

/* ═══ ② 四人同锚挤在一起的观感 ══════════════════════════════════════════
   七个多人锚（STAND_SPOTS 登记的全部）各一张，四人活动**互不相同**（最挤的形态：
   四个名牌 ＋ 四个指示器同时在场）。另加一张手机档缩放（s 落到保底值 13）的极限对照。 */
{
  const MIX = [['work', '上班'], ['eat', '做饭吃'], ['chat', '和谁聊天'], ['sleep', '睡觉']];
  // 裁剪框一律把「最靠上那个人的指示器」留在框内：指示器顶 ≈ 脚底 y −1.5 −33/s 格
  const ANCH = {
    home_table: [0.7, 5.2, 10.6, 7.2], home_tv: [0.4, 2.6, 8.4, 6.4], kitchen: [10.4, 5.4, 9.6, 6.6],
    store_counter: [22.6, 1.4, 11.0, 7.2], park_bench: [4.0, 15.6, 10.0, 6.4],
    river_walk: [31.6, 15.6, 10.0, 6.4], market: [17.6, 13.9, 9.6, 9.8],
  };
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 3 });
  await page.goto(URL_); await settle(2600);
  for (const [a, box] of Object.entries(ANCH)) {
    const 摆位 = await pose(page, a, MIX);
    await settle(400);
    const f = `${pre}02-同锚-${a}.png`;
    await shotRegion(page, f, ...box, '（四人同锚 · 活动互不相同）');
    记('② 四人同锚', f, `${a} 四个站位站满，四人活动互不相同`, 摆位);
  }
  await page.close();
  // 极限档：把窗口压到手机那一档的画布尺寸，state.view.s 落到保底值 13（名牌挤字最狠处）
  const small = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 3 });
  await small.goto(URL_); await settle(2600);
  const 摆位 = await pose(small, 'home_table', MIX);
  await settle(400);
  const s = await small.evaluate(() => __pv.state.view.s);
  await shotRegion(small, `${pre}02-同锚-最小缩放.png`, 0.4, 4.9, 11.0, 7.2, `（s=${s}）`);
  记('② 四人同锚', `${pre}02-同锚-最小缩放.png`, `客厅餐桌四人同锚，画布压到 420×760、state.view.s=${s}（保底缩放，名牌挤字最狠处）`, 摆位);
  await small.close();
}

/* ═══ ③ 手机竖屏 390×844 一张（决策者手上就是这个）═══════════════════════ */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.goto(URL_); await settle(2600);
  const 摆位 = await pose(page, 'home_table', [['work', '上班'], ['eat', '做饭吃'], ['chat', '和谁聊天'], ['sleep', '睡觉']]);
  await settle(400);
  const f = `${pre}03-手机竖屏-390x844.png`;
  await page.screenshot({ path: path.join(OUT, f) });        // 整屏，不裁：决策者手上就是这一屏
  console.log('出图', f);
  记('③ 手机竖屏', f, '390×844 整屏（未裁），四人同锚于客厅餐桌、活动互不相同', 摆位);
  await page.close();
}

/* ═══ ④ 素材未就位兜底路径一张 ══════════════════════════════════════════
   真的把 assets/*.png 拦掉：页面自己走 img.onerror ⇒ pix.failed ⇒ pixOn 假 ⇒ 人退化成纯色方块。
   读数里把 设置·素材 那一行的原文一并抄下来当实证（页面自己说「素材未就位」才算数）。 */
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 3 });
  let blocked = 0;
  await ctx.route('**/assets/*.png', route => { blocked++; return route.abort(); });
  const page = await ctx.newPage();
  await page.goto(URL_); await settle(2600);
  const 摆位 = await pose(page, 'home_table', [['work', '上班'], ['eat', '做饭吃'], ['chat', '和谁聊天'], ['sleep', '睡觉']]);
  await settle(400);
  const st = await page.evaluate(() => ({
    ready: __pv.pix.ready, failed: __pv.pix.failed, on: __pv.pix.on,
    行: (document.querySelector('#set-pix-stat') || {}).textContent || '',
  }));
  const f = `${pre}04-素材未就位.png`;
  await shotRegion(page, f, 0.7, 5.2, 10.6, 7.2, `（拦掉 ${blocked} 个素材请求；pix.ready=${st.ready} failed=${st.failed}）`);
  记('④ 素材未就位', f, `assets/*.png 全被拦掉（${blocked} 个请求），页面 设置·素材 行原文「${st.行}」，pix.ready=${st.ready}／failed=${st.failed}；人退化成纯色方块，指示器照出`, 摆位);
  读数.素材未就位 = { 拦掉请求数: blocked, ...st };
  await ctx.close();
}

/* ═══ ⑤ 选中金框不被遮挡（叠放实证）═════════════════════════════════════ */
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 6 });   // 6× 渲染率：2px 金框要看得清
  await page.goto(URL_); await settle(2600);
  const 摆位 = await pose(page, 'home_table', [['work', '上班'], ['eat', '做饭吃'], ['chat', '和谁聊天'], ['sleep', '睡觉']]);
  await page.evaluate(() => { __pv.state.selected = 'a1'; });
  await settle(400);
  // 裁剪框按**生产的精灵几何现算**（脚底 y、帧高比例都从页面里取），不写死格子数：
  // 写死过一次，实测框偏了、金框整条落在框外（第 31 单自己踩的）。
  const clip = await page.evaluate(() => {
    const st = __pv.state, s = st.view.s, v = st.vis.a1;
    const img = __pv.pix.chars, fw = img.width / 24, fh = img.height / 8;
    const dh = (fh / fw) * s, dw = s;
    const px = st.view.ox + v.dspX * s, py = st.view.oy + v.dspY * s;
    const dx0 = px - dw / 2, dy0 = py + s * 0.5 - dh;
    const r = document.querySelector('#cv').getBoundingClientRect();
    // 上边留到指示器之上 8px（指示器盒顶＝dy0−18−17），下边留到金框之下 10px
    return { x: r.x + dx0 - 34, y: r.y + dy0 - 43, width: dw + 68, height: dh + 56 };
  });
  const f = `${pre}05-选中金框.png`;
  await page.screenshot({ path: path.join(OUT, f), clip });
  console.log('出图', f, '（a1 选中，2px 金框在人身四周）');
  记('⑤ 选中金框', f, 'a1 选中：金框在精灵四周，指示器在名牌之上，两者之间隔着整条名牌', 摆位);
  await page.close();
}

/* ═══ ⑥ 对照表一览：十种形态按**生产的 actChip 原样**并排画一遍（呈决策者挑符号用）═════
   画的是页面自己的 `actChip()`（经 __pv 拿到同一个 ctx 与同一张表），不是脚本另写一套。 */
if (!BEFORE) {
  const page = await browser.newPage({ viewport: { width: 780, height: 220 }, deviceScaleFactor: 6 });
  await page.goto(URL_); await settle(2600);
  // 这一张是静态对照表，不是场景图：先把 rAF 停掉（主循环末尾那句 requestAnimationFrame(loop) 拿不到下一帧
  // 即自然停摆），否则下一帧的 draw() 会把这张表整块覆盖掉。draw()／actChip() 本身一个字都没动。
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    for (const id of ['#ov-scene', '#ov-follow', '#ov-log']) {           // 画布上那几块 DOM 浮层会压住表格，本张先藏起来
      const el = document.querySelector(id); if (el) el.style.display = 'none';
    }
  }); await settle(300);
  const box = await page.evaluate(() => {
    const st = __pv.state, ctx = __pv.ctx;
    st.world.speed = 0;
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    ctx.fillStyle = '#10141d'; ctx.fillRect(0, 0, st.cvW, st.cvH);
    const rows = [];
    for (const t of ['eat', 'nap', 'stroll', 'idle', 'sleep', 'chat']) rows.push([t, { activity: { type: t } }]);
    for (const k of ['work', 'clerk', 'trade', 'write']) rows.push(['work·' + k, { activity: { type: 'work' }, workKind: k }]);
    rows.forEach(([名, ag], i) => {
      const x = 38 + i * 70, y = 46;
      __pv.actChip(x, y, ag);                       // ← 生产的 actChip，一行都没另写
      ctx.font = '11px system-ui,sans-serif'; ctx.fillStyle = '#9aa4bb';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(名, x, y + 16);
    });
    const r = document.querySelector('#cv').getBoundingClientRect();
    return { x: r.x, y: r.y, width: Math.min(r.width, 720), height: 70 };
  });
  const f = '06-对照表一览.png';
  await page.screenshot({ path: path.join(OUT, f), clip: box });
  console.log('出图', f);
  记('⑥ 对照表一览', f, '十种形态按生产的 actChip 原样并排（挑符号／调观感用）', null);
  await page.close();
}

fs.writeFileSync(path.join(OUT, `${pre}读数.json`), JSON.stringify(读数, null, 2) + '\n');
await browser.close();
srv.close();
console.log('完成：', OUT);
process.exit(0);
