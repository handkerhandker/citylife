// 第 111 单·四季实机取证：在**真浏览器**里跑生产的 `draw()`，把春／夏／秋／冬同一钟点画出来，
// 呈决策者目验（机器闸管判据，决策者目验管观感）。
//
// 保真度口径（照第 33 单·sky-tint 那支 shots 的先例，逐条同源）：
//   ① 画的是**生产源码自己的 draw()**，脚本一行渲染代码都没有；HTML 只在末尾追加一句
//      `window.__pv={…}` 把 state／pix 暴露出来，渲染路径与 `seasonPaint()` 全程逐字未动。
//   ② 「摆姿势」只动四样：`state.vis[id]` 的显示位、`ag.activity`、被展示的那个量 `w.t`，
//      以及**显示开关** `state.reduceMotion=true`（关掉会自己走的平滑与雨幕动画——本单比的是季节罩层，
//      别让动画相位干扰逐像素判据）。`w.speed=0` ⇒ `Sim.step` 不跑、`decide()` 不跑；
//      落盘的世界、SIM 源码、rng 流一概没碰。页面一律带 `?seed=20260803` ⇒ 两次跑的世界同一条轨迹。
//   ③ 四个站位用生产的 `STAND_SPOTS.home_table` 真站位（与第 31／32／33 单同锚同框，可逐张对照）。
//   ④ 判据（四条，全部写进 `读数.json`，不靠嘴说）——量尺是**画布的 16×16 分区均色**（`getImageData` 现读），
//      不是 PNG 逐字节：平移一帧的平滑与抗锯齿会有几十个像素的噪声（实测 69／821k＝0.008%），
//      分区均色对这点噪声免疫，而对"整屏 5–8% 的罩层"非常敏感（实测同季跨版本 ≈0.0，跨季 ≥3.0）：
//      · 本版 春夏秋冬（正午）：两两距离 ≥2 —— 四季各有各的色（第 111 单的口径）；
//      · 本版春 与 改前春：距离 ≤0.5 —— 春天是基线（纯加法）；
//      · **第 112 单新增**：正午 四档 本版 vs 改前 都 ≤0.5（天黑漂移只动晨昏，正午一个像素不动）；
//        20:30 春／秋 ≤0.5（位移为 0 的两季原地不动）、夏／冬 ≥2（晨昏真被挪了一小时）。
//      另附：改前那一趟四季互相的距离值记在 `读数.json`（当基线本身已含四季时，它是"季节色罩"的量，不是病）。
//
// 用法：node tools/season-tint/shots.mjs <输出目录> [--改前=<git-ref>]
//   浏览器用预装 Chromium（CITYLIFE_CHROME 可覆盖）。
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'docs/交付/第111单-图'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
fs.mkdirSync(OUT, { recursive: true });

const 注入 = rawHtml => {
  const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
    'window.__pv={get state(){return state},get pix(){return pix},get Sim(){return Sim},get SPOTS(){return STAND_SPOTS}};\n})();\n</script>');
  if (html === rawHtml) { console.error('注入点没找到（页面末尾的 })();</script>）'); process.exit(1); }
  return html;
};
const 本版HTML = 注入(fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8'));
const 改前HTML = BEFORE ? 注入(execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`],
  { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })) : '';

const MIME = { '.html': 'text/html;charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.json': 'application/json' };
const 起服务 = (html, port) => http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return;
  }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(r);
}).listen(port);
const 本版Srv = 起服务(本版HTML, 18934);
const 改前Srv = BEFORE ? 起服务(改前HTML, 18935) : null;

const exe = process.env.CITYLIFE_CHROME || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: exe });

// 摆姿势：四人按生产的 STAND_SPOTS 站到客厅餐桌，日子拨到指定天、钟点固定正午；
// 活动固定，免得「这天有没有事」干扰对照（照第 33 单同一条口径）。
const pose = (page, day, hour, minute) => page.evaluate(([day, hour, minute]) => {
  const st = __pv.state, w = st.world, A = __pv.Sim.ANCHORS['home_table'], sp = __pv.SPOTS['home_table'];
  w.speed = 0;
  w.t = 1440 * (day - 1) + hour * 60 + minute;    // 只换日子与钟点
  st.reduceMotion = true;                         // 关掉平滑与雨幕动画：判据比的是季节罩层，不是雨点相位
  st.llm.on = false;                              // 沙箱不通网，别让 ⚠ 连线失败进日志墙干扰目验
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
}, [day, hour, minute]);

const settle = ms => new Promise(r => setTimeout(r, ms));
const 季档 = [                       // [名, 年内第几天]：春 D10／夏 D100／秋 D190／冬 D280
  ['春', 10], ['夏', 100], ['秋', 190], ['冬', 280],
];
const 读数 = { 改前基线: BEFORE || '（没给 --改前，跳过逐像素对照）', 档: [], 对照: {} };
const 哈希 = {};                     // key: [前缀][季][视口] → sha256
const 文件 = {};
const 签名 = {};                     // key: [前缀][季][视口] → {mean,grid}

// 画布签名：16×16 分区均色 ＋ 全画布均色（在页面里现读 getImageData，不靠 PNG 解码）
const 取签名 = page => page.evaluate(() => {
  const c = document.querySelector('#cv'), g = c.getContext('2d');
  const W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
  const N = 16, cell = [];
  for (let i = 0; i < N * N; i++) cell.push([0, 0, 0, 0]);
  let sum = [0, 0, 0], n = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    const i = (y * W + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2];
    sum[0] += r; sum[1] += gg; sum[2] += b; n++;
    const k = Math.min(N - 1, Math.floor(y / H * N)) * N + Math.min(N - 1, Math.floor(x / W * N));
    cell[k][0] += r; cell[k][1] += gg; cell[k][2] += b; cell[k][3]++;
  }
  return {
    mean: sum.map(v => Math.round(v / n * 100) / 100),
    grid: cell.map(c => [c[0] / c[3], c[1] / c[3], c[2] / c[3]].map(v => Math.round(v * 10) / 10)),
  };
});
const 距离 = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.grid.length; i++) for (let ch = 0; ch < 3; ch++)
    s += Math.abs(a.grid[i][ch] - b.grid[i][ch]);
  return s / (a.grid.length * 3);
};

async function 跑一轮(page, 季名, day, vpName, 前缀, hour, minute, 后缀) {
  await pose(page, day, hour, minute);
  await settle(420);
  const f = `${前缀}${季名}-${vpName}${后缀}.png`;
  await page.screenshot({ path: path.join(OUT, f) });
  const f2 = `${前缀}${季名}-${vpName}${后缀}-画布.png`;
  await page.locator('#cv').screenshot({ path: path.join(OUT, f2) });
  const b = fs.readFileSync(path.join(OUT, f2));
  const h = createHash('sha256').update(b).digest('hex');
  哈希[`${前缀}${季名}${后缀}-${vpName}`] = h;
  文件[`${前缀}${季名}${后缀}-${vpName}`] = f;
  const sg = await 取签名(page);
  签名[`${前缀}${季名}${后缀}-${vpName}`] = sg;
  读数.档.push({ 视口: vpName, 季: 季名, 时刻: hour+':'+String(minute).padStart(2,'0'), 全页图: f, 画布图: f2, 画布字节: b.length,
    画布sha256: h.slice(0, 16), 画布均色RGB: sg.mean });
}

for (const [vpName, vp] of [['桌面', { width: 1400, height: 900 }], ['手机', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: vpName === '手机' ? 2 : 1 });
  await page.goto(`http://127.0.0.1:18934/city-life-framework.html?seed=20260803`);
  await settle(2600);
  for (const [季名, day] of 季档) {
    await 跑一轮(page, 季名, day, vpName, '', 12, 0, '');
    await 跑一轮(page, 季名, day, vpName, '', 20, 30, '-2030');
  }
  await page.close();
  if (BEFORE) {
    const pageB = await browser.newPage({ viewport: vp, deviceScaleFactor: vpName === '手机' ? 2 : 1 });
    await pageB.goto(`http://127.0.0.1:18935/city-life-framework.html?seed=20260803`);
    await settle(2600);
    for (const [季名, day] of 季档) {
      await 跑一轮(pageB, 季名, day, vpName, '改前-', 12, 0, '');
      await 跑一轮(pageB, 季名, day, vpName, '改前-', 20, 30, '-2030');
    }
    await pageB.close();
  }
}
await browser.close();
本版Srv.close(); if (改前Srv) 改前Srv.close();

// —— 判据（16×16 分区均色距离；噪声实测 ≈0.0，罩层实测 ≥3）——
const 判 = [];
for (const vpName of ['桌面', '手机']) {
  const 春 = 签名[`春-${vpName}`];
  for (const s of ['夏', '秋', '冬']) {
    const d = 距离(春, 签名[`${s}-${vpName}`]);
    判.push(['本版 ' + s + ' 与春距离 ≥3（四季可辨）', d >= 3, '距离 ' + d.toFixed(2)]);
  }
  {
    let 小 = 1e9;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++)
      小 = Math.min(小, 距离(签名[`${['春', '夏', '秋', '冬'][i]}-${vpName}`], 签名[`${['春', '夏', '秋', '冬'][j]}-${vpName}`]));
    判.push(['本版四季两两距离 ≥2', 小 >= 2, '最小距离 ' + 小.toFixed(2) + '（噪声底 ≤0.34）']);
  }
  if (BEFORE) {
    const 改前春 = 签名[`改前-春-${vpName}`];
    {
      const d = 距离(春, 改前春);
      判.push(['本版春 与 改前春 距离 ≤0.5（纯加法）', d <= 0.5, '距离 ' + d.toFixed(2)]);
    }
    // 第 112 单：正午四档都不动；20:30 只有"有位移"的夏／冬动
    for (const s of ['春', '夏', '秋', '冬']) {
      const d = 距离(签名[`${s}-${vpName}`], 签名[`改前-${s}-${vpName}`]);
      判.push(['正午 ' + s + ' 本版＝改前（≤0.5）', d <= 0.5, '距离 ' + d.toFixed(2)]);
    }
    for (const s of ['春', '秋']) {
      const d = 距离(签名[`${s}${'-2030'}-${vpName}`], 签名[`改前-${s}${'-2030'}-${vpName}`]);
      判.push(['20:30 ' + s + ' 本版＝改前（位移为 0，≤0.5）', d <= 0.5, '距离 ' + d.toFixed(2)]);
    }
    for (const s of ['夏', '冬']) {
      const d = 距离(签名[`${s}${'-2030'}-${vpName}`], 签名[`改前-${s}${'-2030'}-${vpName}`]);
      判.push(['20:30 ' + s + ' 本版≠改前（晨昏被挪了一小时，≥2）', d >= 2, '距离 ' + d.toFixed(2)]);
    }
  }
  // —— 附记（不判红）：改前那一趟四季互相的距离（基线含四季时它量的是季节色罩）——
  {
    const 亮 = sg => (sg.mean[0] + sg.mean[1] + sg.mean[2]) / 3;
    const 比 = (前, s) => 亮(签名[`${前}${s}${'-2030'}-${vpName}`]) / 亮(签名[`${前}${s}-${vpName}`]);
    读数['20点半相对亮度_' + vpName] = { 本版: ['春', '夏', '秋', '冬'].map(s => +比('', s).toFixed(3)),
      改前: BEFORE ? ['春', '夏', '秋', '冬'].map(s => +比('改前-', s).toFixed(3)) : null };
  }
}
读数.对照 = 判.map(x => ({ 判据: x[0], 通过: x[1], 备注: x[2] }));
fs.writeFileSync(path.join(OUT, '读数.json'), JSON.stringify(读数, null, 2));
let 红 = 0;
for (const [名, ok, 备注] of 判) {
  console.log((ok ? ' ok : ' : ' FAIL: ') + 名 + (备注 ? ('（' + 备注 + '）') : ''));
  if (!ok) 红++;
}
console.log(红 ? ('✘ ' + 红 + ' 条判据不过') : '✔ 四季逐像素判据全过；图与读数在 ' + OUT);
process.exit(红 ? 1 : 0);
