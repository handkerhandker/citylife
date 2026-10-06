// 第 275 单·猫的"缺省路径"像素冻结闸（263／267 残留登记收口：一次性对拍 → 常驻机器闸）
//
// 欠账是什么：263（店猫活态）与 267（访客猫也点得动）都声称"缺省路径与旧版逐像素相同"，
//   但那条只有**一次性脚本**（`F:\临时\2026-10-06\cat263\identity.mjs`、`cat267\identity-visitor.mjs`）——
//   脚本不入仓、不进冒烟 ⇒ 之后谁动了猫的绘制也没人拦。本工具把它变成常驻闸。
//
// 判法（footprint 差集——**抗后期美术改动**，这是 263／267 那两次"对拍"做不到常驻的原因）：
//   ① 同一版本内跑两次：A＝正常画；B＝把 `画猫` 摘掉（`__pv.画猫=()=>{}`；窝垫/让位账等一律不动）。
//      A−B 的差集＝"猫自己的像素"——地面纹理变了，两边同时变、当场抵消。
//   ② 跨版本比这两张差集：
//        · 轮廓一致：只多 ≤2 且 只少 ≤2 像素；
//        · 颜色一致：交集内逐通道色差 >24 的像素必须 **0**；>6 的 ≤30（抗锯齿边缘＋"猫身下的地面变了"的宽容）。
//   ③ 基准钉死在 git：访客猫＝**v202**（`7b81a09`，267 对照的就是它）、店猫＝**v199**（`dc64a0d`，263 对照的就是它）。
//      访客猫三点位各一景（market／park_bench／river_walk）；店猫先把它钉成"端坐＋不转头"再取景。
//
// 反向自查（判据不是恒绿）：`--自测注入=位移|变色` 把当前版故意改坏（挪猫基线 / 换橘猫底色），
//   对应场景必须判红。
//
// 用法：node tools/cat-identity/probe.mjs [输出目录] [--旧访=<ref>] [--旧店=<ref>] [--自测注入=位移|变色]
//   （要 CITYLIFE_CHROME；进冒烟档 2）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'cat-identity'));
fs.mkdirSync(OUT, { recursive: true });
const 旧访 = (process.argv.find(a => a.startsWith('--旧访=')) || '').split('=')[1] || '7b81a09';   // v202
const 旧店 = (process.argv.find(a => a.startsWith('--旧店=')) || '').split('=')[1] || 'dc64a0d';   // v199
const 自测注入 = (process.argv.find(a => a.startsWith('--自测注入=')) || '').split('=')[1] || '';

const 取 = ref => execFileSync('git', ['show', `${ref}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' });
const 注入 = raw => raw.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},'
  + 'get 画猫(){return 画猫},set 画猫(f){画猫=f},'
  + 'get 店猫席(){try{return (typeof 店猫席!==\'undefined\')?店猫席:null}catch(e){return null}},'
  + 'get 猫活态(){try{return (typeof 猫活态===\'function\')?猫活态:null}catch(e){return null}},'
  + 'set 猫活态(f){try{猫活态=f}catch(e){}}'
  + '};\n})();\n</script>');
let 现raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const 注入表 = {
  位移: ['const u=s/2, bx=sx(X), by=sy(Y)+s*0.16;', 'const u=s/2, bx=sx(X), by=sy(Y)+s*0.24;'],
  变色: ["橘:  {底:'#e0923f'", "橘:  {底:'#c07020'"],
};
if (自测注入) {
  const [找, 换] = 注入表[自测注入] || [];
  if (!找 || 现raw.indexOf(找) < 0) { console.error('自测注入的注入点没找到：' + 自测注入); process.exit(2); }
  现raw = 现raw.replace(找, 换);
}
const 现html = 注入(现raw);
const 访html = 注入(取(旧访));
const 店html = 注入(取(旧店));
if (现html === 现raw || 访html === 取(旧访)) { console.error('注入点没找到'); process.exit(2); }
const 现版本号 = (现raw.match(/id="set-build">([^<]*)</) || [])[1] || '?';

const PORT = 18996;   // 第 275 单：全仓 `const PORT` 唯一（闸十三；18996 此前无人占）
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/cur') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(现html); return; }
  if (u === '/f_v202') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(访html); return; }
  if (u === '/f_v199') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(店html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

/* 判据常数（缘由写在文件头） */
const 轮廓宽容 = 2, 大色差线 = 24, 小色差数上限 = 30;
const 读数 = [];
const 判 = (名, 好, 读数_) => { 读数.push({ 场景: 名, 好, 读数_ }); console.log((好 ? ' ok  ' : ' FAIL ') + 名 + '  ' + JSON.stringify(读数_)); };

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });

async function 跑一版(路由, 场景, 标注) {
  const ctx = await browser.newContext({ viewport: { width: 440, height: 744 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const 错 = [];
  page.on('pageerror', e => 错.push(String(e && e.message || e)));
  await page.goto(`http://127.0.0.1:${PORT}/${路由}`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  const 布置 = await page.evaluate((o) => {
    const st = __pv.state, w = st.world, S = __pv.Sim;
    w.speed = 0;
    let 中心;
    if (o.点) {                                   // 访客猫：找该点位的第一只猫日
      let day = 0, cat = null;
      for (let D = 1; D <= 60; D++) {
        w.t = (D - 1) * 1440 + 15 * 60 + 40; w.weather = { rain: false, until: 0 };
        const c = S.catOfDay(w);
        if (c && c.spot === o.点) { day = D; cat = c; break; }
      }
      if (!day) return { 没找到: true };
      w.t = (day - 1) * 1440 + 15 * 60 + 40; w.weather = { rain: false, until: 0 };
      中心 = { x: S.ANCHORS[o.点].x, y: S.ANCHORS[o.点].y };
      st.cam.manual = true; st.cam.fx = 中心.x; st.cam.fy = 中心.y;
      return { day, 花色: cat.花色, spot: cat.spot, 中心 };
    }
    w.t = 12 * 60; w.weather = { rain: false, until: 0 };     // 店猫：D1 正午
    const 席 = __pv.店猫席;
    if (!席) return { 没找到: true };
    中心 = { x: 席.x, y: 席.y };
    st.cam.manual = true; st.cam.fx = 中心.x; st.cam.fy = 中心.y;
    return { day: 1, 中心 };
  }, 场景);
  if (布置.没找到) { await ctx.close(); return { 没找到: true, 错 }; }
  if (场景.钉端坐) await page.evaluate(() => { if (__pv.猫活态) __pv.猫活态 = (谁) => (谁 === '店' ? { 势: '端坐', 看: 0 } : null); });
  await page.waitForTimeout(3000);                            // 显示位收敛（speed=0）
  const 取盒 = () => page.evaluate((o) => {
    const st = __pv.state, S = __pv.Sim;
    const 中心 = o.席 ? __pv.店猫席 : S.ANCHORS[o.点];
    const s = st.view.s, cv = document.querySelector('#cv'), g = cv.getContext('2d');
    const dpr = cv.width / cv.clientWidth;
    const cx = st.view.ox + 中心.x * s, cy = st.view.oy + 中心.y * s;
    const x0 = Math.max(0, Math.round((cx - s * 1.3) * dpr)), y0 = Math.max(0, Math.round((cy - s * 1.4) * dpr));
    const wp = Math.round(s * 2.6 * dpr), hp = Math.round(s * 2.2 * dpr);
    return { box: [x0, y0, wp, hp], px: Array.from(g.getImageData(x0, y0, wp, hp).data) };
  }, 场景);
  const A = await 取盒();
  await page.screenshot({ path: path.join(OUT, `${场景.名}-有猫-${标注}.png`) });
  await page.evaluate(() => { __pv.画猫 = () => {}; });         // 把猫摘掉（其余一切不动）
  await page.waitForTimeout(900);
  const B = await 取盒();
  await ctx.close();
  return { A, B, 布置, 错 };
}

function 差集(P, Q) {
  const set = new Set(), 位 = P.length / 4;
  for (let i = 0; i < 位; i++) {
    const j = i * 4;
    if (Math.abs(P[j] - Q[j]) > 6 || Math.abs(P[j + 1] - Q[j + 1]) > 6 || Math.abs(P[j + 2] - Q[j + 2]) > 6) set.add(i);
  }
  return set;
}

const 场景表 = [
  { 名: '访客猫-market', 点: 'market', 路由旧: 'f_v202', 基准: 旧访 },
  { 名: '访客猫-park_bench', 点: 'park_bench', 路由旧: 'f_v202', 基准: 旧访 },
  { 名: '访客猫-river_walk', 点: 'river_walk', 路由旧: 'f_v202', 基准: 旧访 },
  { 名: '店猫-端坐', 席: true, 钉端坐: true, 路由旧: 'f_v199', 基准: 旧店 },
];

const report = { 现版本: 现版本号, 基准: { 访客猫: 旧访, 店猫: 旧店 }, 自测注入: 自测注入 || '（无）', 场景: [] };
for (const 场景 of 场景表) {
  const 新 = await 跑一版('cur', 场景, '现版');
  const 旧 = await 跑一版(场景.路由旧, 场景, 场景.基准);
  if (新.没找到 || 旧.没找到) { 判(场景.名 + ' · 场景可搭', false, { 新: 新.没找到 || false, 旧: 旧.没找到 || false }); continue; }
  const 盒同 = 新.A.box.length === 旧.A.box.length && 新.A.box.every((v, i) => v === 旧.A.box[i]);
  const 新脚 = 差集(新.A.px, 新.B.px), 旧脚 = 差集(旧.A.px, 旧.B.px);
  let 只新 = 0, 只旧 = 0, 大色差 = 0, 小色差 = 0, 最大色差 = 0;
  for (const i of 新脚) {
    if (!旧脚.has(i)) { 只新++; continue; }
    const j = i * 4; let dd = 0;
    for (let k = 0; k < 3; k++) dd = Math.max(dd, Math.abs(新.A.px[j + k] - 旧.A.px[j + k]));
    最大色差 = Math.max(最大色差, dd);
    if (dd > 大色差线) 大色差++; if (dd > 6) 小色差++;
  }
  for (const i of 旧脚) if (!新脚.has(i)) 只旧++;
  const 好 = 盒同 && 只新 <= 轮廓宽容 && 只旧 <= 轮廓宽容 && 大色差 === 0 && 小色差 <= 小色差数上限;
  const 读数_ = { 基准: 场景.基准, 猫日: 新.布置.day, 花色: 新.布置.花色 || '（店猫）', 盒: 新.A.box, 盒一致: 盒同,
    猫像素_现: 新脚.size, 猫像素_旧: 旧脚.size, 只多: 只新, 只少: 只旧, 色差大于24: 大色差, 色差大于6: 小色差, 最大色差, 页面报错: 新.错.length + 旧.错.length };
  判(场景.名, 好, 读数_);
  report.场景.push({ 名: 场景.名, 好, ...读数_ });
}
report.通过 = report.场景.every(x => x.好);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
await browser.close();
srv.close();
console.log('读数与图在 ' + OUT);
console.log(report.通过 ? '✔ 缺省路径像素冻结闸：全过' : '✘ 有场景不过（见上）');
process.exit(report.通过 ? 0 : 1);
