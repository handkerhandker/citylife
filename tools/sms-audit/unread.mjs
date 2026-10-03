// 第 129 单·短信页「分人未读」探针（真浏览器；只读诊断，进冒烟档 2）
//
// 判据（按顺序走一遍）：
//   ① 开局四个人的分人角标都是 0（旧档用全局水位兜底，不许炸出一排红点）；
//   ② 给顾云帆发一条 → 等这一轮 AI 兜底彻底落定（日志序号 2 秒不变＋无在途 AI）⇒ 他的角标非 0，其余三人 0；
//   ③ 点「沈小满」（她没新消息）⇒ 顾云帆的角标**不清**；
//   ④ 点「顾云帆」⇒ 他的角标清零，再等 1 秒**仍为 0**（没有迟到的条目把它顶回来）；
//   ⑤ 刷新页面（同一浏览器上下文）⇒ 角标仍是 0（分人水位随存档信封走）；全程零 pageerror。
// 用法：node tools/sms-audit/unread.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'sms-audit'));
fs.mkdirSync(OUT, { recursive: true });
const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18951;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const 读数 = p => p.evaluate(() => {
  const o = {};
  document.querySelectorAll('#ph-agents [data-to]').forEach(b => { o[b.dataset.to] = b.dataset.unread; });
  const dot = document.querySelector('#tab-dot');
  return { 分人: o, 总角标: dot ? (dot.hidden ? '0' : dot.textContent) : '—' };
});
const 等 = async (p, fn, 上限 = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < 上限) { if (await fn()) return true; await p.waitForTimeout(250); } return false; };
// 等"这一轮彻底落定"：日志序号连续 2 秒不变 且 没有在途 AI 任务（AI 兜底迟到会再顶一条「已读不回」）
const 等静默 = async (p, 上限 = 25000) => {
  const t0 = Date.now(); let 上次 = -1, 稳起 = 0;
  while (Date.now() - t0 < 上限) {
    const s = await p.evaluate(() => ({ lid: window.__pv.state.world.lidSeq, pending: window.__pv.state.llm.pending }));
    if (s.lid === 上次 && s.pending === 0) { if (!稳起) 稳起 = Date.now(); if (Date.now() - 稳起 >= 2000) return true; }
    else { 上次 = s.lid; 稳起 = 0; }
    await p.waitForTimeout(250);
  }
  return false;
};

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push('pageerror: ' + (e && e.message || e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const u = (m.location() && m.location().url) || '';
  if (/favicon|\/relay|net::ERR/.test(u) || /Failed to load resource|CORS|Failed to fetch|api\.anthropic/i.test(m.text())) return;
  错.push('console: ' + m.text().slice(0, 120));
});
const 断言 = [];
const 判 = (名, 好, 读数_) => { 断言.push({ 名, 好, 读数_ }); console.log((好 ? ' ok  ' : ' FAIL ') + 名 + '  ' + JSON.stringify(读数_)); };

await page.goto(URL_, { waitUntil: 'load' });
await page.waitForTimeout(800);
await page.click('button.tab[data-tab="phone"]');
await page.waitForTimeout(300);
let R = await 读数(page);
判('① 开局四个角标都是 0', Object.values(R.分人).every(v => v === '0'), R);
await page.waitForSelector('#ph-msgs button[data-msg]:not([disabled])', { timeout: 10000 }).catch(() => {});
await page.click('#ph-msgs button[data-msg]');
const 到货 = await 等(page, async () => (await 读数(page)).分人.a1 !== '0', 12000);
await 等静默(page);
R = await 读数(page);
判('② 发一条→顾云帆角标非 0、其余 0（等 AI 兜底落定后）',
  到货 && R.分人.a1 !== '0' && R.分人.a2 === '0' && R.分人.a3 === '0' && R.分人.a4 === '0', R);
const 甲 = R.分人.a1;
await page.click('#ph-agents [data-to="a2"]');
await page.waitForTimeout(300);
R = await 读数(page);
判('③ 点没消息的人⇒顾云帆角标不清', R.分人.a1 === 甲, R);
await page.click('#ph-agents [data-to="a1"]');
await page.waitForTimeout(300);
R = await 读数(page);
const 清了 = R.分人.a1 === '0';
await page.waitForTimeout(1200);
R = await 读数(page);
判('④ 点顾云帆⇒他的角标清零且 1.2 秒后仍为 0', 清了 && R.分人.a1 === '0', R);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(900);
await page.click('button.tab[data-tab="phone"]');
await page.waitForTimeout(400);
R = await 读数(page);
判('⑤ 刷新后仍是 0（分人水位随存档走）', R.分人.a1 === '0', R);
await ctx.close(); await browser.close(); srv.close();
const 红 = 断言.filter(x => !x.好).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ 断言, 错 }, null, 2), 'utf8');
console.log('分人未读探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报错 ' + 错.length + '；报表在 ' + OUT);
process.exit(红 || 错.length ? 1 : 0);
