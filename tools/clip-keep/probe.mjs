// 第 236 单·剪辑收藏夹探针（真浏览器；只读诊断，进冒烟档 2）
//
// 口径：① 摆一张卡 ⇒ 剪辑页出现「★ 留着」；② 点它 ⇒ 收藏 +1、按钮变"已留着"、开关显示"看收藏（1）"；
//      ③ 切到收藏视图 ⇒ 那张卡在（含"当天的日志原文"）；④ 点「立即存档」后**重载页面** ⇒ 收藏还在
//      （走存档信封）；⑤ 再点一下取消 ⇒ 回空态；⑥ 全程零 pageerror。
// --改前=<git-ref>：对第 236 单之前的版本跑同一套（没有收藏开关）⇒ 点不出、判红。
// 用法：node tools/clip-keep/probe.mjs [输出目录] [--改前=<git-ref>]  （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'clip-keep'));
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},get PURE(){return PURE}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18985;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/blank') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end('<!doctype html><meta charset="utf-8"><title>blank</title>'); return; }
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const 判 = [];
const 记 = (过, 名) => 判.push({ 过, 名 });
const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 440, height: 744 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push(String(e && e.message || e)));
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(2200);

// 摆一张卡（内容照真实剪辑卡的形状）
await page.evaluate(() => {
  const w = __pv.state.world;
  w.speed = 0;
  w.clips.push({ d: 5, wd: 0, id: 'a1', name: '顾云帆', score: 2.5, base: 10, full: true,
    items: [{ id: 'sit_flat', k: 2.5, v: { from: '阳台', tx: '风把窗帘吹起来了。' } }],
    q: [{ t: 4 * 1440 + 10 * 60, name: '顾云帆', text: '今天下工回来，在阳台上站了很久。', thought: '', type: 'act' }],
    sc: { a1: 2.5, a2: 0.1, a3: 0.2, a4: 0.3 } });
});

const 有无开关 = await page.evaluate(() => !!document.querySelector('#clip-mode'));
if (!有无开关) {
  console.log(' FAIL 剪辑页没有收藏开关（第 236 单之前的版本即此形态）');
  await browser.close(); srv.close(); process.exit(1);
}
await page.click('#tabbar [data-tab="clip"]'); await page.waitForTimeout(300);
const 有星 = await page.evaluate(() => !!document.querySelector('#clip-list [data-keep]'));
记(有星, '剪辑页的卡上出现「★ 留着」按钮');
await page.screenshot({ path: path.join(OUT, '收藏-每日视图.png') });

await page.click('#clip-list [data-keep]'); await page.waitForTimeout(250);
const 甲 = await page.evaluate(() => ({
  n: __pv.state.keeps.length,
  按钮: (document.querySelector('#clip-list [data-keep]') || {}).textContent || '',
  开关: (document.querySelector('#clip-mode') || {}).textContent || '',
}));
记(甲.n === 1 && 甲.按钮.indexOf('已留着') >= 0 && 甲.开关.indexOf('看收藏（1）') >= 0,
   '点★＝收藏 +1、按钮变"已留着"、开关显示"看收藏（1）"（实测 ' + JSON.stringify(甲) + '）');

await page.click('#clip-mode'); await page.waitForTimeout(300);
const 集文 = await page.evaluate(() => {
  const el = document.querySelector('#clip-keeps');
  const 日 = document.querySelector('#clip-list');
  return { hidden: el.hidden, 文: el.textContent.replace(/\s+/g, ' ').trim(), 卡: el.querySelectorAll('.clip').length,
           日藏: getComputedStyle(日).display === 'none' };
});
记(!集文.hidden && 集文.卡 === 1 && 集文.文.indexOf('在阳台上站了很久') >= 0 && 集文.日藏,
   '切到收藏视图：那张卡在（带"当天的日志原文"），且每日列表被藏住（不叠两张）');
await page.screenshot({ path: path.join(OUT, '收藏-收藏视图.png') });

// 存一次档 → 重载 ⇒ 收藏还在（走信封）
await page.click('#tabbar [data-tab="settings"]'); await page.waitForTimeout(200);
await page.click('#sv-now'); await page.waitForTimeout(300);
await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2200);
await page.click('#tabbar [data-tab="clip"]'); await page.waitForTimeout(250);
const 重载后 = await page.evaluate(() => ({ n: (__pv.state.keeps || []).length, 开关: (document.querySelector('#clip-mode') || {}).textContent || '' }));
await page.click('#clip-mode'); await page.waitForTimeout(250);
const 重载卡 = await page.evaluate(() => document.querySelector('#clip-keeps').querySelectorAll('.clip').length);
记(重载后.n === 1 && 重载后.开关.indexOf('看收藏（1）') >= 0 && 重载卡 === 1,
   '存档→重载：收藏还在（信封带着走；收藏 ' + 重载后.n + ' 张）');

// ⑤ 存档码：导出 → 清档 → 导入 → 重载，收藏还在（这是升级/换机时走的那条路）
await page.click('#tabbar [data-tab="settings"]'); await page.waitForTimeout(200);
await page.click('#sv-export'); await page.waitForTimeout(300);
const 码 = await page.evaluate(() => (document.querySelector('#sv-export-code') || {}).value || '');
await page.click('#dialog-root [data-close]'); await page.waitForTimeout(150);
await page.goto(`http://127.0.0.1:${PORT}/blank`, { waitUntil: 'load' });          // 到空白页清档（免得游戏页的自动存档盖回来）
await page.evaluate(() => localStorage.removeItem('citylife-save-v1'));
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' }); await page.waitForTimeout(2000);
const 清后 = await page.evaluate(() => (window.__pv.state.keeps || []).length);
await page.click('#tabbar [data-tab="settings"]'); await page.waitForTimeout(200);
await page.click('#sv-import'); await page.waitForTimeout(200);
await page.fill('#sv-import-code', 码);
await page.click('#sv-import-go'); await page.waitForTimeout(2500);                  // 导入成功会自己 reload
const 导入后 = await page.evaluate(() => (window.__pv.state.keeps || []).length);
记(清后 === 0 && 码.length > 100 && 导入后 === 1,
   '存档码（导出→清档→导入）：收藏跟着走（清档后 ' + 清后 + ' 张 → 导入后 ' + 导入后 + ' 张）');

// ⑥ 取消收藏 ⇒ 回空态
await page.click('#tabbar [data-tab="clip"]'); await page.waitForTimeout(250);
await page.click('#clip-mode'); await page.waitForTimeout(250);
await page.click('#clip-keeps [data-keep]'); await page.waitForTimeout(250);
const 取消后 = await page.evaluate(() => ({
  n: __pv.state.keeps.length,
  空态: (document.querySelector('#clip-keeps').textContent || '').indexOf('收藏还是空的') >= 0,
  开关: (document.querySelector('#clip-mode') || {}).textContent || '',
}));
记(取消后.n === 0 && 取消后.空态 && 取消后.开关.indexOf('看每日') >= 0,
   '再点一下＝取消收藏，回到空态文案');

// ⑦ 坏档：收藏卡的结构被改坏（items:[null]／q:[null]）⇒ 启动不崩、收藏视图照常渲染（第 238 单·批后审计）
await page.click('#tabbar [data-tab="settings"]'); await page.waitForTimeout(200);
await page.click('#sv-now'); await page.waitForTimeout(300);
await page.goto(`http://127.0.0.1:${PORT}/blank`, { waitUntil: 'load' });
await page.evaluate(() => {
  const 档 = JSON.parse(localStorage.getItem('citylife-save-v1'));
  档.meta = 档.meta || {};
  档.meta.keeps = [{ d: 1, wd: 0, id: 'a1', name: '顾云帆', score: 2, base: 10, full: true,
                     items: [null], q: [null], sc: {} }];
  localStorage.setItem('citylife-save-v1', JSON.stringify(档));
});
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' }); await page.waitForTimeout(2000);
const 坏读 = await page.evaluate(() => ({ n: (window.__pv.state.keeps || []).length,
  items: ((window.__pv.state.keeps || [])[0] || {}).items.length }));
await page.click('#tabbar [data-tab="clip"]'); await page.waitForTimeout(300);
await page.click('#clip-mode'); await page.waitForTimeout(400);
const 坏卡 = await page.evaluate(() => document.querySelectorAll('#clip-keeps .clip').length);
记(坏读.n === 1 && 坏读.items === 0 && 坏卡 === 1 && 错.length === 0,
   '坏档（items:[null]／q:[null]）：逐项归一后照常渲染、不抛页错（实测 keeps=' + 坏读.n + '、items=' + 坏读.items + '、卡=' + 坏卡 + '）');

记(错.length === 0, '全程零 pageerror（实测 ' + 错.length + '）');
for (const x of 判) console.log((x.过 ? ' ok ' : ' FAIL') + ' ' + x.名);
const 过 = 判.every(x => x.过);
console.log('收藏夹探针：' + 判.filter(x => x.过).length + '/' + 判.length + (过 ? ' 全过' : ' **有 FAIL**') + '；报表与截图：' + OUT);
await browser.close(); srv.close();
process.exit(过 ? 0 : 1);
