// 第 133 单·file:// 直开探针（真浏览器；只读诊断，进冒烟档 2）
//
// 量什么：**用户实际的使用方式——双击 HTML 直接打开（file:// 协议）**。此前所有工具都走本地 http 服务，
// 这条路径从未端到端实测过。九条判据：
//   A 直开：① 零 pageerror；② 世界在推进（2 秒 ≥10 模拟分钟）；③ 像素素材加载＝已启用（apartment/characters.png）；
//          ④ 设置页构建版本行与源码 `id="set-build"` 逐字一致（用户自查版本读的就是它）
//   B 存档：① 立即存档后状态行＝已存（file:// 下 localStorage 可写）；② 重载后世界从保存时刻续跑、仍＝已存（读回成功）；
//          ③ 导出码以 `CLS1.` 开头
//   C 降级：① 发一条短信 ⇒ AI 被触发并结算（直连与中转两条通道都试过）、零 pageerror；
//          ② 「⚠ AI 连线失败」≤1 次、通道行＝未连接（file:// 无直连密钥、无同源 /relay——这是设计内形态，不刷屏不崩）
//
// 保真度说明：不改产品文件；只挂一个 fetch 记账钩子（只记 URL、不改行为）与一条直连拦截。
//   · 直连（api.anthropic.com）一律 route.abort——等价用户本机"被拦截/无 key"那一档，不真打扰外部 API；
//   · 中转（/relay）在 file:// 下天然不存在（fetch 解析为 file:///relay）；
//   · localStorage 用真实行为量（写→重载→读回），不读内部变量。
// 用法：node tools/fileopen-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'fileopen-audit'));
fs.mkdirSync(OUT, { recursive: true });

const HTML = path.join(REPO, 'city-life-framework.html');
const raw = fs.readFileSync(HTML, 'utf8');
const 源码版本 = ((raw.match(/id="set-build">([^<]*)</) || [])[1] || '').trim();

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
let 直连被拦 = 0;
await ctx.route('https://api.anthropic.com/**', r => { 直连被拦++; return r.abort(); });
await ctx.addInitScript(() => {
  const of = window.fetch.bind(window);
  window.__fetches = [];
  window.fetch = function (u) { try { window.__fetches.push(String(u)); } catch (_) {} return of.apply(this, arguments); };
});
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push('pageerror: ' + ((e && e.message) || e)));
const 断言 = [];
const 判 = (n, ok, 读数_) => { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); };
const 读 = sel => page.evaluate(s => { const el = document.querySelector(s); return el ? el.textContent : null; }, sel);
const 钟 = async () => {
  const day = await 读('#tb-day'), clk = await 读('#tb-clock');
  const md = /D(\d+)/.exec(day || ''), mc = /(\d+):(\d+)/.exec(clk || '');
  return { day, clock: clk, min: (md && mc) ? ((+md[1]) * 1440 + (+mc[1]) * 60 + (+mc[2])) : null };
};

// ── A 段：file:// 直开 ────────────────────────────────────────────────
await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
await page.waitForTimeout(1600);
const c1 = await 钟();
await page.waitForTimeout(2000);
const c2 = await 钟();
判('A① file:// 直开：零 pageerror', 错.length === 0, { 协议: await page.evaluate(() => location.protocol), 错: 错.length });
判('A② 世界在推进（2 秒 ≥10 模拟分钟）', c1.min !== null && c2.min !== null && (c2.min - c1.min) >= 10,
  { 前: c1.day + ' ' + c1.clock, 后: c2.day + ' ' + c2.clock });
await page.waitForFunction(() => { const el = document.querySelector('#set-pix-stat'); return el && el.textContent === '已启用'; }, null, { timeout: 8000 }).catch(() => {});
const pix = await 读('#set-pix-stat');
判('A③ 像素素材（apartment/characters.png）加载＝已启用', pix === '已启用', { 像素行: pix });
const ver = await 读('#set-build');
判('A④ 设置页版本行与源码逐字一致', !!ver && ver === 源码版本, { 界面: ver, 源码: 源码版本 });

// ── B 段：存档（真实写→重载→读回）──────────────────────────────────────
await page.click('button.tab[data-tab="settings"]').catch(() => {});
await page.waitForTimeout(250);
await page.click('#sv-now');
await page.waitForTimeout(350);
const stat1 = await 读('#sv-stat');
const cSave = await 钟();
判('B① 立即存档：状态行＝已存（file:// 下 localStorage 可写）', /已存/.test(stat1 || ''), { sv_stat: stat1 });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1600);
const stat2 = await 读('#sv-stat');
const c3 = await 钟();
判('B② 重载续档：世界从保存时刻续跑、仍＝已存', /已存/.test(stat2 || '') && cSave.min !== null && c3.min !== null && c3.min >= cSave.min - 1,
  { 存档前: cSave.day + ' ' + cSave.clock, 重载后: c3.day + ' ' + c3.clock, sv_stat: stat2 });
await page.click('button.tab[data-tab="settings"]').catch(() => {});
await page.waitForTimeout(250);
await page.click('#sv-export');
await page.waitForTimeout(300);
const code = await page.inputValue('#sv-export-code').catch(() => '');
判('B③ 导出可用：CLS1 码', typeof code === 'string' && code.startsWith('CLS1.') && code.length > 200, { 码长: code.length });
await page.click('#dialog-root [data-close]').catch(() => {});
await page.waitForTimeout(200);

// ── C 段：AI 降级（file:// 无直连密钥、无同源 /relay）────────────────────
await page.click('button.tab[data-tab="phone"]').catch(() => {});
await page.waitForSelector('#ph-msgs button[data-msg]:not([disabled])', { timeout: 8000 }).catch(() => {});
await page.click('#ph-msgs button[data-msg]').catch(() => {});
let stat = '', chip = '', 结算 = false;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(700);
  stat = (await 读('#set-llm-stat')) || '';
  chip = (await 读('#ph-llm')) || '';
  const m = /^(\d+) 次/.exec(stat);
  const calls = m ? +m[1] : 0;
  if (calls >= 1 && !stat.includes('进行中') && !stat.includes('思考中')) { 结算 = true; break; }
}
const fetches = await page.evaluate(() => window.__fetches || []);
const anthropic = fetches.filter(u => u.includes('api.anthropic.com')).length;
const relay = fetches.filter(u => u.includes('/relay')).length;
const 警告数 = (((await 读('#log-list')) || '').split('⚠ AI 连线失败').length) - 1;
const 通道 = await 读('#set-llm-channel');
判('C① 发短信 ⇒ AI 被触发并结算（两条通道都试过）＋零 pageerror',
  结算 && anthropic >= 1 && relay >= 1 && 错.length === 0,
  { 统计行: stat, 直连尝试: anthropic, 中转尝试: relay, 错误: 错.length });
判('C② 降级不刷屏：警告 ≤1 次、通道＝未连接', 警告数 <= 1 && 通道 === '未连接', { 警告数, 通道, ph芯片: chip });

await ctx.close(); await browser.close();
const 红 = 断言.filter(x => !x.ok).length;
const 结论 = {
  探针: 'file:// 直开（真实文件、真实协议）',
  file: pathToFileURL(HTML).href,
  直连被拦次数: 直连被拦,
  断言, 红, 通过: 红 === 0,
};
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
console.log('file:// 直开探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
