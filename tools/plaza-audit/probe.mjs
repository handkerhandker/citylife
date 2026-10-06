// 第 268／270 单·室外铺装探针（真浏览器像素计数；只读诊断，进冒烟档 2）
//
// 口径：世界时间钉在 D1 正午（春、无雪、天光罩层不盖）、相机对到广场中心偏东（避开西侧三个摊位），
//   数**纹样三种新色**（面层三色照旧值、亮度不动 ⇒ 只有纹样是新色）：#565c86（缘石）／
//   #5d6489（树池缘石）／净道中线短划（`.18` 白线叠在旧净道色上的**实际混合值**：实测两种，
//   (95,99,139) 与 (90,95,139)——叠在净道色与缝上各一档；取样脚本 F:\临时\2026-10-06\plaza268\dump.mjs）：
//     缘石 ≥ 100、树池 ≥ 100、中线 ≥ 60（设备像素；dpr=2、s≈26.6）；重复一次各差 ≤ 30／30／20
//     （框里有行人过路与春日花瓣 ⇒ 逐帧小数级浮动；真回归动的是成千像素，差一个量级）。
// ② 江边／岸线（第 270 单）：相机对到江边步道，把**江边房＋第 23 行岸线**放进同一盒，数两种石纹缝色
//   （同样只叠纹样、亮度不动）：江边细缝 (40,49,65)±2、岸线细缝 (68,74,94)±2（取样脚本
//   F:\临时\2026-10-06\pave270\dump.mjs）：江边 **≥ 3000**、岸线 ≥ 40；两块盒各重复一次、差值 ≤ 30。
//   ★第 273 单批后审计把江边阈值从 ≥100 抬到 **≥3000**：把"细缝 alpha 归零"注入进去后，⑥ 仍有
//     **321 px** 落进同色窗——逐项排查＝**中线短划的抗锯齿边**（短划也拿掉后归 0；F7／F7b 实测）。
//     三档实测：正常 10182 ／ 只去细缝 321 ／ 细缝＋短划都去 0 ⇒ 阈值取 3000 三档分得开。
//   --改前=<git-ref>：v203 版广场四块平色、v204 版江边／岸线无纹样 ⇒ 对应条全 0、判红。
// ③ 雨天湿地（第 278 单）：雨天把相机依次对到三块（广场／江边／公园路），在**五处水洼各自的盒**里数
//   **涟漪两级色**（`#d7e6f8` 新圈／`#9db4d2` 旧圈——不透明直线 ⇒ ±2 精确匹配）：雨天三块都数得到、
//   重复一次逐数相同（相位只认世界时间、speed=0 即冻结）、**雨停即收** ≤4。
//   `--改前=v208`：旧版没有水洼概念 ⇒ 三条判红（判据不是恒绿）。
// 用法：node tools/plaza-audit/probe.mjs [输出目录] [--改前=<git-ref>]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'plaza-audit'));
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state},get Sim(){return Sim},'
  + 'get 水洼点(){try{return (typeof 水洼点!==\'undefined\')?水洼点:null}catch(e){return null}},'
  /* 第 288 单：蜻蜓的 A/B 桩（关掉它＝数出"蜻蜓自己的像素"，照 cat-identity 家法）＋ 坐标换算 */
  + 'get sx(){return sx},get sy(){return sy},'
  /* 第 289 单：冬季降水的判据桩（桩成恒 false ⇒ 冬季雨天退回"雨"：水洼／蜗牛／雨丝都回来） */
  + 'get 冬降水(){try{return 冬降水}catch(e){return null}},set 冬降水(f){try{冬降水=f}catch(e){}},'
  + 'get 画蜻蜓(){try{return 画蜻蜓}catch(e){return null}},set 画蜻蜓(f){try{画蜻蜓=f}catch(e){}}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18991;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 440, height: 744 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push(String(e && e.message || e)));
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(2300);
await page.evaluate(() => {
  const st = __pv.state;
  st.world.speed = 0; st.world.t = 12 * 60; st.world.weather = { rain: false, until: 0 };
  st.cam.manual = true; st.cam.fx = 22.5; st.cam.fy = 18.5;
});
await page.waitForTimeout(600);
const 数 = () => page.evaluate(() => {
  const st = __pv.state, S = __pv.Sim;
  const s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  // 盒＝广场东半（列 21–27、行 15–23）：净道／夜谈角／树池都在里面，西侧摊位不入框
  const x0 = Math.max(0, Math.round((st.view.ox + 21 * s) * dpr)), y0 = Math.max(0, Math.round((st.view.oy + 15 * s) * dpr));
  const wp = Math.round(6 * s * dpr), hp = Math.round(8 * s * dpr);
  const dd = g.getImageData(x0, y0, wp, hp).data;
  const 线 = [[95, 99, 139], [90, 95, 139]], 缘 = [86, 92, 134], 池 = [93, 100, 137];
  let 中线 = 0, 缘石 = 0, 树池 = 0;
  const 等 = (r, gg, b, p) => r === p[0] && gg === p[1] && b === p[2];       // 精确匹配：新旧四色互不混淆
  for (let i = 0; i < dd.length; i += 4) {
    const r = dd[i], gg = dd[i + 1], b = dd[i + 2];
    if (等(r, gg, b, 缘)) 缘石++; else if (等(r, gg, b, 池)) 树池++;
    else if (线.some(p => 等(r, gg, b, p))) 中线++;      // 精确匹配：带容差时旧版边界色 (91,95,140) 会混进来
  }
  return { 缘石, 树池, 中线, box: [x0, y0, wp, hp], s: +s.toFixed(2) };
});
const 甲 = await 数();
await page.waitForTimeout(400);
const 乙 = await 数();
await page.screenshot({ path: path.join(OUT, BEFORE ? '广场-改前.png' : '广场.png') });
// ── 第 270 单：江边步道＋岸线步道（同一套口径；相机挪到江边）────────────────────────
await page.evaluate(() => { const st = __pv.state; st.cam.manual = true; st.cam.fx = 36; st.cam.fy = 20.5; });
await page.waitForTimeout(600);
const 数江 = () => page.evaluate(() => {
  const st = __pv.state, S = __pv.Sim;
  const s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const 江 = (S.ROOMS || []).find(r => r.id === 'river') || { x: 27, y: 16, w: 19, h: 7 };
  /* 盒＝江边房 ∪ 岸线那一行的**屏幕矩形 ∩ 画布**（房宽 19 格 > 视口时只取看得见的那段） */
  const x0 = Math.max(0, Math.round((st.view.ox + 江.x * s) * dpr));
  const y0 = Math.max(0, Math.round((st.view.oy + 江.y * s) * dpr));
  const x1 = Math.min(cv.width,  Math.round((st.view.ox + (江.x + 江.w) * s) * dpr));
  const y1 = Math.min(cv.height, Math.round((st.view.oy + (江.y + 江.h + 1) * s) * dpr));
  const wp = Math.max(1, x1 - x0), hp = Math.max(1, y1 - y0);
  const dd = g.getImageData(x0, y0, wp, hp).data;
  const 缝江 = [40, 49, 65], 缝岸 = [68, 74, 94];
  const 近 = (r, gg, b, p) => Math.abs(r - p[0]) <= 2 && Math.abs(gg - p[1]) <= 2 && Math.abs(b - p[2]) <= 2;
  let 江缝 = 0, 岸缝 = 0;
  for (let i = 0; i < dd.length; i += 4) {
    const r = dd[i], gg = dd[i + 1], b = dd[i + 2];
    if (近(r, gg, b, 缝江)) 江缝++; else if (近(r, gg, b, 缝岸)) 岸缝++;
  }
  return { 江缝, 岸缝, box: [x0, y0, wp, hp], ox: st.view.ox, oy: st.view.oy, s: +s.toFixed(2) };
});
const 江甲 = await 数江();
await page.waitForTimeout(400);
const 江乙 = await 数江();
await page.screenshot({ path: path.join(OUT, BEFORE ? '江边-改前.png' : '江边.png') });
// ── 第 271 单：滨江公园（草地纹理＋花点；相机挪到公园）──────────────────────────────
await page.evaluate(() => { const st = __pv.state; st.cam.manual = true; st.cam.fx = 9; st.cam.fy = 19.5; });
await page.waitForTimeout(600);
const 数园 = () => page.evaluate(() => {
  const st = __pv.state, S = __pv.Sim;
  const s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const 园 = (S.ROOMS || []).find(r => r.id === 'park') || { x: 1, y: 16, w: 17, h: 7 };
  const x0 = Math.max(0, Math.round((st.view.ox + 园.x * s) * dpr)), y0 = Math.max(0, Math.round((st.view.oy + 园.y * s) * dpr));
  const x1 = Math.min(cv.width, Math.round((st.view.ox + (园.x + 园.w) * s) * dpr));
  const y1 = Math.min(cv.height, Math.round((st.view.oy + (园.y + 园.h) * s) * dpr));
  const wp = Math.max(1, x1 - x0), hp = Math.max(1, y1 - y0);
  const dd = g.getImageData(x0, y0, wp, hp).data;
  const 草 = [66, 86, 64], 花 = [232, 224, 200];
  const 近 = (r, gg, b, p) => Math.abs(r - p[0]) <= 2 && Math.abs(gg - p[1]) <= 2 && Math.abs(b - p[2]) <= 2;
  let 草色 = 0, 花色 = 0;
  for (let i = 0; i < dd.length; i += 4) {
    const r = dd[i], gg = dd[i + 1], b = dd[i + 2];
    if (近(r, gg, b, 草)) 草色++; else if (近(r, gg, b, 花)) 花色++;
  }
  return { 草色, 花色, box: [x0, y0, wp, hp], s: +s.toFixed(2) };
});
const 园甲 = await 数园();
await page.waitForTimeout(400);
const 园乙 = await 数园();
await page.screenshot({ path: path.join(OUT, BEFORE ? '公园-改前.png' : '公园.png') });
// ── 第 272 单：雨天蜗牛（雨天才画；相机对到公园灌木那处）────────────────────────────
const 数蜗 = () => page.evaluate(() => {
  const st = __pv.state;
  const s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const p = { x: 4.6, y: 17.92 };                              // ① 公园西段灌木南沿（与源码蜗牛点①同坐标）
  const cx = st.view.ox + p.x * s, cy = st.view.oy + p.y * s;
  const x0 = Math.max(0, Math.round((cx - s * 0.6) * dpr)), y0 = Math.max(0, Math.round((cy - s * 0.6) * dpr));
  const wp = Math.max(1, Math.min(Math.round(s * 1.2 * dpr), cv.width - x0)), hp = Math.max(1, Math.round(s * 1.2 * dpr));
  const dd = g.getImageData(x0, y0, wp, hp).data;
  const 壳 = [201, 154, 91], 足 = [183, 189, 159];
  const 近 = (r, gg, b, q) => Math.abs(r - q[0]) <= 2 && Math.abs(gg - q[1]) <= 2 && Math.abs(b - q[2]) <= 2;
  let 壳色 = 0, 足色 = 0;
  for (let i = 0; i < dd.length; i += 4) {
    const r = dd[i], gg = dd[i + 1], b = dd[i + 2];
    if (近(r, gg, b, 壳)) 壳色++; else if (近(r, gg, b, 足)) 足色++;
  }
  return { 壳色, 足色, box: [x0, y0, wp, hp] };
});
await page.evaluate(() => { const st = __pv.state;
  st.world.weather = { rain: true, until: st.world.t + 600 }; st.cam.manual = true; st.cam.fx = 4.6; st.cam.fy = 18.6; });
await page.waitForTimeout(600);
const 蜗雨 = await 数蜗();
await page.screenshot({ path: path.join(OUT, BEFORE ? '蜗牛-改前.png' : '蜗牛.png') });
await page.evaluate(() => { const st = __pv.state; st.world.weather = { rain: false, until: 0 }; });
await page.waitForTimeout(400);
const 蜗晴 = await 数蜗();
// ── 第 278 单·雨天湿地：雨天三块各数一次＋重复一次＋雨停对照 ──────────────────────
const 洼表备=[[24.8,18.2],[19.8,21.3],[33.0,17.6],[41.2,22.1],[9.6,18.6]];   // 与源码水洼点同坐标（耦合闸在 harness）
const 数洼 = (fx, fy) => page.evaluate(([x, y]) => {
  const st = __pv.state; st.cam.manual = true; st.cam.fx = x; st.cam.fy = y;
}, [fx, fy]).then(() => page.waitForTimeout(420)).then(() => page.evaluate((备) => {
  const st = __pv.state;
  const 点 = (__pv.水洼点 && __pv.水洼点.length) ? __pv.水洼点 : 备.map(([x, y]) => ({ x, y }));
  const s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const 色 = [[0xd7, 0xe6, 0xf8], [0x9d, 0xb4, 0xd2]];
  const 近 = (r, gg, b, q) => Math.abs(r - q[0]) <= 2 && Math.abs(gg - q[1]) <= 2 && Math.abs(b - q[2]) <= 2;
  let 洼 = 0, 框 = 0;
  for (const p of 点) {
    const cx = st.view.ox + p.x * s, cy = st.view.oy + p.y * s;
    const x0 = Math.round((cx - s * 0.95) * dpr), y0 = Math.round((cy - s * 0.65) * dpr);
    const wp = Math.round(s * 1.9 * dpr), hp = Math.round(s * 1.3 * dpr);
    if (x0 < 0 || y0 < 0 || x0 + wp > cv.width || y0 + hp > cv.height) continue;   // 出屏不计
    框++;
    const dd = g.getImageData(x0, y0, wp, hp).data;
    for (let i = 0; i < dd.length; i += 4) {
      const r = dd[i], gg = dd[i + 1], b = dd[i + 2];
      if (近(r, gg, b, 色[0]) || 近(r, gg, b, 色[1])) 洼++;
    }
  }
  return { 洼, 框, s: +s.toFixed(2) };
}, 洼表备));
await page.evaluate(() => { const st = __pv.state; st.world.weather = { rain: true, until: st.world.t + 600 }; });
const 洼广场 = await 数洼(23.2, 18.6);
const 洼广场2 = await 数洼(23.2, 18.6);          // 重复一次（speed=0 ⇒ 相位冻结，应逐数相同）
const 洼江边 = await 数洼(36.5, 20.2);
const 洼公园 = await 数洼(9.6, 18.8);
await page.screenshot({ path: path.join(OUT, BEFORE ? '雨天湿地-改前.png' : '雨天湿地.png') });
await page.evaluate(() => { const st = __pv.state; st.world.weather = { rain: false, until: 0 }; });
const 洼雨停 = await 数洼(23.2, 18.6);
// ── 第 279 单·雪天·缝里留雪：冬天三块各数一次＋重复一次＋无雪对照 ──────────────────
const 数雪线 = (day, fx, fy, 区) => page.evaluate(([d, x, y]) => {
  const st = __pv.state; st.world.t = (d - 1) * 1440 + 12 * 60;
  st.world.weather = { rain: false, until: 0 };
  st.cam.manual = true; st.cam.fx = x; st.cam.fy = y;
}, [day, fx, fy]).then(() => page.waitForTimeout(450)).then(() => page.evaluate((k) => {
  const st = __pv.state, S = __pv.Sim;
  const s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  let r;
  if (k === '广场') r = { x: 18, y: 15, w: 9, h: 8 };
  else if (k === '江边') r = (S.ROOMS || []).find(z => z.id === 'river') || { x: 27, y: 16, w: 19, h: 7 };
  else r = { x: 7, y: 17, w: 4, h: 3 };                                  // 公园碎石路（与 279 单 source 同矩形）
  const x0 = Math.max(0, Math.round((st.view.ox + r.x * s) * dpr)), y0 = Math.max(0, Math.round((st.view.oy + r.y * s) * dpr));
  const x1 = Math.min(cv.width, Math.round((st.view.ox + (r.x + r.w) * s) * dpr));
  const y1 = Math.min(cv.height, Math.round((st.view.oy + (r.y + r.h) * s) * dpr));
  const wp = Math.max(1, x1 - x0), hp = Math.max(1, y1 - y0);
  const dd = g.getImageData(x0, y0, wp, hp).data;
  /* 雪线实测色（F:\临时\2026-10-06\snowseam279\dump.mjs 取样，D285）：广场/江边落在 (231,234,240) 族；
     公园碎石路底更亮 ⇒ 雪脊落在 (207,214,213) 族——两族各自 ±8。 */
  /* 窗宽 ±4：实测"雪堆"落在 (235,239,248)（与雪线差 (4,5,8)）——±4 恰好把雪堆与告示板白纸挡在外面，
     只认缝里那道雪线（广场 (229,233,242)／江边 (228,232,239)／公园 (207,214,213) 三族）。 */
  const 雪线 = (k === '公园') ? [207, 214, 213] : [231, 234, 240];
  let 线 = 0;
  for (let i = 0; i < dd.length; i += 4)
    if (Math.abs(dd[i] - 雪线[0]) <= 4 && Math.abs(dd[i + 1] - 雪线[1]) <= 4 && Math.abs(dd[i + 2] - 雪线[2]) <= 4) 线++;
  return { 线, box: [x0, y0, wp, hp], s: +s.toFixed(2) };
}, 区));
const 缝冬广 = await 数雪线(285, 23.2, 18.6, '广场');
const 缝冬广2 = await 数雪线(285, 23.2, 18.6, '广场');
const 缝冬江 = await 数雪线(285, 36.5, 20.2, '江边');
const 缝冬园 = await 数雪线(285, 9.6, 18.8, '公园');
const 缝夏广 = await 数雪线(200, 23.2, 18.6, '广场');      // 无雪对照（同一机位、同一颜色窗）
const 缝冬初广 = await 数雪线(275, 23.2, 18.6, '广场');    // 入冬第 5 天：雪在下、**还没落定**（出处那句的边界）
// ── 第 285 单·白天蝴蝶：春正午在／夜·雨·冬都不来／重复稳定 ────────────────────────
const 数蝶 = (day, hh, rain) => page.evaluate(([d, h, r]) => {
  const st = __pv.state, w = st.world;
  w.t = (d - 1) * 1440 + h * 60; w.weather = { rain: !!r, until: r ? w.t + 600 : 0 };
  st.cam.manual = true; st.cam.fx = 9; st.cam.fy = 19.5;
}, [day, hh, rain]).then(() => page.waitForTimeout(450)).then(() => page.evaluate(() => {
  const st = __pv.state, S = __pv.Sim;
  const s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const 园 = (S.ROOMS || []).find(r => r.id === 'park') || { x: 1, y: 16, w: 17, h: 7 };
  const x0 = Math.max(0, Math.round((st.view.ox + 园.x * s) * dpr)), y0 = Math.max(0, Math.round((st.view.oy + 园.y * s) * dpr));
  const x1 = Math.min(cv.width, Math.round((st.view.ox + (园.x + 园.w) * s) * dpr));
  const y1 = Math.min(cv.height, Math.round((st.view.oy + (园.y + 园.h) * s) * dpr));
  const dd = g.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
  const 白蝶 = [246, 248, 251], 黄蝶 = [245, 216, 120];
  const 近 = (r, gg, b, p) => Math.abs(r - p[0]) <= 3 && Math.abs(gg - p[1]) <= 3 && Math.abs(b - p[2]) <= 3;
  let 白斑 = 0, 黄斑 = 0;
  for (let i = 0; i < dd.length; i += 4) {
    const r = dd[i], gg = dd[i + 1], b = dd[i + 2];
    if (近(r, gg, b, 白蝶)) 白斑++; else if (近(r, gg, b, 黄蝶)) 黄斑++;
  }
  return { 白斑, 黄斑, box: [x0, y0, x1 - x0, y1 - y0], s: +s.toFixed(2) };
}));
const 蝶春 = await 数蝶(60, 12, false);
const 蝶春2 = await 数蝶(60, 12, false);
const 蝶夜 = await 数蝶(60, 22, false);
const 蝶雨 = await 数蝶(60, 12, true);
const 蝶冬 = await 数蝶(285, 12, false);
/* ── 第 289 单·冬季的降水按"雪"算：冬季雨天下不积水洼、不出蜗牛；把判据桩成恒 false ⇒ 都回来 ── */
const 设冬雨 = (fx, fy) => page.evaluate(([x, y]) => {
  const st = __pv.state;
  /* ★D275＝入冬第 5 天（雪还没落定，第 168 单口径见第 279 单探针）；**不能用 D300**——
     那时雪已铺满，`snowGround` 会把画在它之前的水洼／蜗牛整个盖掉，两边都是 0 ⇒ 判据变恒绿
     （本单第一版正是如此：㉜㉝ 全绿但把判据桩掉也全绿）。 */
  st.world.t = (275 - 1) * 1440 + 12 * 60;
  st.world.weather = { rain: true, until: st.world.t + 600 };
  st.cam.manual = true; st.cam.fx = x; st.cam.fy = y;
}, [fx, fy]).then(() => page.waitForTimeout(450));
await 设冬雨(4.6, 18.6);
/* 冬季要放宽容差：季节罩（第 112 单）会给所有颜色叠一层 (176,200,224,0.075)——
   壳色 (201,154,91) 叠完约 (199,157,101)，±2 的精确窗抓不到（本单第一版就栽在这）。 */
const 数蜗宽 = () => page.evaluate(() => {
  const st = __pv.state, s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const p = { x: 4.6, y: 17.92 };
  const cx = st.view.ox + p.x * s, cy = st.view.oy + p.y * s;
  const x0 = Math.max(0, Math.round((cx - s * 0.6) * dpr)), y0 = Math.max(0, Math.round((cy - s * 0.6) * dpr));
  const wp = Math.max(1, Math.min(Math.round(s * 1.2 * dpr), cv.width - x0)), hp = Math.max(1, Math.round(s * 1.2 * dpr));
  const dd = g.getImageData(x0, y0, wp, hp).data;
  const 近 = (o, q, t) => Math.abs(o[0] - q[0]) <= t && Math.abs(o[1] - q[1]) <= t && Math.abs(o[2] - q[2]) <= t;
  let 壳 = 0;
  for (let i = 0; i < dd.length; i += 4) if (近([dd[i], dd[i + 1], dd[i + 2]], [199, 157, 101], 8)) 壳++;
  return { 壳色: 壳, box: [x0, y0, wp, hp] };
});
const 冬蜗 = await 数蜗宽();
const 冬洼 = await 数洼(23.2, 18.6);
await page.evaluate(() => { window.__冬原 = __pv.冬降水; __pv.冬降水 = () => false; });
await 设冬雨(4.6, 18.6);
const 冬蜗假 = await 数蜗宽();
const 冬洼假 = await 数洼(23.2, 18.6);
await page.evaluate(() => { __pv.冬降水 = window.__冬原; });

/* 第 288 单·秋天的蜻蜓（水边）：**A/B 差集读数**——同场景"开着蜻蜓"与"关掉蜻蜓
   （`__pv.画蜻蜓=()=>{}`）"各数一次**5 个锚点小盒里的偏红像素**，差值＝蜻蜓自己的像素
   （静态景物、季节罩、雨幕、落花都两次都在 ⇒ 自动抵消；照 cat-identity 的 A−B 家法）。 */
const 数蜓 = () => page.evaluate(() => {
  const cv = document.querySelector('#cv'), st = __pv.state, dpr = cv.width / cv.clientWidth;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (const p of [21.5, 27, 33, 39, 44.5]) {
    const cx = __pv.sx(p) * dpr, cy = __pv.sy(23.2) * dpr;
    const 半 = Math.round(1.5 * st.view.s * dpr), 纵 = Math.round(1.1 * st.view.s * dpr);
    for (let y = Math.max(0, Math.round(cy) - 纵); y < Math.min(cv.height, Math.round(cy) + 纵); y++)
      for (let x = Math.max(0, Math.round(cx) - 半); x < Math.min(cv.width, Math.round(cx) + 半); x++) {
        const i = (y * cv.width + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        if (r > 90 && r > g + 30 && r > b + 30) n++;
      }
  }
  return n;
});
await page.evaluate(() => { window.__蜓原 = __pv.画蜻蜓; });
const 差集 = async (名, 天, 分钟, 有雨) => {
  await page.evaluate(([天, 分, 雨]) => {
    const st = __pv.state;
    st.llm.on = false; st.world.speed = 0; st.world.t = 天 * 1440 + 分;
    st.world.weather = { rain: 雨, until: 雨 ? 1e9 : 0 };
    st.selected = 'a1'; st.cam.manual = true; st.cam.fx = 33; st.cam.fy = 22;
    __pv.画蜻蜓 = window.__蜓原;
  }, [天, 分钟, 有雨]);
  await page.waitForTimeout(420);
  const 开 = await 数蜓();
  await page.evaluate(() => { __pv.画蜻蜓 = () => {}; });
  await page.waitForTimeout(220);
  const 关 = await 数蜓();
  await page.evaluate(() => { __pv.画蜻蜓 = window.__蜓原; });
  return { 名, 开, 关, 差: 开 - 关 };
};
const 蜓秋午 = await 差集('秋·正午', 200, 720, false);
const 蜓秋午2 = await 差集('秋·正午·第二次', 200, 720, false);
const 蜓秋昏 = await 差集('秋·黄昏', 200, 1110, false);
const 蜓秋夜 = await 差集('秋·夜', 200, 60, false);
const 蜓秋雨 = await 差集('秋·雨', 200, 720, true);
const 蜓夏午 = await 差集('夏·正午', 120, 720, false);
const 蜓冬午 = await 差集('冬·正午', 300, 720, false);
await page.screenshot({ path: path.join(OUT, BEFORE ? '雪缝-改前.png' : '雪缝.png') });
await browser.close(); srv.close();

const 断言 = [];
const 判 = (n, ok, 读数_) => { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); };
判('① 缘石像素 ≥ 100（#565c86，精确匹配）', 甲.缘石 >= 100, { 缘石: 甲.缘石, box: 甲.box, s: 甲.s });
判('② 树池缘石像素 ≥ 100（#5d6489）', 甲.树池 >= 100, { 树池: 甲.树池 });
判('③ 净道中线短划像素 ≥ 60（实测混合色 95,99,139／90,95,139，精确匹配）', 甲.中线 >= 60, { 中线: 甲.中线 });
判('④ 重复一次稳定（行人／花瓣过境 ⇒ 各色差 ≤ 30／30／20）',
   Math.abs(甲.缘石 - 乙.缘石) <= 30 && Math.abs(甲.树池 - 乙.树池) <= 30 && Math.abs(甲.中线 - 乙.中线) <= 20,
   { 甲, 乙 });
判('⑤ 全程零 pageerror', 错.length === 0, { 错: 错.slice(0, 3) });
判('⑥ 江边步道石纹缝 ≥ 3000（(40,49,65)±2；三档实测 10182／321／0 ⇒ 阈值 3000）', 江甲.江缝 >= 3000, { 江缝: 江甲.江缝, box: 江甲.box, s: 江甲.s });
判('⑦ 岸线步道石纹缝 ≥ 40（(68,74,94)±2）', 江甲.岸缝 >= 40, { 岸缝: 江甲.岸缝 });
判('⑧ 江边／岸线重复稳定（各差 ≤ 30）',
   Math.abs(江甲.江缝 - 江乙.江缝) <= 30 && Math.abs(江甲.岸缝 - 江乙.岸缝) <= 30, { 甲: 江甲, 乙: 江乙 });
/* 阈值口径：旧版公园里本就有一族接近 (66,86,64) 的绿（灌木边／树影，实测 810）⇒ 草色判据定 ≥1000
   （新版 1285，薄但稳——两次读数逐字相同）；米色花是**全新**色（旧版 0）⇒ ≥40（新版 66）。 */
判('⑨ 公园草地草簇色 ≥ 1000（(66,86,64)±2；旧版同色族实测 810 ⇒ 阈值取 1000）', 园甲.草色 >= 1000, { 草色: 园甲.草色, box: 园甲.box, s: 园甲.s });
判('⑩ 公园花点色 ≥ 40（(232,224,200)±2，米色花；旧版 0）', 园甲.花色 >= 40, { 花色: 园甲.花色 });
判('⑪ 公园重复稳定（各差 ≤ 30）',
   Math.abs(园甲.草色 - 园乙.草色) <= 30 && Math.abs(园甲.花色 - 园乙.花色) <= 30, { 甲: 园甲, 乙: 园乙 });
判('⑫ 雨天蜗牛：下雨时壳色 ≥ 60（(201,154,91)±2）', 蜗雨.壳色 >= 60, { 壳色: 蜗雨.壳色, 足色: 蜗雨.足色, box: 蜗雨.box });
判('⑬ 雨停就收：不下雨时壳色 ≤ 4（出处 Nookipedia·Snail「Rain only」）', 蜗晴.壳色 <= 4, { 壳色: 蜗晴.壳色 });
判('⑭ 雨天湿地：雨天三块都数得到涟漪（广场 ≥60／江边 ≥60／公园 ≥30；两级色 ±2）',
  洼广场.洼 >= 60 && 洼江边.洼 >= 60 && 洼公园.洼 >= 30,
  { 广场: 洼广场, 江边: 洼江边, 公园: 洼公园 });
判('⑮ 雨天湿地·重复稳定（涟漪相位只认世界时间、speed=0 即冻结；雨丝是动画层会扫过水洼盒 ⇒ 差 ≤ 30，照 ④ 先例）',
  Math.abs(洼广场2.洼 - 洼广场.洼) <= 30 && 洼广场2.框 === 洼广场.框, { 一: 洼广场.洼, 二: 洼广场2.洼, 框: 洼广场.框 });
判('⑯ 雨停就收：不下雨时水洼色 ≤ 4（出处 Wikipedia·Puddle「primarily due to precipitation」）',
  洼雨停.洼 <= 4, { 雨停: 洼雨停 });
判('⑰ 雪天缝里留雪：冬天三块都数得到雪线（广场 ≥5000／江边 ≥5000／公园 ≥1800；色窗 广场江边 (231,234,240)／公园 (207,214,213)，各 ±4——±8 会收进雪堆与告示板白纸；公园阈值由 400 抬到 1800：第 280 单 F5 实测"只剩一道雪脊"时 1106 照样放行）',
  缝冬广.线 >= 5000 && 缝冬江.线 >= 5000 && 缝冬园.线 >= 1800,
  { 广场: 缝冬广, 江边: 缝冬江, 公园: 缝冬园 });
判('⑱ 无雪不画：第 200 天（无雪）与**入冬第 5 天**（雪在下、还没落定）同机位都 ≤ 60（出处 Nookipedia·Winter「until the 11th day of the first month of winter」）',
  缝夏广.线 <= 60 && 缝冬初广.线 <= 60, { 无雪_D200: 缝夏广, 入冬第5天_D275: 缝冬初广 });
判('⑲ 雪缝·重复稳定（静态景物、speed=0 ⇒ 两次差 ≤ 30）',
  Math.abs(缝冬广2.线 - 缝冬广.线) <= 30, { 一: 缝冬广.线, 二: 缝冬广2.线 });
判('⑳ 白天蝴蝶：春·正午在（白／黄两色各 ≥30；出处 Nookipedia·Common butterfly「Flying near flowers」）',
  蝶春.白斑 >= 30 && 蝶春.黄斑 >= 30, { 白: 蝶春.白斑, 黄: 蝶春.黄斑, box: 蝶春.box });
判('㉑ 夜里不来：同机位 22:00 两色 ≤ 4（照「Time of day … 8 AM – 5 PM」）',
  蝶夜.白斑 <= 4 && 蝶夜.黄斑 <= 4, 蝶夜);
判('㉒ 雨天不来：两色 ≤ 4（出处「Weather: Any except rain」）',
  蝶雨.白斑 <= 4 && 蝶雨.黄斑 <= 4, 蝶雨);
判('㉓ 冬天不来：D285 正午两色 ≤ 4（照「Time of year Mar – Oct」）',
  蝶冬.白斑 <= 4 && 蝶冬.黄斑 <= 4, 蝶冬);
判('㉔ 蝴蝶重复稳定（游移相位只认世界时间、speed=0 冻结 ⇒ 差 ≤ 20）',
  Math.abs(蝶春2.白斑 - 蝶春.白斑) <= 20 && Math.abs(蝶春2.黄斑 - 蝶春.黄斑) <= 20,
  { 一: [蝶春.白斑, 蝶春.黄斑], 二: [蝶春2.白斑, 蝶春2.黄斑] });
/* ㉕–㉛ 第 288 单·秋天的蜻蜓（水边）：**A/B 差集法**——同场景"开着蜻蜓"与"关掉蜻蜓
   （`__pv.画蜻蜓=()=>{}`）"各数一次**5 个锚点小盒里的偏红像素**，差值＝蜻蜓自己的像素
   （静态景物、季节罩、雨幕、落花都会两次都在 ⇒ 自动抵消；照 cat-identity 的 A−B 家法）。
   出处（2026-10-07 实取 HTTP 200）：Nookipedia·Red dragonfly「Time of year North: **Sep – Oct**」
   「Time of day **8 AM – 7 PM**」「Location **Flying near water**」「Weather **Any except rain**」。
   阈值按 F:\临时\2026-10-08\dragonfly288\ab.mjs 实测定：秋正午 63／58、秋黄昏 92、夜 0／雨 0／夏 0／冬 0
   ⇒ 有蜓 ≥35、无蜓 ≤8、重复差 ≤12（三档分得开）。 */
{
  判('㉕ 秋天水边蜻蜓：秋·正午 A−B 差集 ≥ 35（探针实测 89，标定脚本实测 63；出处「Flying near water」）', 蜓秋午.差 >= 35, 蜓秋午);
  判('㉖ 秋·黄昏照旧在（出处「Time of day 8 AM – 7 PM」：17:00 之后仍飞；实测 113）', 蜓秋昏.差 >= 35, 蜓秋昏);
  判('㉗ 夜里不来：22:00 差集 ≤ 8（实测 0）', 蜓秋夜.差 <= 8, 蜓秋夜);
  判('㉘ 雨天不来：差集 ≤ 8（出处「Weather: Any except rain」；实测 0）', 蜓秋雨.差 <= 8, 蜓秋雨);
  判('㉙ 夏天不来：差集 ≤ 8（出处「Time of year Sep – Oct」；实测 0）', 蜓夏午.差 <= 8, 蜓夏午);
  判('㉚ 冬天不来：差集 ≤ 8（实测 0）', 蜓冬午.差 <= 8, 蜓冬午);
  判('㉛ 蜻蜓重复稳定（游移只认世界时间、speed=0 冻结；两次差集差 ≤ 12，标定脚本实测 63／58）',
    Math.abs(蜓秋午2.差 - 蜓秋午.差) <= 12, { 一: 蜓秋午.差, 二: 蜓秋午2.差 });
  判('㉜ 冬季雨天·不积水洼：入冬第 5 天（D275，雪未落定）雨天同机位水洼色 ≤ 4（对照：春季雨天 ⑭ 广场 ≥60）',
    冬洼.洼 <= 4, 冬洼);
  判('㉝ 冬季雨天·不出蜗牛：壳色 ≤ 4（对照：⑫ 春季雨天 ≥60；出处 Nookipedia·Winter「Snow will fall…」——冬降的是雪）',
    冬蜗.壳色 <= 4, { 壳色: 冬蜗.壳色, box: 冬蜗.box });
  判('㉞ 归并判据真在管事（A/B）：把 `冬降水` 桩成恒 false ⇒ 冬季雨天退回"雨"——水洼 ≥60、蜗牛 ≥60',
    冬洼假.洼 >= 60 && 冬蜗假.壳色 >= 60, { 水洼: [冬洼.洼, 冬洼假.洼], 蜗牛: [冬蜗.壳色, 冬蜗假.壳色] });
  /* ★为什么雪花那一条**不设像素判据**（照实登记）：本单试过"数亮像素"，但**斜雨丝也是亮像素**
     （26 条长线 ≫ 34 个点，方向还反了：真 27330 vs 假 28193）；试过"连通块形状"，静态亮块
     两边都在、数不出干净差值。⇒ 落雪那一条由 **harness 闸三（源码侧：这一支画的是 `arc` 圆点、
     `moveTo` 雨丝被挪进 else）＋ 目验图**背书，像素级判据只落在能精确计数的水洼／蜗牛上。 */
}

const 结论 = { 版本: BEFORE || '（工作区当前版本）', 读数: 甲, 第二次: 乙, 江边: 江甲, 江边第二次: 江乙,
  公园: 园甲, 公园第二次: 园乙, 蜗牛: 蜗雨, 蜗牛雨停: 蜗晴,
  断言, 页面错误: 错, 通过: 断言.every(x => x.ok) };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
const 红 = 断言.filter(x => !x.ok).length;
console.log('\n广场铺装探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
