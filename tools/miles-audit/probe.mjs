// 第 131 单·云港手账探针（真浏览器；只读诊断，进冒烟档 2）
//
// 判据：① 开局手账卡在（10 条、0/10）；② 发一条短信 →（等回音落定）小账 sms≥1、replies≥1，
// 卡上也勾上那两条；③ 刷新 → 小账不重不漏（值与刷新前一致，**不翻倍**）；全程零 pageerror。
// 用法：node tools/miles-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'miles-audit'));
fs.mkdirSync(OUT, { recursive: true });
const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18953;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const 读数 = p => p.evaluate(() => ({
  小账: JSON.parse(JSON.stringify(window.__pv.state.miles)),
  枚数: (document.querySelectorAll('#mile-list li') || []).length,
  计数: (document.querySelector('#mile-count') || {}).textContent || '',
  勾: [...document.querySelectorAll('#mile-list li')].filter(li => li.textContent.trim().startsWith('✓')).length,
}));
const 等 = async (p, fn, 上限 = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < 上限) { if (await fn()) return true; await p.waitForTimeout(300); } return false; };

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
await page.click('button.tab[data-tab="roles"]');
await page.waitForTimeout(400);
let R = await 读数(page);
判('① 开局：手账卡 10 条、计数 0/10、小账清零',
  R.枚数 === 10 && R.计数 === '0/10' && R.小账.sms === 0 && R.小账.replies === 0, R);
await page.click('button.tab[data-tab="phone"]');
await page.waitForSelector('#ph-msgs button[data-msg]:not([disabled])', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(200);
await page.click('#ph-msgs button[data-msg]');
const 到了 = await 等(page, async () => {
  const x = await page.evaluate(() => window.__pv.state.miles);
  return x.sms >= 1 && x.replies >= 1;
}, 25000);
await page.click('button.tab[data-tab="roles"]');
await page.waitForTimeout(400);
R = await 读数(page);
判('② 发一条并等到回音：小账 sms≥1、replies≥1，卡上勾 ≥2',
  到了 && R.小账.sms >= 1 && R.小账.replies >= 1 && R.勾 >= 2, R);
const 刷新前 = { sms: R.小账.sms, replies: R.小账.replies };
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(900);
R = await 读数(page);
判('③ 刷新：小账不重不漏（与刷新前一致、不翻倍）',
  R.小账.sms === 刷新前.sms && R.小账.replies === 刷新前.replies, { 刷新前, 刷新后: R.小账 });
await ctx.close(); await browser.close(); srv.close();
const 红 = 断言.filter(x => !x.好).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ 断言, 错 }, null, 2), 'utf8');
console.log('云港手账探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报错 ' + 错.length + '；报表在 ' + OUT);
process.exit(红 || 错.length ? 1 : 0);
