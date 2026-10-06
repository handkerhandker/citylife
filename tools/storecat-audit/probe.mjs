// 第 260 单·店猫「灰灰」探针（真浏览器像素计数；只读诊断，进冒烟档 2）
//
// 口径：世界时间钉在 D1 正午（天光罩层白天完全不盖，颜色判据干净）、相机对到店猫席，
//   数"灰猫色板"（#8d939e／#5f6874／#c9ccd4）与"窝垫色"（#6f5b41／#9b8258）像素：
//     灰斑 ≥ 40、垫色 ≥ 20、重复一次差 ≤ 2（设备像素；dpr=2、s≈30）。
//   --改前=<git-ref>：旧版没有店猫概念（`店猫席` 读不到）⇒ 两条读数 0、探针判红（判据不是恒绿）。
// 用法：node tools/storecat-audit/probe.mjs [输出目录] [--改前=<git-ref>]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'storecat-audit'));
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},'
  +'get 店猫席(){try{return (typeof 店猫席!==\'undefined\')?店猫席:null}catch(e){return null}}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18979;
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
await page.waitForTimeout(2200);
const 席 = await page.evaluate(() => {
  const st = __pv.state, w = st.world;
  w.speed = 0; w.t = 12 * 60;                                  // D1 正午
  const 真 = __pv.店猫席;
  const s = 真 || { x: 30.45, y: 4.45 };                       // 对照跑也按同一坐标取景（只为量背景贡献）
  st.cam.manual = true; st.cam.fx = s.x; st.cam.fy = s.y;
  return 真 ? { x: s.x, y: s.y } : null;
});
await page.waitForTimeout(500);
const 数 = () => page.evaluate(() => {
  const st = __pv.state;
  /* 对照跑（旧版读不到席）也按**同一坐标**取盒——用来量"背景本身贡献多少"；
     这不是第二处定义：① 会先判席是否存在，旧版这里只作读数。 */
  const s0 = __pv.店猫席 || { x: 30.45, y: 4.45 };
  const s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const cx = st.view.ox + s0.x * s, cy = st.view.oy + s0.y * s;
  const x0 = Math.max(0, Math.round((cx - s * 1.3) * dpr)), y0 = Math.max(0, Math.round((cy - s * 1.4) * dpr));
  const wp = Math.round(s * 2.6 * dpr), hp = Math.round(s * 2.2 * dpr);
  const dd = g.getImageData(x0, y0, wp, hp).data;
  const 灰 = [[141, 147, 158], [95, 104, 116], [201, 204, 212]];
  const 垫 = [[138, 90, 60], [200, 164, 92]];
  let 灰斑 = 0, 垫色 = 0;
  const 近 = (r, gg, b, p) => Math.abs(r - p[0]) <= 12 && Math.abs(gg - p[1]) <= 12 && Math.abs(b - p[2]) <= 12;
  for (let i = 0; i < dd.length; i += 4) {
    const r = dd[i], gg = dd[i + 1], b = dd[i + 2];
    if (灰.some(p => 近(r, gg, b, p))) 灰斑++;
    else if (垫.some(p => 近(r, gg, b, p))) 垫色++;
  }
  return { 灰斑, 垫色, box: [x0, y0, wp, hp], s: +s.toFixed(2) };
});
const 甲 = await 数();
await page.waitForTimeout(400);
const 乙 = await 数();
await page.locator('#cv').screenshot({ path: path.join(OUT, '店猫.png') }).catch(() => {});
await browser.close(); srv.close();

const 断言 = [];
const 判 = (n, ok, 读数_) => { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); };
判('① 店猫席可读（版本里有这颗猫）', !!席, { 席 });
判('② 灰猫色板像素 ≥ 40（设备像素）', 甲.灰斑 >= 40, { 灰斑: 甲.灰斑, 一次: 甲, 二次: 乙 });
判('③ 窝垫色像素 ≥ 20', 甲.垫色 >= 20, { 垫色: 甲.垫色 });
判('④ 重复一次稳定（两次数值差 ≤ 2）', Math.abs(甲.灰斑 - 乙.灰斑) <= 2 && Math.abs(甲.垫色 - 乙.垫色) <= 2,
   { 灰: [甲.灰斑, 乙.灰斑], 垫: [甲.垫色, 乙.垫色] });
判('⑤ 全程零 pageerror', 错.length === 0, { 错: 错.slice(0, 3) });
const 结论 = { 版本: BEFORE || '（工作区当前版本）', 席, 读数: 甲, 第二次: 乙, 断言, 页面错误: 错, 通过: 断言.every(x => x.ok) };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
const 红 = 断言.filter(x => !x.ok).length;
console.log('\n店猫探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
