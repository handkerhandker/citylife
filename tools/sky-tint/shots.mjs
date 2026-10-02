// 第 33 单·天色实机取证：在**真浏览器**里跑生产的 `draw()`，把同一天五个时刻画出来，
// 呈决策者目验（机器闸管判据，决策者目验管观感）。
//
// 保真度口径（照第 19／20／25／26／30／31／32 单几支 shots 的先例，逐条同源）：
//   ① 画的是**生产源码自己的 draw()**，脚本一行渲染代码都没有；HTML 只在末尾追加一句
//      `window.__pv={…}` 把 state／pix 暴露出来，渲染路径与 `skyPaint()` 全程逐字未动。
//   ② 「摆姿势」只动三样：`state.vis[id]` 的显示位（照 preview_shots 先例）、`ag.activity`、
//      以及**被展示的那个量本身** `w.t`。`w.speed=0` ⇒ `Sim.step` 不跑、`decide()` 不跑、
//      位置与钟点都不会自己动；**落盘的世界、SIM 源码、rng 流一概没碰**。
//   ③ 四个站位用生产的 `STAND_SPOTS.home_table` 真站位（与第 31／32 单同锚同框，可逐张对照）。
//   ④ `--改前` 用 `git show <基线>:city-life-framework.html` 取基线原文同法跑一遍，出改前对照。
//   ⑤ **逐像素判据**：改前那一趟的「凌晨 4 点」与「正午 12 点」两张图必须**逐字节相同**（那就是本单的病），
//      改后那一趟必须不同——两个数都写进 `读数.json`，不靠嘴说。
//
// 用法：node tools/sky-tint/shots.mjs <输出目录> [--改前=<git-ref>]
//   浏览器用预装 Chromium（CITYLIFE_CHROME 可覆盖）。
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'docs/交付/第33单-图'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const PORT = 18933;
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

// 摆姿势：四人按生产的 STAND_SPOTS 站到客厅餐桌，钟点拨到指定时刻；活动固定，免得“这天有没有事”干扰对照
const pose = (page, hour, minute) => page.evaluate(([hour, minute]) => {
  const st = __pv.state, w = st.world, A = __pv.Sim.ANCHORS['home_table'], sp = __pv.SPOTS['home_table'];
  w.speed = 0;
  w.t = 1440 * 6 + hour * 60 + minute;    // 钉在 D7：日子固定，只换钟点
  st.llm.on = false;                       // 沙箱不通网，别让 ⚠ 连线失败进日志墙干扰目验
  st.cam.manual = true; st.cam.fx = A.x + 0.5; st.cam.fy = A.y + 0.5;
  const ACTS = [['work', '上班'], ['eat', '做饭吃'], ['chat', '和谁聊天'], ['sleep', '睡觉']];
  w.agents.forEach((ag, i) => {
    const o = sp[i % sp.length], v = st.vis[ag.id];
    v.x = v.dspX = A.x + 0.5 + o[0];
    v.y = v.dspY = A.y + 0.5 + o[1];
    v.path = []; v.moving = false; v.dir = 3;
    ag.activity = { type: ACTS[i][0], label: ACTS[i][1] };
  });
  return { t: w.t };
}, [hour, minute]);

const settle = ms => new Promise(r => setTimeout(r, ms));
const pre = BEFORE ? '改前-' : '';
const 档 = [
  ['04-凌晨4点', 4, 0], ['07-早晨7点', 7, 0], ['12-正午12点', 12, 0],
  ['18-傍晚6点半', 18, 30], ['22-夜里10点', 22, 0],
];
const 读数 = { 改前基线: BEFORE || '（工作区当前版本）', 档: [], 逐像素: {} };

for (const [vpName, vp] of [['桌面', { width: 1400, height: 900 }], ['手机', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: vpName === '手机' ? 2 : 1 });
  await page.goto(URL_); await settle(2600);
  const 该视口要拍的 = vpName === '手机' ? [档[2], 档[4]] : 档;
  for (const [名, h, m] of 该视口要拍的) {
    await pose(page, h, m);
    await settle(420);
    const f = `${pre}${名}-${vpName}.png`;
    await page.screenshot({ path: path.join(OUT, f) });
    const b = fs.readFileSync(path.join(OUT, f));
    读数.档.push({ 视口: vpName, 档: 名, 文件: f, 字节: b.length, sha256: createHash('sha256').update(b).digest('hex').slice(0, 16) });
    console.log('出图', f, `${b.length} 字节`);
  }
  await page.close();
}

/* 逐像素判据（本单的主证据）：同一台机器、同一份场景，只把钟点拨到 04:00 与 12:00，比一块
   **没有任何会动的东西**的画面（江面：静态水波纹理，四人都不在那儿）。
   两条噪声必须先在源头掐掉，否则量到的是动画不是天色：
     · 精灵 idle 帧按真实时间 `Math.floor(now/1000*6)%6` 变 —— 故裁剪区**不含人物**；
     · 雨幕按 `rainSeed` 逐帧扫 —— 故置 `reduceMotion=true`（雨幕整条跳过）并把天气拨成晴。
   判据：改前那一趟两张必须**逐字节相同**（v40 的 draw() 一次都没读钟点），改后那一趟必须不同。 */
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(URL_); await settle(2600);
  const shot = {};
  for (const [名, h, m] of [['04', 4, 0], ['12', 12, 0]]) {
    await pose(page, h, m);
    await page.evaluate(() => { __pv.state.reduceMotion = true; __pv.state.world.weather.rain = false; });
    await settle(400);
    const reg = await page.evaluate(() => {
      const r = document.querySelector('#cv').getBoundingClientRect(), v = __pv.state.view, s = v.s;
      return { x: Math.max(0, Math.round(r.x + v.ox + 2 * s)), y: Math.max(0, Math.round(r.y + v.oy + 24 * s)),
               width: Math.round(12 * s), height: Math.round(3 * s) };
    });
    const b = await page.screenshot({ clip: reg });
    shot[名] = b;
    fs.writeFileSync(path.join(OUT, `${pre}判据-江面-${名}点.png`), b);
    console.log(`判据图 江面@${名}点 ${b.length} 字节`, JSON.stringify(reg));
  }
  await page.close();
  读数.逐像素 = { 凌晨4点: shot['04'].length, 正午12点: shot['12'].length, 逐字节相同: Buffer.compare(shot['04'], shot['12']) === 0 };
  console.log(`逐像素：凌晨 4 点 ${shot['04'].length} 字节 ／ 正午 12 点 ${shot['12'].length} 字节 ⇒ 逐字节${读数.逐像素.逐字节相同 ? '相同' : '不同'}`);
}
fs.writeFileSync(path.join(OUT, `${pre}读数.json`), JSON.stringify(读数, null, 2), 'utf8');
await browser.close(); srv.close();
console.log('完成：', OUT);
