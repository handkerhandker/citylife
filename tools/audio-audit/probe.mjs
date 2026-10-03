// 第 124 单·提示音探针（真浏览器；只读诊断，进冒烟档 2）
//
// 量什么：把 `AudioContext.prototype.createOscillator` 打上计数钩子，按真实操作走一遍——
//   ① 先解锁（点一下页面，满足自动播放策略）；② 把提示音**关**掉 → 发一条短信 → 等回音 →
//   计数不动；③ 再**开**回来 → 发一条 → 等回音 → 计数 +1。
// 判据：关着不响、开着要响、全程零 pageerror；报表落 `<输出目录>/report.json`。
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
const PORT = 18943;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(rawHtml); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
await ctx.addInitScript(() => {
  window.__osc = 0;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { window.__noWebAudio = true; return; }
  const 原 = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () { window.__osc = (window.__osc || 0) + 1; return 原.apply(this, arguments); };
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
} catch (e) { 错.push('driver: ' + String(e.message).slice(0, 140)); }
await ctx.close();
await browser.close();
srv.close();
结果.错误 = 错;
结果.结论 = (结果.关着不响 === true && 结果.开着响 === true && 错.length === 0 && 结果.关掉后按钮 === '关' && 结果.打开后按钮 === '开');
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结果, null, 2), 'utf8');
console.log((结果.结论 ? '✔' : '✘') + ' 提示音探针：' + JSON.stringify(结果));
process.exit(结果.结论 ? 0 : 1);
