// 第 213 单·"猫看得见"探针（真浏览器像素计数；只读诊断，进冒烟档 2）
//
// 口径：**同一个点位、同一段时间**——猫日与非猫日各截一块（以锚点为中心 2.6s×2.2s），
// 数"猫色板"像素（三档花色的底/深/斑/黄眼 + 影子附近的深色）。背景两边相同，
// 故判据取**差值**：猫日 − 非猫日 ≥ 80（设备像素；dpr=2、s≈30 时猫身约 60×50 设备像素）。
// --改前=<git-ref>：对旧版跑同一套（第 213 单之前的版本没有这段绘制 ⇒ 差值≈0、探针判红——
// 这就是"判据不是恒绿"的反例。
// 用法：node tools/cat-audit/probe.mjs [输出目录] [--改前=<git-ref>]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'cat-audit'));
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18967;
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

// 找一天（有猫/无猫）＋把相机对到目标点；返回 {day, cat, spot}
const 布置 = (要猫, 固定点) => page.evaluate(([要猫, 固定点]) => {
  const st = __pv.state, w = st.world, S = __pv.Sim;
  w.speed = 0;
  let day = 0, cat = null;
  for (let D = 1; D <= 40; D++) {
    w.t = (D - 1) * 1440 + 15 * 60 + 40; w.weather = { rain: false, until: 0 };
    const c = S.catOfDay(w);
    if (要猫 ? !!c : !c) { day = D; cat = c; break; }
  }
  w.t = (day - 1) * 1440 + 15 * 60 + 40; w.weather = { rain: false, until: 0 };
  const 点 = 固定点 ? S.ANCHORS[固定点] : (cat ? S.ANCHORS[cat.spot] : S.ANCHORS.river_walk);
  st.cam.manual = true; st.cam.fx = 点.x; st.cam.fy = 点.y;
  return { day, cat: cat ? { 名: cat.名, 花色: cat.花色, spot: cat.spot } : null, spot: 固定点 || (cat ? cat.spot : 'river_walk') };
}, [要猫, 固定点]);
const 数色板 = () => page.evaluate(() => {
  const st = __pv.state, S = __pv.Sim;
  const spot = window.__catSpot; const A = S.ANCHORS[spot];
  const s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const cx = st.view.ox + A.x * s, cy = st.view.oy + A.y * s;
  const x0 = Math.max(0, Math.round((cx - s * 1.3) * dpr)), y0 = Math.max(0, Math.round((cy - s * 1.4) * dpr));
  const wp = Math.round(s * 2.6 * dpr), hp = Math.round(s * 2.2 * dpr);
  const dd = g.getImageData(x0, y0, wp, hp).data;
  const pal = [[236,229,216],[59,59,64],[217,143,90],[44,44,51],[20,20,24],[201,162,74],[224,146,63],[168,99,31],[243,201,143],[42,42,46]];
  let n = 0;
  for (let i = 0; i < dd.length; i += 4) {
    for (const p of pal) { if (Math.abs(dd[i]-p[0])<=12 && Math.abs(dd[i+1]-p[1])<=12 && Math.abs(dd[i+2]-p[2])<=12) { n++; break; } }
  }
  return { n, box: [x0, y0, wp, hp], s: +s.toFixed(2) };
});

const 猫日 = await 布置(true, null);
await page.evaluate(sp => { window.__catSpot = sp; }, 猫日.spot);
await page.waitForTimeout(500);
const 甲 = await 数色板();
await page.screenshot({ path: path.join(OUT, '猫日.png') });

const 非猫日 = await 布置(false, 猫日.spot);        // 同一点位、同一时刻，换一个没有猫的日子
await page.evaluate(sp => { window.__catSpot = sp; }, 非猫日.spot);
await page.waitForTimeout(500);
const 乙 = await 数色板();
await page.screenshot({ path: path.join(OUT, '非猫日.png') });

const 差 = 甲.n - 乙.n;
const 过 = 差 >= 80 && 错.length === 0;
console.log((过 ? ' ok ' : ' FAIL') + ' 猫日色板像素 ' + 甲.n + ' · 非猫日 ' + 乙.n + ' · 差 ' + 差 + '（判据 ≥80）'
  + ' · s=' + 甲.s + ' · 猫=' + JSON.stringify(猫日.cat) + ' · 页错 ' + 错.length);
console.log('报表与截图：' + OUT);
await browser.close(); srv.close();
process.exit(过 ? 0 : 1);
