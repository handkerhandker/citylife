// 晴夜星空与流星探针（真浏览器；只读诊断。第 164 单立，进冒烟档 2）
//
// 量什么：**地图外沿两条背景带**（地图上缘以上＋地图下缘以下）里的星色像素
//   （r≥55 且 b≥r+15 且 g≥r；星 210,220,240 低 alpha 叠夜空后仍命中，夜空底色与白天空带都不命中）。
//   为什么只量背景带：地图内部有水面/招牌/灯，星色像素不纯；两条背景带是纯夜空，星点最干净。
//   为什么用"动效关"做对照：人物活动牌 emoji 等静态亮蓝像素可能落进带上缘（实测旧版 28 个），
//   单看绝对数会误判；同一场景把 reduceMotion 打开（starField/meteorPaint 直接跳过）再量一次，
//   **差值＝星点贡献**（静态内容两次相同，自动抵消）。
//   场景：夜晴（D7 22:00）／夜晴·动效关／白天（12:00）／夜雨（同刻+雨，仅参考不判）。
//   判据：夜晴开 − 夜晴关 ≥ 8（静态活动牌 emoji 两次都在、自动抵消）、白天 ≤ 3、零 pageerror。
//   第 301 单扩·冬夜极光：量**"极光色"像素**（绿：g≥r+20 且 g≥b+2；紫粉：r≥g+2 且 b≥g+30——
//   夜空底色、江面底色、星空、雪点都不命中），两处都量：**江面倒影区**（真机竖屏就看得到）
//   与**天空带**（拉镜头能看到）。四景：冬夜 21:00（出处"9 点最亮"）／冬夜 20:00（两端更淡）／
//   夏夜 21:00（不许有）／冬夜·动效关（不许有）。
//   判据：冬夜21 ≥（江 1000／天 400）、冬夜21 ≥ 冬夜20（峰在 9 点）、
//   夏夜：江 ≤ 400（夏夜江面有**萤火虫**等黄绿光点残留、量级与极光差 5 倍以上：另加"≥5×+500"）、天 ≤ 60；
//   动效关：江/天 ≤ 60（极光与星空都跳过）；零 pageerror。
// 用法：node tools/stars-audit/probe.mjs [输出目录]        （要 CITYLIFE_CHROME）
//   对照跑旧版：--改前=<git-ref>（旧版无星空 ⇒ 差值为 0 ⇒ 判红）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'stars-audit'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
fs.mkdirSync(OUT, { recursive: true });

const raw = BEFORE
  ? execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:city-life-framework.html`], { maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }

const PORT = 18968;
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

/* 量"两条背景带"里的星色像素；地图内部（含水面/招牌/灯）一律不数。 */
const 数星 = () => page.evaluate(() => {
  const cv = document.querySelector('#cv');
  const st = __pv.state;
  const 顶带 = Math.max(4, Math.round(st.view.oy) - 2);
  const 底起 = Math.max(顶带 + 1, Math.round(st.view.oy + __pv.Sim.MAPH * st.view.s) + 2);
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let y = 0; y < cv.height; y++) {
    if (y >= 顶带 && y < 底起) continue;          // 地图内部：不数
    for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      if (d[i] >= 55 && d[i + 2] >= d[i] + 15 && d[i + 1] >= d[i]) n++;
    }
  }
  return n;
});

/* 第 301 单：量"极光色"像素；区='江'（江面倒影区，地图下缘 86%–100%）或 '天'（地图上缘以上天空带）。 */
const 数极光 = (区) => page.evaluate((区) => {
  const cv = document.querySelector('#cv'), st = __pv.state, s = st.view.s, ox = st.view.ox, oy = st.view.oy;
  const MAPW = __pv.Sim.MAPW, MAPH = __pv.Sim.MAPH;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let x0, y0, x1, y1;
  if (区 === '江') { x0 = ox; x1 = ox + MAPW * s; y0 = oy + MAPH * s * 0.86; y1 = oy + MAPH * s; }
  else { x0 = 0; x1 = cv.width; y0 = 0; y1 = Math.max(4, Math.round(oy) - 2); }
  let n = 0;
  for (let y = Math.max(0, Math.ceil(y0)); y < Math.min(cv.height, Math.floor(y1)); y++)
    for (let x = Math.max(0, Math.ceil(x0)); x < Math.min(cv.width, Math.floor(x1)); x++) {
      const i = (y * cv.width + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      if ((g >= r + 20 && g >= b + 2) || (r >= g + 2 && b >= g + 30)) n++;
    }
  return n;
}, 区);

const 一景 = async (名, 摆) => {
  await page.evaluate(摆);
  await page.waitForTimeout(1200);
  let 合 = 0;
  const 样 = [];
  for (let i = 0; i < 24; i++) { const n = await 数星(); 样.push(n); 合 += n; await page.waitForTimeout(300); }
  if (process.env.STARS_DEBUG) {
    const 几何 = await page.evaluate(() => ({ oy: Math.round(__pv.state.view.oy), cvH: Math.round(__pv.state.cvH), cvW: Math.round(__pv.state.cvW) }));
    console.log('[调试]', 名, JSON.stringify(几何), JSON.stringify(样));
  }
  return 合 / 24;
};

const 一景极光 = async (名, 摆) => {
  await page.evaluate(摆);
  await page.waitForTimeout(1200);
  let 江合 = 0, 天合 = 0;
  const 样 = [];
  for (let i = 0; i < 16; i++) {
    const a = await 数极光('江'), b = await 数极光('天');
    江合 += a; 天合 += b; 样.push([a, b]); await page.waitForTimeout(300);
  }
  if (process.env.STARS_DEBUG) console.log('[调试·极光]', 名, JSON.stringify(样.slice(0, 6)));
  return { 江: 江合 / 16, 天: 天合 / 16 };
};

const 摆场景 = (t, 雨, rm) => `(() => { const st=__pv.state, w=st.world;
  w.speed=0; w.t=${t}; w.weather.rain=${雨}; ${雨 ? 'w.weather.until=1e9;' : ''}
  st.llm.on=false; st.reduceMotion=${rm}; st.cam.manual=true; st.cam.fx=24; st.cam.fy=15; })()`;

const 夜晴开 = await 一景('夜晴开', 摆场景(6 * 1440 + 22 * 60, false, false));
await page.locator('#cv').screenshot({ path: path.join(OUT, '夜晴.png') });
const 夜晴关 = await 一景('夜晴关', 摆场景(6 * 1440 + 22 * 60, false, true));
const 白天 = await 一景('白天', 摆场景(6 * 1440 + 12 * 60, false, false));
const 夜雨 = await 一景('夜雨', 摆场景(6 * 1440 + 22 * 60, true, false));
const 冬夜21 = await 一景极光('冬夜21', 摆场景(299 * 1440 + 21 * 60, false, false));
await page.locator('#cv').screenshot({ path: path.join(OUT, '冬夜极光.png') });
const 冬夜20 = await 一景极光('冬夜20', 摆场景(299 * 1440 + 20 * 60, false, false));
const 夏夜21 = await 一景极光('夏夜21', 摆场景(120 * 1440 + 21 * 60, false, false));
const 冬夜关 = await 一景极光('冬夜关', 摆场景(299 * 1440 + 21 * 60, false, true));
await browser.close(); srv.close();

const 差 = 夜晴开 - 夜晴关;
const 结论 = {
  夜晴开: Math.round(夜晴开 * 10) / 10, 夜晴关: Math.round(夜晴关 * 10) / 10, 差值: Math.round(差 * 10) / 10,
  白天: Math.round(白天 * 10) / 10, 夜雨_参考不判: Math.round(夜雨 * 10) / 10, 错误: 错,
};
结论.通过 = (差 >= 8 && 白天 <= 3 && 错.length === 0);
const 圆 = (o) => ({ 江: Math.round(o.江), 天: Math.round(o.天) });
const 极光 = { 冬夜21: 圆(冬夜21), 冬夜20: 圆(冬夜20), 夏夜21: 圆(夏夜21), 冬夜动效关: 圆(冬夜关) };
结论.极光 = 极光;
结论.极光通过 = (冬夜21.江 >= 1000 && 冬夜21.天 >= 400
  && 冬夜21.江 >= 冬夜20.江 && 冬夜21.天 >= 冬夜20.天
  && 夏夜21.江 <= 400 && 夏夜21.天 <= 60 && 冬夜21.江 >= 夏夜21.江 * 5 + 500
  && 冬夜关.江 <= 60 && 冬夜关.天 <= 60
  && 错.length === 0);
结论.通过 = (结论.通过 && 结论.极光通过);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
console.log((结论.通过 ? '✔' : '✘') + ' 晴夜星空／冬夜极光：' + JSON.stringify(结论));
process.exit(结论.通过 ? 0 : 1);
