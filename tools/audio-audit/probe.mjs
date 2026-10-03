// 第 124 单·提示音探针（真浏览器；只读诊断，进冒烟档 2）
// 第 136 单扩：加"环境音（雨声）"七个场景——默认关＋下雨不响／开了且下雨 ⇒ 起（createBufferSource +1）／
//   不重复起／再关 ⇒ 停（stop +1）／雨停自动停／切走标签页即静音／切回来续上。
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
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'audio-audit'));
fs.mkdirSync(OUT, { recursive: true });

const rawHtml = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state}};\n})();\n</script>');
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
  结果.开着响 = await 等回音(开前 + 1);
  结果.开着发送后计数 = await 计数();
  // ── 第 136 单·环境音（雨声）七场景 ──────────────────────────────────────
  const 读B = () => page.evaluate(() => window.__buf || 0);
  const 读S = () => page.evaluate(() => window.__bufStop || 0);
  const 设雨 = (on) => page.evaluate(v => { const w = window.__pv.state.world; w.weather.rain = v; if (v) w.weather.until = w.t + 99999; }, on);
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
} catch (e) { 错.push('driver: ' + String(e.message).slice(0, 140)); }
await ctx.close();
await browser.close();
srv.close();
结果.错误 = 错;
结果.结论 = (结果.关着不响 === true && 结果.开着响 === true && 错.length === 0 && 结果.关掉后按钮 === '关' && 结果.打开后按钮 === '开'
  && 结果.环境音默认按钮 === '关' && 结果.环境音开按钮 === '开' && 结果.环境音关按钮 === '关'
  && 结果.环境音_关着下雨不响 === true && 结果.环境音_开着响 === true && 结果.环境音_不重复起 === true
  && 结果.环境音_关了就停 === true && 结果.环境音_再开起声 === true && 结果.环境音_雨停自停 === true
  && 结果.环境音_切走静音 === true && 结果.环境音_切回续上 === true);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结果, null, 2), 'utf8');
console.log((结果.结论 ? '✔' : '✘') + ' 提示音探针：' + JSON.stringify(结果));
process.exit(结果.结论 ? 0 : 1);
