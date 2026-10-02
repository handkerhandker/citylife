// 第 35 单·入夜点灯实机取证：真浏览器里跑生产的 `draw()`，同一场景两个钟点各拍一遍，
// 并按房间逐块比对「改前 vs 改后」。
//
// 保真度口径（照第 19／20／25／26／30／31／32／33 单几支 shots 的先例，逐条同源）：
//   ① 画的是**生产源码自己的 draw()**，脚本一行渲染代码都没有；HTML 只在末尾追加一句 `window.__pv={…}`。
//   ② 「摆姿势」只动显示位与钟点两样（照第 31／33 单先例）；`w.speed=0` ⇒ Sim.step／decide 都不跑，
//      落盘的世界、SIM 源码、rng 流一概没碰。
//   ③ 判据前先把两条噪声掐掉：`reduceMotion=true`（雨幕整条跳过）＋天气拨晴；
//      四人摆在客厅餐桌，故**公园与江边两块裁剪区里没有任何会动的东西**。
//
// **本单的主判据（逐字节，两个方向）**：
//   · 室内五间：改后必须与改前**不同**（灯真的亮起来了）；
//   · 室外两间：改后必须与改前**逐字节相同**（灯一个像素都没点到室外）。
// 两只判据合起来才说明「只点室内」成立——只验前者会被「整张图都加亮」蒙混过去。
//
// 用法：node tools/night-lamp/shots.mjs <输出目录> [--改前=<git-ref>]
//   浏览器用预装 Chromium（CITYLIFE_CHROME 可覆盖）。
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'docs/交付/第35单-图'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const PORT = 18935;
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

const 室内 = ['living', 'kitchen', 'bedroom', 'store', 'office'];
const 室外 = ['park', 'river'];

const pose = (page, hour, minute) => page.evaluate(([hour, minute]) => {
  const st = __pv.state, w = st.world, A = __pv.Sim.ANCHORS['home_table'], sp = __pv.SPOTS['home_table'];
  w.speed = 0;
  w.t = 1440 * 6 + hour * 60 + minute;
  st.llm.on = false;
  st.reduceMotion = true;              // 雨幕整条跳过（判据要的是静态画面）
  w.weather.rain = false;
  st.cam.manual = true; st.cam.fx = A.x + 0.5; st.cam.fy = A.y + 0.5;
  const ACTS = [['work', '上班'], ['eat', '做饭吃'], ['chat', '和谁聊天'], ['sleep', '睡觉']];
  w.agents.forEach((ag, i) => {
    const o = sp[i % sp.length], v = st.vis[ag.id];
    v.x = v.dspX = A.x + 0.5 + o[0];
    v.y = v.dspY = A.y + 0.5 + o[1];
    v.path = []; v.moving = false; v.dir = 3;
    ag.activity = { type: ACTS[i][0], label: ACTS[i][1] };
  });
  return w.t;
}, [hour, minute]);

const settle = ms => new Promise(r => setTimeout(r, ms));
const pre = BEFORE ? '改前-' : '';
const 读数 = { 改前基线: BEFORE || '（工作区当前版本）', 视口: [], 房间: [] };

for (const [vpName, vp] of [['桌面', { width: 1400, height: 900 }], ['手机', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  await page.goto(URL_); await settle(2600);
  for (const [钟, h, m] of [['03-凌晨3点', 3, 0], ['12-正午12点', 12, 0]]) {
    if (vpName === '手机' && 钟 !== '03-凌晨3点') continue;      // 手机只拍夜里那一档，省得堆图
    await pose(page, h, m);
    await settle(400);
    const f = `${pre}${钟}-${vpName}.png`;
    await page.screenshot({ path: path.join(OUT, f) });
    const b = fs.readFileSync(path.join(OUT, f));
    读数.视口.push({ 视口: vpName, 钟点: 钟, 文件: f, 字节: b.length, sha256: createHash('sha256').update(b).digest('hex').slice(0, 16) });
    console.log('出图', f, b.length, '字节');

    // 逐房间裁剪：只有桌面视口做（手机视口装不下全部房间）
    if (vpName !== '桌面') continue;
    for (const id of 室内.concat(室外)) {
      const reg = await page.evaluate((id) => {
        const r = __pv.Sim.ROOMS.find(x => x.id === id), cv = document.querySelector('#cv');
        const box = cv.getBoundingClientRect(), v = __pv.state.view, s = v.s;
        return { x: Math.round(box.x + v.ox + r.x * s), y: Math.round(box.y + v.oy + r.y * s),
                 width: Math.round(r.w * s), height: Math.round(r.h * s) };
      }, id);
      const buf = await page.screenshot({ clip: reg });
      const key = `房间-${id}-${钟.slice(0, 2)}`;
      fs.writeFileSync(path.join(OUT, `${pre}${key}.png`), buf);
      读数.房间.push({ 房间: id, 室内: 室内.includes(id), 钟点: 钟, 字节: buf.length,
                       sha256: createHash('sha256').update(buf).digest('hex') });
    }
  }
  await page.close();
}
fs.writeFileSync(path.join(OUT, `${pre}读数.json`), JSON.stringify(读数, null, 2), 'utf8');
await browser.close(); srv.close();
console.log('完成：', OUT);
