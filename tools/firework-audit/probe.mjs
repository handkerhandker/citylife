// 江灯节烟花探针（真浏览器；只读诊断。第 148 单立，进冒烟档 2）
//
// 量什么：把画布相邻帧做**逐像素差分**（三通道差之和 > 6 记一个像素；阈值为什么是 6：
//   烟花的径向光晕是半透明渐变，帧间通道差多在 10–20 量级，用 24 会漏掉大部分烟花——
//   实测阈值 24 时带内只有 525 像素，阈值 6 才捞得全；canvas 重绘是确定性的，带内无噪声，
//   改前版同口径实测 34/0/0/0，不会把抗锯齿噪声误认成烟花）——先把人物停住
//   （`w.speed=0`），画布上"只该烟花在动"，于是差分把"烟花在放"与"没放"分开。
//   （亮像素计数不敏感：半透明光晕够不到阈值，改点表前后读数几乎不动——一过性校准实测过。）
//   四档场景（同镜头、人物静止；先给镜头 800ms 收敛）：
//     ① 节日夜（D45 19:30）差分应显著；
//     ② 普通夜（D46 19:30）／③ 节日白天（D45 12:30）／④ 节日夜 + reduceMotion ——
//        这三档不是 0：**人物 idle 精灵本身就有 6fps 帧动画**，实测底噪 828–843 像素/帧差；
//        烟花信号实测 16398，约为底噪的 20 倍，故判据用"倍数"而不是"绝对 0"。
//   判据（江面带内）：**"大差帧数"**——24 帧里单帧差分 ≥1500 的帧数，节日夜 ≥4 且其余三档 ≤1。
//   为什么用帧数而不是最大值：取证时发现画布存在一次"单帧脉冲"（页面重排引起的一次性重绘，
//   江面带 ~5858 像素、**只影响一帧**，改前版无烟花时也在）——按"最大值"判会把这一帧的脉冲
//   当成烟花；按"帧数"判，脉冲最多贡献 1，而真烟花实测 24 帧里 ≥1500 的有 7+ 帧（发与发之间
//   有 ~0.4s 空档，故不会 24 帧全中）。另存"最大差分帧"截图；零 pageerror。
// 用法：node tools/firework-audit/probe.mjs [输出目录]        （要 CITYLIFE_CHROME）
//   对照跑旧版：node tools/firework-audit/probe.mjs [输出目录] --改前=<git-ref>
//   （旧版没有烟花段 ⇒ 节日夜同样 ≈0 ⇒ 判红——证探针抓得住"没烟花"这一档）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'firework'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
fs.mkdirSync(OUT, { recursive: true });

const raw = BEFORE
  ? execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:city-life-framework.html`], { maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }

const PORT = 18948;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push('pageerror: ' + ((e && e.message) || e)));
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(2200);
if (process.env.FW_DEBUG) await page.evaluate(() => { window.__FWDEBUG = true; });

const 摆 = (t, 动效减) => page.evaluate(([t, rm]) => {
  const st = __pv.state, w = st.world;
  w.speed = 0;                       // 人物静止：差分里只剩画布动态
  w.t = t; w.weather.rain = false; st.llm.on = false;
  st.reduceMotion = !!rm;
  st.cam.manual = true; st.cam.fx = 24; st.cam.fy = 21;
  /* 选中者保持默认（a1）——不动它：`selected=null` 会让产品在一处读 anchor 时抛错
     （探针实测 pageerror），那不是产品支持的合法状态。为了不让选中者的气泡干扰差分，
     改用"选区"：只统计画布上世界 y≥22 的**江面带**。烟花全在江面（爆点 y25.2–25.9、
     花径 ≤2.4 格），气泡在住户所在画面中部（y<12）。另注：取证时发现选中者气泡自身
     有一个"周期性重绘"现象（人物静止、文案不变仍每 ~0.5s 亮 5000-7000 像素差分再恢复），
     与烟花无关，单独立项追查（见待办）；本探针只测烟花。 */
}, [t, 动效减]);

/* 等镜头/缩放收敛（view.ox／oy／s 连续两次读数不变才放行）——
   否则相机的指数缓动残留会把"全屏都在缓慢滑动"混进差分。第一版实测：没等收敛时
   节日夜读数 15678，其中几乎全是镜头残影（改前无烟花版同样 15678），烟花信号被淹没。
   阈值 0.02px 仍不够：亚像素残留在 dd>6 口径下还能贡献 ~5800 像素（改前版实测），
   故收紧到 0.002px——残差对应的每帧位移 <0.0003px，边缘像素变化 dd<1。
   第 148 单取证还发现：画布存在一次"单帧脉冲"（江面带 ~5858 像素、一帧即散；疑为布局
   微调引起的一次性整屏重绘）。取证结论：① 它不随"页面加载绝对时刻"走——等稳之后再停
   1 秒，它仍出现在采样第 2 帧；② 改前无烟花版也有它。故探针**不去踩死它**，改用
   "大差帧数"判据（见文件头）：脉冲最多贡献 1 帧，而真烟花实测 8 帧。等稳这里保留
   **布局盒尺寸**看门 + 1 秒保险（对"镜头/尺寸"本身的稳定性仍必要）。 */
const 等稳 = async () => {
  let 上 = null;
  for (let i = 0; i < 80; i++) {
    const v = await page.evaluate(() => {
      const box = document.querySelector('#live-wrap').getBoundingClientRect();
      const st = __pv.state;
      return [box.width, box.height, st.view.ox, st.view.oy, st.view.s];
    });
    if (上 && Math.abs(v[0] - 上[0]) < 0.5 && Math.abs(v[1] - 上[1]) < 0.5
      && Math.abs(v[2] - 上[2]) < 0.002 && Math.abs(v[3] - 上[3]) < 0.002 && v[4] === 上[4]) {
      await page.waitForTimeout(1000);   // 保险：把"页面加载后的一次性重排"让过去
      return;
    }
    上 = v; await page.waitForTimeout(100);
  }
};

// 连续 n 帧的逐像素差分，返回 {max, 序列}；存图=在该档最大差分帧上覆盖保存元素截图
const 差分 = async (n, 间隔, 存图) => {
  await page.evaluate(() => { window.__fw = { prev: null }; });
  // 江面带下界（画布行）：世界 y≥22 ⇒ 烟花全在带内、选中者气泡不在带内
  const y0 = await page.evaluate(() => {
    const st = __pv.state;
    return Math.max(0, Math.floor(st.view.oy + st.view.s * 22));
  });
  const 画布 = await page.evaluate(() => { const cv = document.querySelector('#cv'); return [cv.width, cv.height, __pv.state.view.s, __pv.state.view.oy]; });
  if (process.env.FW_DEBUG) console.log('[debug] y0=' + y0 + ' canvas=' + 画布.join(','));   // FW_DEBUG=1 时打印（平时静默）
  let max = 0;
  const 序列 = [];
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate((y0) => {
      const cv = document.querySelector('#cv'), g = cv.getContext('2d');
      const cur = g.getImageData(0, y0, cv.width, cv.height - y0).data;
      let diff = 0;
      const 行 = new Array(10).fill(0);
      const 带高 = (cv.height - y0) / 10, W = cv.width;
      const p = window.__fw.prev;
      if (p) for (let k = 0; k < cur.length; k += 4) {
        const dd = Math.abs(cur[k] - p[k]) + Math.abs(cur[k + 1] - p[k + 1]) + Math.abs(cur[k + 2] - p[k + 2]);
        if (dd > 6) { diff++; 行[Math.min(9, Math.floor((k / 4 / W) / 带高))]++; }
      }
      let 前 = null, 今 = null;
      if (window.__FWDEBUG && diff > 1000) {   // 一过性调试：把发生大差分的两帧都存出来
        const mk = (im) => { const t = document.createElement('canvas'); t.width = im.width; t.height = im.height; t.getContext('2d').putImageData(im, 0, 0); return t.toDataURL('image/png'); };
        今 = mk(new ImageData(new Uint8ClampedArray(cur), cv.width, cv.height - y0));
        if (p) 前 = mk(new ImageData(new Uint8ClampedArray(p), cv.width, cv.height - y0));
      }
      window.__fw.prev = cur;
      return { diff, 行, 前, 今 };
    }, y0);
    const c = r.diff;
    序列.push(c);
    if (process.env.FW_DEBUG) console.log('[debug] 逐帧: i=' + i + ' 带内差=' + c);
    if (r.今) {
      fs.writeFileSync(path.join(OUT, 'debug-前.png'), Buffer.from(r.前.split(',')[1], 'base64'));
      fs.writeFileSync(path.join(OUT, 'debug-今.png'), Buffer.from(r.今.split(',')[1], 'base64'));
    }
    if (process.env.FW_DEBUG && c > 1000) console.log('[debug] 行分布(带内10档):', r.行.join(','));
    if (c > max) {
      max = c;
      if (process.env.FW_DEBUG) console.log('[debug] frame ' + i + ' diff ' + c);
      if (存图) await page.locator('#cv').screenshot({ path: 存图 });
    }
    await page.waitForTimeout(间隔);
  }
  return { max, 序列 };
};

// 四档：摆好场景 → 等镜头收敛 → 24 帧 × 120ms（2.88s > 一个烟花周期 2.6s）
const 一档 = async (t, rm, 存图) => { await 摆(t, rm); await 等稳(); return 差分(24, 120, 存图); };
const 节 = await 一档(64530, false, path.join(OUT, '最大差分帧-节日夜.png'));
const 平 = await 一档(65970, false);
const 昼 = await 一档(64530 - 7 * 60, false);
const 减 = await 一档(64530, true);
await ctx.close(); await browser.close(); srv.close();

const 大差 = (r) => r.序列.filter(c => c >= 1500).length;   // "大差帧数"：≥1500 像素/帧的帧数
const 结论 = {
  节日夜: { 最大: 节.max, 大差帧数: 大差(节), 序列: 节.序列 },
  普通夜: { 最大: 平.max, 大差帧数: 大差(平), 序列: 平.序列 },
  节日白天: { 最大: 昼.max, 大差帧数: 大差(昼), 序列: 昼.序列 },
  动效减: { 最大: 减.max, 大差帧数: 大差(减), 序列: 减.序列 },
  错误: 错,
};
结论.通过 = (大差(节) >= 4 && 大差(平) <= 1 && 大差(昼) <= 1 && 大差(减) <= 1 && 错.length === 0);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
console.log((结论.通过 ? '✔' : '✘') + ' 江灯节烟花：' + JSON.stringify(结论));
process.exit(结论.通过 ? 0 : 1);
