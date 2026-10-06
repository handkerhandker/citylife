// 第 266 单·江边漂流瓶探针（真浏览器像素计数＋真点击；只读诊断，进冒烟档 2）
//
// 口径：世界时间钉在 D4 正午（瓶日＝日号 %3===1，且白天没有天光罩层、颜色判据干净）、相机对到瓶席，
//   数"瓶色板"（玻璃 #5f8e77／高光 #79ab90／纸卷 #e8e0c8／木塞 #b08a5a）像素：
//     瓶日 ≥ 40、非瓶日 ≤ 4、重复一次差 ≤ 2（设备像素；dpr=2、s≈26.6）。
//   再真点一下瓶身：纸条面板要开，且文字＝当天那句＋落款（与 `瓶纸` 现算逐字一致）；点三格外不许弹。
//   --改前=<git-ref>：旧版没有漂流瓶概念（`瓶席` 读不到）⇒ 探针判红（判据不是恒绿）。
// 用法：node tools/bottle-audit/probe.mjs [输出目录] [--改前=<git-ref>]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'bottle-audit'));
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  "window.__pv={get state(){return state},get Sim(){return Sim},"
  + "get 瓶席(){try{return (typeof 瓶席!=='undefined')?瓶席:null}catch(e){return null}},"
  + "get 瓶日(){try{return (typeof 瓶日==='function')?瓶日:null}catch(e){return null}},"
  + "get 瓶纸(){try{return (typeof 瓶纸==='function')?瓶纸:null}catch(e){return null}},"
  + "get 瓶当前盒(){try{return (typeof 瓶当前盒!=='undefined')?瓶当前盒:null}catch(e){return null}}};\n})();\n</script>");
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18987;
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
const 席 = await page.evaluate(() => {
  const st = __pv.state;
  const 真 = __pv.瓶席;
  const s = 真 || { x: 42.5, y: 22.55 };                 // 对照跑也按同一坐标取景（只为量背景贡献）
  st.world.speed = 0; st.world.t = (4 - 1) * 1440 + 12 * 60;   // D4 正午（瓶日）
  st.cam.manual = true; st.cam.fx = s.x - 1.2; st.cam.fy = s.y - 0.8;
  return 真 ? { x: s.x, y: s.y } : null;
});
await page.waitForTimeout(600);
const 数 = () => page.evaluate(() => {
  const st = __pv.state;
  const s0 = __pv.瓶席 || { x: 42.5, y: 22.55 };
  const s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const cx = st.view.ox + s0.x * s, cy = st.view.oy + s0.y * s;
  const x0 = Math.max(0, Math.round((cx - s * 1.2) * dpr)), y0 = Math.max(0, Math.round((cy - s * 0.6) * dpr));
  const wp = Math.round(s * 2.4 * dpr), hp = Math.round(s * 1.2 * dpr);
  const dd = g.getImageData(x0, y0, wp, hp).data;
  const 瓶色 = [[95, 142, 119], [121, 171, 144], [232, 224, 200], [176, 138, 90]];
  let 瓶斑 = 0;
  const 近 = (r, gg, b, p) => Math.abs(r - p[0]) <= 12 && Math.abs(gg - p[1]) <= 12 && Math.abs(b - p[2]) <= 12;
  for (let i = 0; i < dd.length; i += 4) if (瓶色.some(p => 近(dd[i], dd[i + 1], dd[i + 2], p))) 瓶斑++;
  return { 瓶斑, box: [x0, y0, wp, hp], s: +s.toFixed(2) };
});
const 甲 = await 数();
await page.waitForTimeout(400);
const 乙 = await 数();
await page.locator('#cv').screenshot({ path: path.join(OUT, '瓶日.png') }).catch(() => {});
/* 第 274 单·手账四期：点开漂流瓶**之前**那一条该是 0/1（读手账卡真 DOM） */
const 读手账 = () => page.evaluate(() => {
  const lis = [...document.querySelectorAll('#mile-list li')];
  const li = lis.find(x => x.textContent.indexOf('漂流瓶') >= 0);
  return { 条数: lis.length, 条: li ? li.textContent.trim().replace(/\s+/g, ' ') : null };
});
await page.click('button.tab[data-tab="roles"]');
await page.waitForTimeout(400);
const 账前 = await 读手账();
await page.click('button.tab[data-tab="live"]');
await page.waitForTimeout(300);
// 非瓶日（D5）
await page.evaluate(() => { const st = __pv.state; st.world.t = (5 - 1) * 1440 + 12 * 60; });
await page.waitForTimeout(500);
const 非 = await 数();
await page.locator('#cv').screenshot({ path: path.join(OUT, '非瓶日.png') }).catch(() => {});
// 点它一下（回到 D4）
let 点 = { 开了: false, 文: '', 盒: null, 对: false, 空地弹: null };
if (席) {
  await page.evaluate(() => { const st = __pv.state; st.world.t = (4 - 1) * 1440 + 12 * 60; });
  await page.waitForTimeout(500);
  const 盒 = await page.evaluate(() => __pv.瓶当前盒);
  if (盒) {
    const dpr = 2;
    const cx = (盒.l + 盒.r) / 2, cy = (盒.t + 盒.b) / 2;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(450);
    const 开 = await page.evaluate(() => ({ open: !!document.querySelector('#dialog-root.open'),
      文: (document.querySelector('#dialog-root') || {}).innerText || '' }));
    const 应 = await page.evaluate(() => __pv.瓶纸(__pv.state.world));
    点 = { 开了: 开.open, 文: 开.文.replace(/\s+/g, ' ').trim().slice(0, 140), 盒,
      对: 开.open && 开.文.includes(应.词) && 开.文.includes('「' + 应.姓 + '」') };
    await page.locator('#cv').screenshot({ path: path.join(OUT, '瓶日-点开.png') }).catch(() => {});
    await page.screenshot({ path: path.join(OUT, '纸条面板.png') }).catch(() => {});
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // 点三格外的空地：不许弹
    const 步 = (盒.r - 盒.l) / 0.92;                       // 一格≈多少 CSS 像素（盒宽 0.92 格）
    await page.mouse.click(cx + 3 * 步, cy - 2 * 步);
    await page.waitForTimeout(400);
    点.空地弹 = await page.evaluate(() => !!document.querySelector('#dialog-root.open'));
  }
}
/* 第 274 单：点开之后 ⇒ 手账那一条打勾；**刷新后仍在**（小账随存档信封走，不靠内存） */
await page.click('button.tab[data-tab="roles"]');
await page.waitForTimeout(400);
const 账后 = await 读手账();
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2400);
await page.click('button.tab[data-tab="roles"]');
await page.waitForTimeout(400);
const 账刷后 = await 读手账();
await browser.close(); srv.close();

const 断言 = [];
const 判 = (n, ok, 读数_) => { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); };
判('① 瓶席可读（版本里有这颗瓶子）', !!席, { 席 });
判('② 瓶日画上有瓶子（瓶色板像素 ≥ 40）', 甲.瓶斑 >= 40, { 瓶斑: 甲.瓶斑, box: 甲.box, s: 甲.s });
判('③ 非瓶日画上没有（≤ 4 且 瓶日−非瓶日 ≥ 40）', 非.瓶斑 <= 4 && (甲.瓶斑 - 非.瓶斑) >= 40, { 瓶日: 甲.瓶斑, 非瓶日: 非.瓶斑 });
判('④ 重复一次稳定（两次数值差 ≤ 2）', Math.abs(甲.瓶斑 - 乙.瓶斑) <= 2, { 一: 甲.瓶斑, 二: 乙.瓶斑 });
判('⑤ 点它开纸条面板：文字＝当天那句＋落款（逐字对）', !!点.对, 点);
判('⑥ 点三格外的空地不弹面板', 点.空地弹 === false, { 空地弹: 点.空地弹 });
判('⑦ 全程零 pageerror', 错.length === 0, { 错: 错.slice(0, 3) });
判('⑧ 手账四期（274）：点开前 0/1、点开后打勾（条数 21）',
   String(账前.条 || '').includes('0/1') && String(账后.条 || '').startsWith('✓') && 账后.条数 === 21,
   { 前: 账前, 后: 账后 });
判('⑨ 手账四期（274）：**刷新后仍在**（小账走存档信封，不靠内存）',
   String(账刷后.条 || '').startsWith('✓'), { 刷新后: 账刷后 });
const 结论 = { 版本: BEFORE || '（工作区当前版本）', 席, 读数: 甲, 第二次: 乙, 非瓶日: 非, 点,
  手账: { 前: 账前, 后: 账后, 刷新后: 账刷后 }, 断言, 页面错误: 错,
  通过: 断言.every(x => x.ok) };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
const 红 = 断言.filter(x => !x.ok).length;
console.log('\n漂流瓶探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
