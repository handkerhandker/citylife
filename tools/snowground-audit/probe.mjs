// 冬日积雪探针（真浏览器；只读诊断。第 166 单立，进冒烟档 2）
//
// 量什么：**室外可走地面的白度**（区域均值 (r+g+b)/3）——深冬（入冬第 11 天起"settle"）
//   vs 初冬（只下不积）vs 其余三季；室内（便利店）与江面作**不吃雪**的对照。
//   为什么用 reduceMotion=真：关掉空中的飘雪/花瓣等动画，量到的是"地面本身"的白
//   （积雪是静态景物，照四季罩层口径与 reduceMotion 无关）。
//   场景：春 D5／夏 D120／秋 D200／初冬 D275（冬第 5 天）／深冬 D300（冬第 30 天），
//   全部 12:00、同机位、speed=0。
//   判据：深冬四块主地面都 ≥ 初冬 +40（岸线窄带 +30）且室内/江面 |深冬−初冬| ≤ 20 且零 pageerror。
// 用法：node tools/snowground-audit/probe.mjs [输出目录]        （要 CITYLIFE_CHROME）
//   对照跑旧版：--改前=<git-ref>（旧版无积雪 ⇒ 深冬 ≈ 初冬 ⇒ 判红）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'snowground-audit'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
fs.mkdirSync(OUT, { recursive: true });

const raw = BEFORE
  ? execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:city-life-framework.html`], { maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},get PLAZA(){return PLAZA},get STREET_Y(){return STREET_Y},get SHORE_Y(){return SHORE_Y},get RIVER_Y(){return RIVER_Y},get ROOM_FURN(){return ROOM_FURN},get PLAZA_TREE(){return PLAZA_TREE}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }

const PORT = 18970;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const 错 = [];
page.on('pageerror', e => 错.push('pageerror: ' + ((e && e.message) || e)));
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html?seed=20261004`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

const 摆场景 = (t) => `(() => { const st=__pv.state, w=st.world;
  w.speed=0; w.t=${t}; w.weather.rain=false; st.llm.on=false; st.reduceMotion=true;
  st.cam.manual=true; st.cam.fx=24; st.cam.fy=15; })()`;

/* 区域＝格坐标 [x,y,w,h]，**从产品常量现读**（街道行／岸线行／广场矩形／房间矩形／江面起点），
   不在这里写第二套几何；室内（便利店）与江面是对照（不该被雪盖到）。 */
const 区域 = await page.evaluate(() => {
  const Sim = __pv.Sim, P = __pv.PLAZA, 房 = id => Sim.ROOMS.find(r => r.id === id);
  const park = 房('park'), walk = 房('river'), store = 房('store');
  return {
    街道: [0, __pv.STREET_Y - 1, Sim.MAPW, 3],
    岸线: [0, __pv.SHORE_Y, Sim.MAPW, 1],
    广场: [P.x, P.y, P.w, P.h],
    公园: [park.x, park.y, park.w, park.h],
    江边步道: [walk.x, walk.y, walk.w, walk.h],
    室内便利店: [store.x, store.y, store.w, store.h],
    江面: [0, __pv.RIVER_Y, Sim.MAPW, Sim.MAPH - __pv.RIVER_Y],
  };
});

/* 第 169 单：树冠雪帽——取样"树冠圆的顶部"（公园三棵树＋广场大树）；
   位置从 ROOM_FURN/PLAZA_TREE 现读，与产品同一处定义。 */
const 树顶区 = await page.evaluate(() => {
  const out = [];
  let i = 0;
  for (const f of (__pv.ROOM_FURN.park || [])) if (f.k === 'tree') {
    const cx = f.x + 0.5, cy = f.y + 0.38, r = 0.62;
    out.push(['公园树' + (++i), [cx - r * 0.55, cy - r * 0.85, r * 1.1, r * 0.7]]);
  }
  const T = __pv.PLAZA_TREE, cx = T.x + T.w / 2, cy = T.y + T.h * 0.45, r = T.w * 0.42;
  out.push(['广场树', [cx - r * 0.55, cy - r * 0.85, r * 1.1, r * 0.7]]);
  return out;
});
const 树名 = 树顶区.map(t => t[0]);

const 测白度 = (格) => page.evaluate((q) => {
  const cv = document.querySelector('#cv'), st = __pv.state, s = st.view.s;
  const x0 = Math.round(st.view.ox + q[0] * s), y0 = Math.round(st.view.oy + q[1] * s);
  const w = Math.round(q[2] * s), h = Math.round(q[3] * s);
  const d = cv.getContext('2d').getImageData(x0, y0, w, h).data;
  let 合 = 0, n = 0;
  for (let i = 0; i < d.length; i += 12) { 合 += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }   // 每 3 像素抽 1
  return Math.round(合 / n * 10) / 10;
}, 格);

const 一景 = async (名, t) => {
  await page.evaluate(摆场景(t));
  await page.waitForTimeout(1200);
  const o = {};
  for (const k of Object.keys(区域)) o[k] = await 测白度(区域[k]);
  for (const [k, rect] of 树顶区) o[k] = await 测白度(rect);
  return o;
};

const 春 = await 一景('春', 5 * 1440 + 12 * 60);
const 夏 = await 一景('夏', 120 * 1440 + 12 * 60);
const 秋 = await 一景('秋', 200 * 1440 + 12 * 60);
const 初冬 = await 一景('初冬', 275 * 1440 + 12 * 60);
await page.locator('#cv').screenshot({ path: path.join(OUT, '初冬.png') });
const 深冬 = await 一景('深冬', 300 * 1440 + 12 * 60);
await page.locator('#cv').screenshot({ path: path.join(OUT, '深冬.png') });
await browser.close(); srv.close();

const 地面 = ['街道', '岸线', '广场', '公园', '江边步道'];
const 阈值 = { 街道: 40, 岸线: 30, 广场: 40, 公园: 40, 江边步道: 40 };
const 不吃的 = ['室内便利店', '江面'];
const 读数 = { 春, 夏, 秋, 初冬, 深冬, 错误: 错 };
const 通过 = 地面.every(k => (深冬[k] - 初冬[k]) >= 阈值[k])
  && 不吃的.every(k => Math.abs(深冬[k] - 春[k]) <= 20)
  && 地面.every(k => (深冬[k] - 春[k]) >= 阈值[k])
  && 树名.every(k => (深冬[k] - 初冬[k]) >= 40 && (深冬[k] - 春[k]) >= 40)
  && 错.length === 0;
读数.通过 = 通过;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(读数, null, 2), 'utf8');
console.log((通过 ? '✔' : '✘') + ' 冬日积雪：' + JSON.stringify({
  深冬, 初冬, 春,
  不吃的: 不吃的.map(k => k + ' Δ=' + Math.round((深冬[k] - 春[k]) * 10) / 10),
  树冠: 树名.map(k => k + ' 深冬' + 深冬[k] + '／初冬' + 初冬[k]),
  错误: 错,
}));
process.exit(通过 ? 0 : 1);
