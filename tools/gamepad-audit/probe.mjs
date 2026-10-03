// 第 147 单·手柄探针（真浏览器＋假手柄；只读诊断，进冒烟档 2）
//
// 背景：提示栏承诺「十字键/左摇杆 移焦点 · Ⓐ 确认 · Ⓑ 返回 · LB/RB 切页」——手柄一路从未测过。
// 本工具在页面里注入一个**可编程假手柄**（`navigator.getGamepads()` 返回它），走七条：
//   ① 十字键移焦点＋输入模式切到"手柄"（读提示栏文案）；② 左摇杆移焦点（轴 >0.45 触发）；
//   ③ Ⓐ 确认：环停在页签上 ⇒ 切页；④ Ⓑ 返回：设置页 ⇒ 现场页；⑤ LB/RB 切页（左右各一次往返）；
//   ⑥ **长按连发**：按住十字键 0.7 秒 ⇒ 焦点至少移动 2 次（首触＋连发）；⑦ 全程零 pageerror。
// 用法：node tools/gamepad-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'gamepad-audit'));
fs.mkdirSync(OUT, { recursive: true });
const rawHtml = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Focus(){return Focus}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18969;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => {
  const pad = {
    index: 0, id: 'fake-pad', connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    axes: [0, 0, 0, 0],
  };
  try { Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] }); }
  catch (_) { try { navigator.getGamepads = () => [pad]; } catch (_) {} }
  window.__pad = {
    按: (i, v) => { pad.buttons[i] = { pressed: !!v, value: v ? 1 : 0, touched: !!v }; },
    轴: (x, y) => { pad.axes[0] = x; pad.axes[1] = y; },
  };
});
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push(String(e && e.message || e)));
const 断言 = [];
const 判 = (n, ok, 读数_) => { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); };
const 环 = () => page.evaluate(() => {
  const el = document.querySelector('.vfocus');
  return el ? { id: el.id || '', tab: el.dataset ? (el.dataset.tab || '') : '', 文: (el.textContent || '').trim().slice(0, 10) } : null;
});
const 屏 = () => page.evaluate(() => ([...document.querySelectorAll('.screen')].find(x => x.classList.contains('active')) || {}).id || '');
const 提示 = () => page.evaluate(() => document.querySelector('#hint-text').textContent);
const 击键 = async (i, 毫秒 = 130) => { await page.evaluate(i => __pad.按(i, true), i); await page.waitForTimeout(毫秒); await page.evaluate(i => __pad.按(i, false), i); await page.waitForTimeout(140); };

await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(2200);
await page.evaluate(() => { const st = __pv.state; st.world.speed = 0; st.llm.on = false; });
await page.evaluate(() => __pv.Focus.focusEl(document.querySelector('button.tab[data-tab="live"]')));
await page.waitForTimeout(150);

// ① 十字键移焦点＋模式切换
{
  const 前 = await 环();
  await 击键(13);                       // 十字键下
  const 后 = await 环();
  const 文 = await 提示();
  判('① 十字键移焦点＋模式切到手柄（提示栏文案随之改）',
    !!后 && JSON.stringify(前) !== JSON.stringify(后) && /十字键\/左摇杆/.test(文),
    { 前, 后, 提示: (文 || '').trim().slice(0, 24) });
}

// ② 左摇杆移焦点（轴 >0.45）
{
  const 前 = await 环();
  await page.evaluate(() => __pad.轴(0.85, 0));
  await page.waitForTimeout(250);
  await page.evaluate(() => __pad.轴(0, 0));
  await page.waitForTimeout(150);
  const 后 = await 环();
  判('② 左摇杆移焦点（轴 >0.45 触发）', !!后 && JSON.stringify(前) !== JSON.stringify(后), { 前, 后 });
}

// ③ Ⓐ 确认：环停到页签 ⇒ 切页
{
  await page.evaluate(() => __pv.Focus.focusEl(document.querySelector('button.tab[data-tab="live"]')));
  await 击键(13);                        // 走到"角色"页签
  const 目标 = await 环();
  await 击键(0);                         // Ⓐ
  const 屏后 = await 屏();
  判('③ Ⓐ 确认：环停到页签上 ⇒ 切到对应页', 目标 && 目标.tab === 'roles' && 屏后 === 'scr-roles', { 目标, 屏后 });
}

// ④ Ⓑ 返回：设置页 ⇒ 现场页
{
  await page.click('button.tab[data-tab="settings"]');
  await page.waitForTimeout(250);
  const 前 = await 屏();
  await 击键(1);                         // Ⓑ
  const 后 = await 屏();
  判('④ Ⓑ 返回：设置页 ⇒ 现场页', 前 === 'scr-settings' && 后 === 'scr-live', { 前, 后 });
}

// ⑤ LB/RB 切页（各一次，往返）
{
  const 前 = await 屏();
  await 击键(5); const 后 = await 屏();
  await 击键(4); const 回 = await 屏();
  判('⑤ LB/RB 切页：RB 切走、LB 切回', 后 !== 前 && 回 === 前, { 前, 后, 回 });
}

// ⑥ 长按连发：按住十字键下 ~0.7 秒 ⇒ 焦点至少移动 2 次
{
  await page.evaluate(() => __pv.Focus.focusEl(document.querySelector('button.tab[data-tab="live"]')));
  const 见 = new Set();
  await page.evaluate(() => __pad.按(13, true));
  const t0 = Date.now();
  while (Date.now() - t0 < 700) { const c = await 环(); if (c) 见.add(JSON.stringify(c)); await page.waitForTimeout(60); }
  await page.evaluate(() => __pad.按(13, false));
  await page.waitForTimeout(150);
  判('⑥ 长按连发：按住十字键 0.7 秒 ⇒ 焦点至少移动 2 次', 见.size >= 2, { 走过: 见.size, 样本: [...见].slice(0, 4) });
}
判('⑦ 全程零 pageerror', 错.length === 0, { 错: 错.length });

await ctx.close(); await browser.close(); srv.close();
const 红 = 断言.filter(x => !x.ok).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ 断言, 页面错误: 错, 红, 通过: 红 === 0 && 错.length === 0 }, null, 2), 'utf8');
console.log('\n手柄探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit((红 || 错.length) ? 1 : 0);
