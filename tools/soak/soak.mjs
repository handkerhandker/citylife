// 第 41 单 · 满状态巡检 ＋ 浸泡（**只读诊断**：不改产品代码，不进 gate.yml）
//
// 补第 40 单登记的两条遗留：
//   ① **满状态排版**：第 40 单跑的是开城 D1（空状态），最容易崩的却是**满状态**——
//      长剪辑卡、几百条日志、多条短信往来。本工具先把世界推 30 天再逐页截图。
//   ② **浸泡**：第 40 单只做静态巡检；本工具让页面**持续跑**，每 20 秒采一次样，
//      看会不会慢性出问题（异常累积／内存爬升／DOM 节点数爬升／在途占位不收敛）。
//
// **浸泡刻意开着 AI**：本地没有中转函数，AI 每一跳都会失败——这恰好把**失败路径**
// （重试、占位符、兜底池、pen 排队）压上负载，而那正是第 29 单出过「占位符长挂」的地方。
// 日志墙上会留下若干条 ⚠ 连线失败，那是**预期**，不是缺陷。
//
// 用法：node tools/soak/soak.mjs <输出目录> [--天=30] [--分钟=5]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'docs/交付/第41单-图'));
const 天数 = Number((process.argv.find(a => a.startsWith('--天=')) || '--天=30').split('=')[1]);
const 分钟 = Number((process.argv.find(a => a.startsWith('--分钟=')) || '--分钟=5').split('=')[1]);
const PORT = 18941;
fs.mkdirSync(OUT, { recursive: true });

const rawHtml = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get pix(){return pix},get Sim(){return Sim},get SPOTS(){return STAND_SPOTS}};\n})();\n</script>');
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

const 页 = [['live', '现场'], ['roles', '角色'], ['log', '日志'], ['clip', '剪辑'], ['phone', '短信'], ['settings', '设置']];
const settle = ms => new Promise(r => setTimeout(r, ms));
const 读数 = { 满状态: [], 浸泡: [], 报错: [], 参数: { 天数, 分钟 } };

const 推演 = (page, d) => page.evaluate((D) => {
  const st = __pv.state, w = st.world;
  w.speed = 0;
  for (let i = 0; i < D * 144; i++) __pv.Sim.step(w, 10);
  return { t: w.t, 日志: w.log.length, 剪辑: (w.clips || []).length };
}, d);

const 采样 = page => page.evaluate(() => {
  const st = __pv.state, w = st.world;
  return {
    模拟时刻: w.t, 天数: Math.floor(w.t / 1440) + 1,
    日志条数: w.log.length,
    在途占位: w.log.filter(e => e.llmPending).length,
    剪辑条数: (w.clips || []).length,
    AI调用: st.llm.calls, AI在途: st.llm.pending, AI状态: String(st.llm.status || ''),
    DOM节点: document.getElementsByTagName('*').length,
    堆MB: (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1),
  };
});

// ── ① 满状态：推 30 天，逐页 × 两档截图 ──────────────────────────────────
for (const [vpName, vp] of [['桌面', { width: 1400, height: 900 }], ['手机', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const 本页报错 = [];
  page.on('pageerror', e => 本页报错.push('pageerror: ' + (e && e.message || e)));
  await page.goto(URL_); await settle(2600);
  await page.evaluate(() => { __pv.state.llm.on = false; });
  const 推 = await 推演(page, 天数);
  console.log('推演到 ' + 推.t + ' 分钟（D' + (Math.floor(推.t / 1440) + 1) + '），日志 ' + 推.日志 + ' 条，剪辑 ' + 推.剪辑 + ' 条');
  for (const [id, 名] of 页) {
    await page.click('[data-tab="' + id + '"]').catch(() => {});
    await settle(500);
    await page.screenshot({ path: path.join(OUT, '满状态-' + 名 + '-' + vpName + '.png') });
  }
  读数.满状态.push({ 视口: vpName, 推演到: 推, 报错: 本页报错 });
  if (本页报错.length) 读数.报错.push(...本页报错.map(e => vpName + ' ' + e));
  await ctx.close();
}

// ── ② 浸泡：AI 开着（每跳必失败）＋ 8× 速度，持续跑，每 20 秒采一次 ────────
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const 本页报错 = [];
  page.on('pageerror', e => 本页报错.push('pageerror: ' + (e && e.message || e)));
  page.on('response', r => {
    const u = r.url();
    if (r.status() >= 400 && !u.endsWith('/relay') && !u.endsWith('/favicon.ico')) 本页报错.push('HTTP ' + r.status() + ' ' + u);
  });
  await page.goto(URL_); await settle(2600);
  await page.evaluate(() => { __pv.state.llm.on = true; });    // **刻意开着**：把失败路径压上负载
  await page.evaluate(() => { __pv.state.world.speed = 8; });   // 8×：墙上的字飞快滚
  const 轮 = 分钟 * 3;
  for (let i = 0; i <= 轮; i++) {
    const s = await 采样(page);
    读数.浸泡.push({ 轮: i, 秒: i * 20, ...s });
    if (i % 3 === 0) console.log('t+' + (i * 20) + 's  D' + s.天数 + ' 日志' + s.日志条数 + ' 在途' + s.在途占位
      + ' 剪辑' + s.剪辑条数 + ' AI' + s.AI调用 + '(在途' + s.AI在途 + ') DOM' + s.DOM节点 + ' 堆' + s.堆MB + 'MB');
    await settle(20000);
  }
  await page.screenshot({ path: path.join(OUT, '浸泡结束-现场.png') });
  await page.click('[data-tab="log"]').catch(() => {}); await settle(600);
  await page.screenshot({ path: path.join(OUT, '浸泡结束-日志.png') });
  读数.报错.push(...本页报错.map(e => '浸泡 ' + e));
  await ctx.close();
}

fs.writeFileSync(path.join(OUT, '读数.json'), JSON.stringify(读数, null, 2), 'utf8');
await browser.close(); srv.close();

const 泡 = 读数.浸泡;
const 未捕获 = 读数.报错.filter(e => /pageerror/.test(e));
const 首 = 泡[0], 末 = 泡[泡.length - 1];
/* 量尺（本单第一版栽在这里，故写进注释）：**别拿「还没长起来」跟「长满以后」比。**
   第一版把 t+0（日志才 3 条、DOM 336 个节点）当作基线，去跟 t+240（日志满 400 条、DOM 1557）
   比「DOM 有没有爬升」——必然判红，可那是**日志墙按设计填满**，不是泄漏。
   同理「在途占位」：它数的是 `w.log` 里 `llmPending` 的条目（已在墙上排队等待的占位符），
   **不是网络并发数**——在途 1~5 条是正常排队，`PEN_TTL_MS=20000` 到点就收。
   现在的口径：① 从「日志墙填满」那一拍起算；② 在途看**是否收尾归零**与**峰值是否在排队上限内**。 */
const 满墙 = 泡.findIndex(s => s.日志条数 >= 400);
const 中后 = 泡.slice(满墙 >= 0 ? 满墙 : Math.floor(泡.length / 2));
const 在途峰 = Math.max(...中后.map(s => s.在途占位));
const 日志峰 = Math.max(...泡.map(s => s.日志条数));
const 剪辑峰 = Math.max(...泡.map(s => s.剪辑条数));
const 结论 = [];
结论.push(['未捕获异常', 未捕获.length ? (未捕获.length + ' 条 ✗') : '0 条 ✓']);
结论.push(['日志条数不越 400（环形缓冲）', (日志峰 <= 400 ? ('峰值 ' + 日志峰 + ' ✓') : ('峰值 ' + 日志峰 + ' ✗'))]);
结论.push(['剪辑条数不越 60', (剪辑峰 <= 60 ? ('峰值 ' + 剪辑峰 + ' ✓') : ('峰值 ' + 剪辑峰 + ' ✗'))]);
结论.push(['在途占位是排队不是泄漏', (在途峰 <= 8 && 末.在途占位 === 0 ? ('峰值 ' + 在途峰 + '，收尾 0 ✓') : ('峰值 ' + 在途峰 + '，收尾 ' + 末.在途占位 + ' ✗'))]);
结论.push(['AI 在途数收尾为 0', (末.AI在途 === 0 ? '0 ✓' : (末.AI在途 + ' ✗'))]);
结论.push(['DOM 节点数不爬升（从墙填满那拍起算）', (末.DOM节点 <= 中后[0].DOM节点 * 1.2 ? (中后[0].DOM节点 + ' → ' + 末.DOM节点 + ' ✓') : (中后[0].DOM节点 + ' → ' + 末.DOM节点 + ' ✗'))]);
结论.push(['堆内存不爬升', (首.堆MB < 0 ? '（本机取不到 performance.memory）' : (首.堆MB + ' → ' + 末.堆MB + 'MB ' + (末.堆MB <= 首.堆MB * 1.5 + 20 ? '✓' : '✗')))]);
结论.push(['世界照常前进', (末.模拟时刻 > 首.模拟时刻 ? ('D' + 首.天数 + ' → D' + 末.天数 + '，AI 调用 ' + 首.AI调用 + ' → ' + 末.AI调用 + ' 次 ✓') : '世界没动 ✗')]);
console.log('\n═══ 浸泡判据 ═══');
for (const [名, 值] of 结论) console.log('　' + 名 + '：' + 值);
const 红 = 结论.filter(x => /✗/.test(x[1])).length;
console.log('\n' + (红 ? (红 + ' 项判红') : '浸泡全绿') + '；出图在 ' + OUT);
process.exit(红 ? 1 : 0);
