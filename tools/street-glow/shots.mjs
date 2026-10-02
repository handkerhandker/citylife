// 第 38 单·室外路灯光斑实机取证：真浏览器跑生产的 `draw()`，夜里与正午各拍一遍，
// 并比两块区域：「岸线步道（室外地面，该亮）」与「公寓·客厅（室内，不该被本层碰）」。
//
// 保真度口径（照第 19／20／25／26／30／31／32／33／35／36 单几支 shots 的先例，逐条同源）：
//   ① 画的是**生产源码自己的 draw()**，脚本一行渲染代码都没有；HTML 只在末尾追加 `window.__pv={…}`。
//   ② 「摆姿势」只动显示位与钟点；`w.speed=0` ⇒ Sim.step／decide 都不跑，世界与 rng 流一概没碰。
//   ③ 判据前先把两条噪声掐掉：`reduceMotion=true`（雨幕整条跳过）＋天气拨晴。
//
// **本单的主判据（逐字节，三个方向）**：
//   · 岸线步道 03:00：改后必须与改前**不同**（灯真的铺上了）；
//   · 岸线步道 12:00：必须**逐字节相同**（白天不亮）；
//   · 便利店  03:00／12:00：必须**逐字节相同**（本层只画室外，室内一个像素都不许动）。
//
// **对照组为什么是便利店而不是客厅**：四人这一场被摆在客厅餐桌，精灵的 idle 帧按**真实时间**走
// （`Math.floor(now/1000*6)%6`），故客厅每次都不同——本单第一版拿客厅当对照，两趟必然不同，
// 报出两个假阳性（这个坑第 35 单也踩过一次）。**对照组必须挑一块「没有任何会动的东西」的区域**：
// 便利店这一场里空着、又由第 35 单的室内灯照着，正好。
//
// 用法：node tools/street-glow/shots.mjs <输出目录> [--改前=<git-ref>]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'docs/交付/第38单-图'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const PORT = 18938;
fs.mkdirSync(OUT, { recursive: true });

const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get pix(){return pix},get Sim(){return Sim},get SPOTS(){return STAND_SPOTS}};\n})();\n</script>');
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

// 两块采样区：岸线步道（室外地面，第 23 行那一带）／公寓客厅（室内，对照组）
const 采样区 = [
  { 名: '岸线步道', 世界: { x: 2, y: 22.2, w: 44, h: 1.5 }, 该变: true },
  { 名: '便利店',   房: 'store',                         该变: false },
];

const pose = (page, hour, minute) => page.evaluate(([hour, minute]) => {
  const st = __pv.state, w = st.world, A = __pv.Sim.ANCHORS['home_table'], sp = __pv.SPOTS['home_table'];
  w.speed = 0;
  w.t = 1440 * 6 + hour * 60 + minute;
  st.llm.on = false;
  st.reduceMotion = true;
  w.weather.rain = false;
  st.cam.manual = true; st.cam.fx = 24; st.cam.fy = 12;      // 取景居中，保证岸线与公寓同时在框内
  const ACTS = [['work', '上班'], ['eat', '做饭吃'], ['chat', '和谁聊天'], ['sleep', '睡觉']];
  w.agents.forEach((ag, i) => {
    const o = sp[i % sp.length], v = st.vis[ag.id];
    v.x = v.dspX = A.x + 0.5 + o[0];
    v.y = v.dspY = A.y + 0.5 + o[1];
    v.path = []; v.moving = false; v.dir = 3;
    ag.activity = { type: ACTS[i][0], label: ACTS[i][1] };
  });
}, [hour, minute]);

const settle = ms => new Promise(r => setTimeout(r, ms));
const pre = BEFORE ? '改前-' : '';
const 读数 = { 改前基线: BEFORE || '（工作区当前版本）', 视口: [], 采样: [] };
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
await page.goto(URL_); await settle(2600);
for (const [钟, h, m] of [['03-凌晨3点', 3, 0], ['12-正午12点', 12, 0]]) {
  await pose(page, h, m);
  await settle(400);
  const f = `${pre}${钟}-桌面.png`;
  await page.screenshot({ path: path.join(OUT, f) });
  const b = fs.readFileSync(path.join(OUT, f));
  读数.视口.push({ 钟点: 钟, 文件: f, 字节: b.length, sha256: createHash('sha256').update(b).digest('hex').slice(0, 16) });
  console.log('出图', f, b.length, '字节');
  for (const s of 采样区) {
    const reg = await page.evaluate((s) => {
      const cv = document.querySelector('#cv'), box = cv.getBoundingClientRect(), v = __pv.state.view, sc = v.s;
      const w = s.世界 || (() => { const r = __pv.Sim.ROOMS.find(x => x.id === s.房); return { x: r.x, y: r.y, w: r.w, h: r.h }; })();
      // 采样区**内缩 2px**：房间矩形的边界线上压着 2px 的墙线（strokeRect），
      // 而街灯照到墙的**外表面**是正常的（门禁只保证「光不进屋」）。不内缩就会把这 1–2px
      // 的墙外表面算进「室内」，报出假阳性——本单第二版正是栽在这里。
      const inset = 2;
      return { x: Math.round(box.x + v.ox + w.x * sc) + inset, y: Math.round(box.y + v.oy + w.y * sc) + inset,
               width: Math.round(w.w * sc) - inset * 2, height: Math.round(w.h * sc) - inset * 2 };
    }, s);
    const buf = await page.screenshot({ clip: reg });
    const key = `区-${s.名}-${钟.slice(0, 2)}`;
    fs.writeFileSync(path.join(OUT, `${pre}${key}.png`), buf);
    读数.采样.push({ 区: s.名, 该变: s.该变, 钟点: 钟, 字节: buf.length,
                    sha256: createHash('sha256').update(buf).digest('hex') });
  }
}
await page.close();
fs.writeFileSync(path.join(OUT, `${pre}读数.json`), JSON.stringify(读数, null, 2), 'utf8');
await browser.close(); srv.close();
console.log('完成：', OUT);
