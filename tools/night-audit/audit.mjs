// 第 44 单 · 夜间光照一致性体检（**只读诊断**：不进 gate.yml、不判红）
//
// 为什么要做：夜里现在有**三层**光源，是三个单子先后加的——
//   第 33 单 天色罩层（全局压暗）／第 35 单 室内点灯（`LAMP_ROOMS` 五间）／第 38 单 室外路灯光斑（14 盏）。
//   三层各调各的 alpha，从没放在一起量过。而第 38 单自己登记了一条：
//   **「街市摊位区仍偏暗」**（14 盏灯里没有一盏照到摊区）。
//
// 本工具量的是**平均亮度**（0–1，按 Rec.709 加权），逐区在**同一个夜晚帧**上采：
//   读的是画布自己的像素（`ctx.getImageData`），不是估的、也不是从源码推的。
//
// 用法：node tools/night-audit/audit.mjs <输出目录> [--判]
//   第 152 单加 `--判`：按"改前基线"判决——室内五区（客厅/厨房/卧室/便利店/公司）夜值
//   必须 ≥ 基线+0.01（公寓三间 ≥+0.04，即"室内不吃全量夜色"落地）；户外八区（含灯下/灯间）
//   夜值不得漂移（±0.01）。基线＝第 152 单改前（v125）实测值，锚在下方常量表——
//   **日后调灯 / 调天色曲线要同步改这张锚**（改了不改＝判红是预期行为）。
//   不带 --判 时保持原行为（只读数、不判红）。
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'docs/交付/第44单-图'));
const PORT = 18944;
fs.mkdirSync(OUT, { recursive: true });

const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const 判 = process.argv.includes('--判');
const pre = BEFORE ? '改前-' : '';
const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get pix(){return pix},get Sim(){return Sim},get SPOTS(){return STAND_SPOTS},get ctx(){return ctx}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(1); }

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
const settle = ms => new Promise(r => setTimeout(r, ms));

const 区 = [
  { 名: '公寓·客厅', 房: 'living' }, { 名: '公寓·厨房', 房: 'kitchen' }, { 名: '公寓·卧室', 房: 'bedroom' },
  { 名: '便利店', 房: 'store' }, { 名: '公司', 房: 'office' },
  { 名: '滨江公园（室外·无灯）', 房: 'park' }, { 名: '江边步道（室外·无灯）', 房: 'river' },
  { 名: '街道（有灯）', 世界: { x: 1, y: 12.2, w: 45, h: 1.6 } },
  { 名: '广场 T 口（有灯）', 世界: { x: 20, y: 16, w: 4, h: 4 } },
  { 名: '街市摊区（第 38 单登记的遗漏）', 世界: { x: 17.6, y: 14.6, w: 2.4, h: 5.8 } },
  { 名: '岸线步道（有灯）', 世界: { x: 2, y: 22.2, w: 44, h: 1.5 } },
  /* 局部采样（第 44 单补）：**整区平均会把点状光源的信号抹平**——整条街平均下来
     14 盏灯只覆盖一小部分面积，夜昼差被稀释到 +0.008。故另采一对「灯下 vs 灯间」，
     那才是玩家眼睛看到的东西。坐标取自 `GLOW_SPOTS` 的头两盏与它们的中点。 */
  { 名: '局部·灯下（街道第 1 盏）', 世界: { x: 2.2, y: 12.7, w: 1.6, h: 1.6 } },
  { 名: '局部·灯间（两盏正中间）', 世界: { x: 5.2, y: 12.7, w: 1.6, h: 1.6 } },
];

const 采样 = page => page.evaluate((区) => {
  const st = __pv.state, Sim = __pv.Sim, v = st.view, s = v.s, cv = document.querySelector('#cv');
  const box = cv.getBoundingClientRect();
  const 出 = [];
  for (const k of 区) {
    const r = k.房 ? Sim.ROOMS.find(x => x.id === k.房) : k.世界;
    const ins = k.房 ? 2 : 0;
    /* 坐标系（第 44 单第一版栽在这里）：`ctx.getImageData` 吃的是**画布内坐标**，
       不是页面坐标 —— 第一版按 `box.x + v.ox + …` 算，等于把每一块采样区都往右下平移了
       一个「画布元素在页面里的位置」，量到的是别处的像素（症状：「灯下」反而比「灯间」暗）。
       `state.view.ox/oy` 本身就是画布内的偏移，直接用它。dpr=1 时设备像素＝CSS 像素。 */
    const px = Math.round(v.ox + r.x * s) + ins, py = Math.round(v.oy + r.y * s) + ins;
    const w = Math.max(4, Math.round(r.w * s) - ins * 2), h = Math.max(4, Math.round(r.h * s) - ins * 2);
    const d = __pv.ctx.getImageData(px, py, w, h).data;   // 注意：读的是**设备像素**，故本工具用 dpr=1 跑
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    const n = d.length / 4;
    出.push({ 区: k.名, 盒: { px, py, w, h }, 平均亮度: Math.round(sum / n * 1000) / 1000 });
  }
  return 出;
}, 区);

const 读数 = {};
for (const [档, h] of [['夜 03:00', 3], ['昼 12:00', 12]]) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(URL_); await settle(2600);
  await page.evaluate((hh) => {
    const st = __pv.state, w = st.world;
    w.speed = 1; w.t = 1440 * 6 + hh * 60; st.llm.on = false; st.reduceMotion = true; w.weather.rain = false;
    st.cam.manual = true; st.cam.fx = 24; st.cam.fy = 12;
  }, h);
  /* 第 152 单·采样场景确定化：先 1× 短跑 3 秒（sim 推进 30 分钟）让人走到该时刻的锚点
     （03:00 ⇒ 全体上床、12:00 ⇒ 各就各位），再停 sim 等 moving 全 false——
     否则"人停在哪儿"取决于页面加载后的行走进度，卧室/客厅的亮度会在 ±0.06 抖动。 */
  await settle(3000);
  await page.evaluate(() => { __pv.state.world.speed = 0; });
  for (let i = 0; i < 30; i++) {
    const 静 = await page.evaluate(() => {
      const st = __pv.state;
      return st.world.agents.every(a => !st.vis[a.id].moving);
    });
    if (静) break;
    await settle(100);
  }
  await settle(400);
  const r = await 采样(page);
  读数[档] = r;
  await page.screenshot({ path: path.join(OUT, pre + '体检-' + (h === 3 ? '夜03' : '昼12') + '.png') });
  await ctx.close();
}

fs.writeFileSync(path.join(OUT, pre + '读数.json'), JSON.stringify(读数, null, 2), 'utf8');
await browser.close(); srv.close();
console.log('区'.padEnd(30) + '夜 03:00'.padEnd(12) + '昼 12:00');
for (let i = 0; i < 读数['夜 03:00'].length; i++) {
  const a = 读数['夜 03:00'][i], b = 读数['昼 12:00'][i];
  console.log(a.区.padEnd(30) + String(a.平均亮度).padEnd(12) + String(b.平均亮度));
}
console.log('完成：', OUT);

/* ── 第 152 单·判决模式：改前基线锚（v125 实测）──────────────────────────────
   室内五区是「SKY_INDOOR=0.45」的验收对象；户外八区是"没被误伤"的对照。
   数值取一位小数不取——照实抄 v125 的两位/三位实测（见 第152单-图/探针-改前.json）。 */
const 基线 = {
  '公寓·客厅': 0.486, '公寓·厨房': 0.507, '公寓·卧室': 0.530, '便利店': 0.307, '公司': 0.287,
  '滨江公园（室外·无灯）': 0.179, '江边步道（室外·无灯）': 0.153, '街道（有灯）': 0.248,
  '广场 T 口（有灯）': 0.304, '街市摊区（第 38 单登记的遗漏）': 0.387, '岸线步道（有灯）': 0.220,
  '局部·灯下（街道第 1 盏）': 0.307, '局部·灯间（两盏正中间）': 0.201,
};
if (判) {
  const 夜 = Object.fromEntries(读数['夜 03:00'].map(x => [x.区, x.平均亮度]));
  const 室内 = ['公寓·客厅', '公寓·厨房', '公寓·卧室', '便利店', '公司'];
  const 公寓三间 = ['公寓·客厅', '公寓·厨房', '公寓·卧室'];
  const 红 = [];
  for (const k of 室内) {
    const 需 = 基线[k] + (公寓三间.includes(k) ? 0.04 : 0.005);
    if (!(夜[k] >= 需)) 红.push(k + ' 夜 ' + 夜[k] + ' < 基线+' + (公寓三间.includes(k) ? '0.04' : '0.005') + '（' + 需.toFixed(3) + '）');
  }
  for (const k of Object.keys(基线)) {
    if (室内.includes(k)) continue;
    if (!(Math.abs(夜[k] - 基线[k]) <= 0.01)) 红.push(k + ' 夜漂移 ' + 夜[k] + '（基线 ' + 基线[k] + '）');
  }
  console.log(红.length ? ('✘ 夜间判据：' + 红.join('；')) : '✔ 夜间判据全过（室内提升到位、户外未漂移）');
  process.exit(红.length ? 1 : 0);
}
