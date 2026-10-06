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
//   F:\临时\2026-10-06\pave270\dump.mjs）：江边 ≥ 100、岸线 ≥ 40；两块盒各重复一次、差值 ≤ 30。
//   --改前=<git-ref>：v203 版广场四块平色、v204 版江边／岸线无纹样 ⇒ 对应条全 0、判红。
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
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
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
判('⑥ 江边步道石纹缝 ≥ 100（(40,49,65)±2，精确一族）', 江甲.江缝 >= 100, { 江缝: 江甲.江缝, box: 江甲.box, s: 江甲.s });
判('⑦ 岸线步道石纹缝 ≥ 40（(68,74,94)±2）', 江甲.岸缝 >= 40, { 岸缝: 江甲.岸缝 });
判('⑧ 江边／岸线重复稳定（各差 ≤ 30）',
   Math.abs(江甲.江缝 - 江乙.江缝) <= 30 && Math.abs(江甲.岸缝 - 江乙.岸缝) <= 30, { 甲: 江甲, 乙: 江乙 });
/* 阈值口径：旧版公园里本就有一族接近 (66,86,64) 的绿（灌木边／树影，实测 810）⇒ 草色判据定 ≥1000
   （新版 1285，薄但稳——两次读数逐字相同）；米色花是**全新**色（旧版 0）⇒ ≥40（新版 66）。 */
判('⑨ 公园草地草簇色 ≥ 1000（(66,86,64)±2；旧版同色族实测 810 ⇒ 阈值取 1000）', 园甲.草色 >= 1000, { 草色: 园甲.草色, box: 园甲.box, s: 园甲.s });
判('⑩ 公园花点色 ≥ 40（(232,224,200)±2，米色花；旧版 0）', 园甲.花色 >= 40, { 花色: 园甲.花色 });
判('⑪ 公园重复稳定（各差 ≤ 30）',
   Math.abs(园甲.草色 - 园乙.草色) <= 30 && Math.abs(园甲.花色 - 园乙.花色) <= 30, { 甲: 园甲, 乙: 园乙 });
const 结论 = { 版本: BEFORE || '（工作区当前版本）', 读数: 甲, 第二次: 乙, 江边: 江甲, 江边第二次: 江乙,
  公园: 园甲, 公园第二次: 园乙,
  断言, 页面错误: 错, 通过: 断言.every(x => x.ok) };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
const 红 = 断言.filter(x => !x.ok).length;
console.log('\n广场铺装探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
