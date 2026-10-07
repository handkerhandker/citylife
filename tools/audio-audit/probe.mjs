// 第 124 单·提示音探针（真浏览器；只读诊断，进冒烟档 2）
// 第 136 单扩：加"环境音（雨声）"七个场景——默认关＋下雨不响／开了且下雨 ⇒ 起（createBufferSource +1）／
//   不重复起／再关 ⇒ 停（stop +1）／雨停自动停／切走标签页即静音／切回来续上。
// 第 252 单扩：加"雷声"五景——雷雨闪刻 ⇒ createBufferSource +1（雷声）／同一个闪桶不重复／
//   换一个闪桶再响／普通雨（非雷雨）不响／关掉环境音不响。--改前=<git-ref> 可对旧版跑同一套
//   （旧版没有雷雨概念 ⇒ 雷声那五条判红，证明判据不是恒绿）。
//
// 量什么：把 `AudioContext.prototype.createOscillator`（提示音）与 `createBufferSource`／
//   `AudioBufferSourceNode.prototype.stop`（环境音）打上计数钩子，按真实操作走一遍——
//   ① 先解锁（点一下页面，满足自动播放策略）；② 把提示音**关**掉 → 发一条短信 → 等回音 →
//   计数不动；③ 再**开**回来 → 发一条 → 等回音 → 计数 +1；④ 环境音七场景（见上）。
// 判据：关着不响、开着要响、环境音七条全对、全程零 pageerror；报表落 `<输出目录>/report.json`。
// 用法：node tools/audio-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'audio-audit'));
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';

const rawHtml = BEFORE
  ? execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:city-life-framework.html`], { maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},'
  +'get 雷雨场(){try{return (typeof 雷雨场===\'function\')?雷雨场:null}catch(e){return null}},'
  +'get 雷雨闪档(){try{return (typeof 雷雨闪档===\'function\')?雷雨闪档:null}catch(e){return null}}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18943;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
await ctx.addInitScript(() => {
  window.__osc = 0;
  window.__buf = 0;
  window.__bufStop = 0;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { window.__noWebAudio = true; return; }
  const 原 = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () { window.__osc = (window.__osc || 0) + 1; return 原.apply(this, arguments); };
  const 原B = AC.prototype.createBufferSource;
  AC.prototype.createBufferSource = function () { window.__buf = (window.__buf || 0) + 1; return 原B.apply(this, arguments); };
  if (window.AudioBufferSourceNode) {
    const 原S = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function () { window.__bufStop = (window.__bufStop || 0) + 1; return 原S.apply(this, arguments); };
  }
});
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push('pageerror: ' + (e && e.message || e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const u = (m.location() && m.location().url) || '';
  if (/favicon|\/relay|net::ERR/.test(u) || /Failed to load resource|CORS|Failed to fetch|api\.anthropic/i.test(m.text())) return;
  错.push('console: ' + m.text().slice(0, 120));
});
const 计数 = () => page.evaluate(() => window.__osc || 0);
const 等回音 = async (目标, 上限毫秒 = 9000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < 上限毫秒) {
    if ((await 计数()) >= 目标) return true;
    await page.waitForTimeout(250);
  }
  return false;
};
const 结果 = {};
try {
  await page.goto(URL_, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(600);
  await page.click('button.tab[data-tab="live"]').catch(() => {});        // ① 解锁（用户手势）
  await page.waitForTimeout(300);
  结果.解锁后计数 = await 计数();
  await page.click('button.tab[data-tab="phone"]').catch(() => {});       // 进短信页（水位对齐）
  await page.waitForTimeout(200);
  // ② 关掉提示音 → 发一条 → 等回音 → 计数应不动
  await page.click('button.tab[data-tab="settings"]').catch(() => {});
  await page.waitForTimeout(150);
  await page.click('#set-sound').catch(() => {});
  结果.关掉后按钮 = await page.textContent('#set-sound').catch(() => '');
  await page.click('button.tab[data-tab="phone"]').catch(() => {});
  await page.waitForTimeout(150);
  const 关前 = await 计数();
  await page.click('#ph-msgs button[data-msg]').catch(() => {});
  await page.waitForTimeout(9000);
  结果.关着发送后计数 = await 计数();
  结果.关着不响 = (结果.关着发送后计数 === 关前);
  // ③ 开回来 → 发一条 → 计数应 +1
  await page.click('button.tab[data-tab="settings"]').catch(() => {});
  await page.waitForTimeout(150);
  await page.click('#set-sound').catch(() => {});
  结果.打开后按钮 = await page.textContent('#set-sound').catch(() => '');
  await page.click('button.tab[data-tab="phone"]').catch(() => {});
  await page.waitForTimeout(4150);                                        // 越过 4 秒限频窗
  const 开前 = await 计数();
  await page.click('#ph-msgs button[data-msg]').catch(() => {});
  /* ★第 296 单冒烟偶发实录：那次 `开着响` 判红，而单跑三遍全过——根因是**负载下 rAF 变慢、
     世界推进跟着慢**，回音在 9 秒窗口里还没到（提示音本身是即时响的）。治法照 285 单
     "等条件不等钟"的精神：**条件判据不动、把等待上限放宽**（9s → 25s），别把偶发当红。 */
  结果.开着响 = await 等回音(开前 + 1, 25000);
  结果.开着发送后计数 = await 计数();
  // ── 第 136 单·环境音（雨声）七场景 ──────────────────────────────────────
  const 读B = () => page.evaluate(() => window.__buf || 0);
  const 读S = () => page.evaluate(() => window.__bufStop || 0);
  const 设雨 = (on) => page.evaluate(v => {
    const w = window.__pv.state.world; w.weather.rain = v;
    if (v) {
      w.weather.until = w.t + 99999;
      /* 第 252 单起：这一块验的是**雨声**——显式挑一场普通雨，免得雷雨的雷声把 createBufferSource 计数搅进来
         （若那一场被判成雷雨，就往上抬到第一场普通雨为止）。旧版没有 雷雨场 ⇒ 跳过。 */
      let f = null; try { f = __pv.雷雨场; } catch (e) {}
      if (f) { let k = 0; while (f({ weather: { rain: true, until: w.weather.until } }) && k < 200) { w.weather.until++; k++; } }
    }
  }, on);
  await page.click('button.tab[data-tab="settings"]').catch(() => {});
  await page.waitForTimeout(200);
  结果.环境音默认按钮 = await page.textContent('#set-amb').catch(() => '');
  // ① 默认关＋下雨 ⇒ 不响
  await 设雨(true); await page.waitForTimeout(1500);
  const b0 = await 读B();
  结果.环境音_关着下雨不响 = (b0 === 0);
  // ② 开了（正下雨）⇒ 起雨声 ＋1
  await page.click('#set-amb').catch(() => {});
  await page.waitForTimeout(400);
  结果.环境音开按钮 = await page.textContent('#set-amb').catch(() => '');
  const b1 = await 读B();
  结果.环境音_开着响 = (b1 === b0 + 1);
  // ③ 再等 3 秒：不重复起（循环一个就够）
  await page.waitForTimeout(3000);
  const b2 = await 读B();
  结果.环境音_不重复起 = (b2 === b1);
  // ④ 再关 ⇒ 停（stop 被调用）
  const s1 = await 读S();
  await page.click('#set-amb').catch(() => {});
  await page.waitForTimeout(400);
  结果.环境音关按钮 = await page.textContent('#set-amb').catch(() => '');
  const s2 = await 读S();
  结果.环境音_关了就停 = (s2 === s1 + 1);
  // ⑤ 开回来 → 雨停 ⇒ 自动停（stop +1）
  await page.click('#set-amb').catch(() => {});
  await page.waitForTimeout(600);
  const b3 = await 读B();
  结果.环境音_再开起声 = (b3 === b2 + 1);
  const s3 = await 读S();
  await 设雨(false); await page.waitForTimeout(1300);
  const s4 = await 读S();
  结果.环境音_雨停自停 = (s4 === s3 + 1);
  // ⑥⑦ 切走静音 / 切回续上（下雨且开着）
  await 设雨(true); await page.waitForTimeout(900);
  const b4 = await 读B();
  const s5 = await 读S();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300);
  const s6 = await 读S();
  结果.环境音_切走静音 = (s6 === s5 + 1);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(500);
  const b5 = await 读B();
  结果.环境音_切回续上 = (b5 === b4 + 1);
  // ── 第 252 单·雷声五景（createBufferSource 计数即"起了一记雷"）────────────────
  await page.evaluate(() => { window.__pv.state.world.speed = 0; });   // 冻结时钟：雷声由下面"拨钟"精确触发，不让自然流逝的闪桶先响掉
  const 备雷雨 = () => page.evaluate(() => {
    const st = window.__pv.state, w = st.world;
    const f = __pv.雷雨场, 档 = __pv.雷雨闪档;
    if (!f || !档) { w.weather.rain = true; w.weather.until = w.t + 99999; return { 真u: -1, 闪刻: 720, 不闪刻: 600 }; }  // 旧版：没有雷雨
    let u = -1; for (let k = 100000; k < 101000; k++) { if (f({ weather: { rain: true, until: k } })) { u = k; break; } }
    w.weather.rain = true; w.weather.until = u;
    let 闪 = 710, 不闪 = 600;
    for (let t = 600; t < 1200; t += 0.25) { w.t = t; if (档(w) > 0) { 闪 = t; break; } }
    for (let t = 600; t < 1200; t += 0.25) { w.t = t; if (档(w) <= 0) { 不闪 = t; break; } }
    return { 真u: u, 闪刻: 闪, 不闪刻: 不闪 };
  });
  const 雷雨参数 = await 备雷雨();
  结果.雷声_参数 = 雷雨参数;
  if ((await page.textContent('#set-amb').catch(() => '')).trim() !== '开') { await page.click('#set-amb').catch(() => {}); await page.waitForTimeout(800); }
  const 计B = () => page.evaluate(() => window.__buf || 0);
  const 拨钟 = t => page.evaluate(t => { window.__pv.state.world.t = t; }, t);
  await 拨钟(雷雨参数.不闪刻); await page.waitForTimeout(900);
  const g0 = await 计B();
  await 拨钟(雷雨参数.闪刻); await page.waitForTimeout(900);
  const g1 = await 计B();
  结果.雷声_闪刻响 = (g1 === g0 + 1);
  await page.waitForTimeout(1500);
  const g2 = await 计B();
  结果.雷声_同桶不重复 = (g2 === g1);
  const 下一闪 = await page.evaluate(t => {
    const w = window.__pv.state.world, f = __pv.雷雨闪档;
    if (!f) return -1;
    for (let k = t + 10; k < t + 600; k += 0.25) { w.t = k; if (f(w) > 0) return k; }
    return -1;
  }, 雷雨参数.闪刻);
  结果.雷声_下一闪刻 = 下一闪;
  await 拨钟(下一闪 > 0 ? 下一闪 : 雷雨参数.闪刻 + 10); await page.waitForTimeout(900);
  const g3 = await 计B();
  结果.雷声_换桶再响 = (g3 === g2 + 1);
  await page.evaluate(() => { window.__pv.state.world.weather.until = 100001; });   // 普通雨（非雷雨）
  await page.waitForTimeout(700);
  const g4 = await 计B();
  结果.雷声_普通雨不响 = (g4 === g3);
  await page.click('#set-amb').catch(() => {});                                     // 关掉环境音
  await page.waitForTimeout(700);
  await page.evaluate(u => { window.__pv.state.world.weather.until = u; }, 雷雨参数.真u > 0 ? 雷雨参数.真u : 100000);
  await 拨钟(雷雨参数.闪刻);
  await page.waitForTimeout(900);
  const g5 = await 计B();
  结果.雷声_关环境音不响 = (g5 === g4);
  await page.evaluate(() => { window.__pv.state.world.speed = 1; });   // 收尾：把速度还原
} catch (e) { 错.push('driver: ' + String(e.message).slice(0, 140)); }
await ctx.close();
await browser.close();
srv.close();
结果.错误 = 错;
结果.结论 = (结果.关着不响 === true && 结果.开着响 === true && 错.length === 0 && 结果.关掉后按钮 === '关' && 结果.打开后按钮 === '开'
  && 结果.环境音默认按钮 === '关' && 结果.环境音开按钮 === '开' && 结果.环境音关按钮 === '关'
  && 结果.环境音_关着下雨不响 === true && 结果.环境音_开着响 === true && 结果.环境音_不重复起 === true
  && 结果.环境音_关了就停 === true && 结果.环境音_再开起声 === true && 结果.环境音_雨停自停 === true
  && 结果.环境音_切走静音 === true && 结果.环境音_切回续上 === true
  && 结果.雷声_闪刻响 === true && 结果.雷声_同桶不重复 === true && 结果.雷声_换桶再响 === true
  && 结果.雷声_普通雨不响 === true && 结果.雷声_关环境音不响 === true);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结果, null, 2), 'utf8');
console.log((结果.结论 ? '✔' : '✘') + ' 提示音探针：' + JSON.stringify(结果));
process.exit(结果.结论 ? 0 : 1);
