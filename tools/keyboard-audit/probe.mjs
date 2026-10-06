// 第 146 单·键盘导航探针（真浏览器；只读诊断，进冒烟档 2）
//
// 背景：提示栏明写「方向键/WASD 移焦点 · Enter 确认 · Esc 返回 · Q/E 切页」——这套自绘焦点环
// （`.vfocus` class，非真 DOM 焦点）此前只在无头侧验过寻焦打分（空间寻焦），**真浏览器全流程没测过**。
// 七条判据：
//   ① 首键出环：按一下方向键 ⇒ `.vfocus` 出现；② 连续右移 ⇒ 至少走过 3 个不同控件；
//   ③ Enter＝确认：用方向键把环停到任一页签 ⇒ Enter ⇒ 屏幕切到该页签对应的 page；
//   ④ Q/E 切页：e ⇒ 屏幕变；q ⇒ 切回来；⑤ Esc 两级返回：设置页 Esc ⇒ 回现场页；
//   ⑥ 弹窗 Esc：点小人弹卡（环随 Refresh 移入弹窗）⇒ Esc ⇒ 卡关闭、环回到页面控件；
//   ⑦ 输入框不劫持方向键：聚焦 textarea 后按方向键 ⇒ 环不移动、焦点仍在输入框；⑧ 全程零 pageerror。
// 用法：node tools/keyboard-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'keyboard-audit'));
fs.mkdirSync(OUT, { recursive: true });
const rawHtml = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get sx(){return sx},get sy(){return sy},get Focus(){return Focus}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18971;   // 第 270 单批后自查：原 18967 与 cat-audit/probe.mjs 撞车 ⇒ 改号
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const 错 = [];
page.on('pageerror', e => 错.push(String(e && e.message || e)));
const 断言 = [];
const 判 = (n, ok, 读数_) => { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); };
const 环 = () => page.evaluate(() => {
  const el = document.querySelector('.vfocus');
  return el ? { id: el.id || '', tab: el.dataset ? (el.dataset.tab || '') : '', 文: (el.textContent || '').trim().slice(0, 10) } : null;
});
const 屏 = () => page.evaluate(() => ([...document.querySelectorAll('.screen')].find(x => x.classList.contains('active')) || {}).id || '');
const 按 = async (k, 次 = 1) => { for (let i = 0; i < 次; i++) { await page.keyboard.press(k); await page.waitForTimeout(120); } };

await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(2200);
await page.evaluate(() => { const st = __pv.state; st.world.speed = 0; st.llm.on = false; });

// ① 首键出环＋② 连续右移走过 ≥3 个不同控件
{
  await 按('ArrowRight');
  const 一 = await 环();
  const 见 = new Set();
  for (let i = 0; i < 8; i++) { await 按('ArrowRight'); const c = await 环(); if (c) 见.add(c.id + '|' + c.tab + '|' + c.文); }
  判('① 首键出环：按一下方向键 ⇒ .vfocus 出现', !!一, 一);
  判('② 连续右移：至少走过 3 个不同控件', 见.size >= 3, { 去过: 见.size, 样本: [...见].slice(0, 5) });
}

// ③ Enter＝确认：把环停到任一页签 ⇒ Enter ⇒ 屏幕切到对应页
{
  /* 起点钉在"现场"页签上：展开档的页签是**左侧竖排**，沿 ArrowDown 依次走 rail（现场→角色→…）。
     （探针第一版按"底部横排"猜、左右交替打转——那是探针自己的错，不是产品的。） */
  await page.evaluate(() => __pv.Focus.focusEl(document.querySelector('button.tab[data-tab="live"]')));
  let 目标 = null;
  for (let i = 0; i < 8 && !目标; i++) {
    const c = await 环();
    if (c && c.tab && c.tab !== 'live') { 目标 = c; break; }
    await 按('ArrowDown');
  }
  let 屏后 = '';
  if (目标) { await page.keyboard.press('Enter'); await page.waitForTimeout(300); 屏后 = await 屏(); }
  判('③ Enter＝确认：环停在页签上 ⇒ Enter ⇒ 切到对应页', 目标 && 屏后 === 'scr-' + 目标.tab, { 环: 目标, 屏后 });
}

// ④ Q/E 切页
{
  const 前 = await 屏();
  await 按('e'); const 后 = await 屏();
  await 按('q'); const 回 = await 屏();
  判('④ Q/E 切页：e 切走、q 切回', 后 !== 前 && 回 === 前, { 前, 后, 回 });
}

// ⑤ Esc 两级返回：设置页 Esc ⇒ 回现场页
{
  await page.click('button.tab[data-tab="settings"]');
  await page.waitForTimeout(250);
  const 前 = await 屏();
  await 按('Escape');
  const 后 = await 屏();
  判('⑤ Esc 返回：设置页 ⇒ 现场页', 前 === 'scr-settings' && 后 === 'scr-live', { 前, 后 });
}

// ⑥ 弹窗 Esc：点小人弹卡（环应移入弹窗）⇒ Esc ⇒ 卡关、环回页面
{
  const 点 = await page.evaluate(() => {
    const st = __pv.state, v = st.vis.a1;
    st.vis.a1.x = st.vis.a1.dspX = 8; st.vis.a1.y = st.vis.a1.dspY = 18;   // 摆到街上，确保可见可点
    st.cam.manual = true; st.cam.fx = 8; st.cam.fy = 18;
    return null;
  });
  await page.waitForTimeout(250);
  const 坐 = await page.evaluate(() => { const v = __pv.state.vis.a1, r = document.querySelector('#cv').getBoundingClientRect(); return [r.x + __pv.sx(v.dspX), r.y + __pv.sy(v.dspY) - 6]; });
  await page.mouse.click(坐[0], 坐[1]);
  await page.waitForTimeout(300);
  const 开 = await page.evaluate(() => document.querySelector('#dialog-root').classList.contains('open'));
  const 环在弹窗 = await page.evaluate(() => { const c = document.querySelector('.vfocus'); return !!(c && c.closest('#dialog-root')); });
  await 按('Escape');
  const 关 = await page.evaluate(() => !document.querySelector('#dialog-root').classList.contains('open'));
  const 环回页 = await page.evaluate(() => { const c = document.querySelector('.vfocus'); return !!(c && !c.closest('#dialog-root')); });
  判('⑥ 弹窗 Esc：点小人弹卡（环移入弹窗）⇒ Esc ⇒ 卡关闭、环回页面控件', 开 && 环在弹窗 && 关 && 环回页, { 开, 环在弹窗, 关, 环回页 });
}

// ⑦ 输入框不劫持方向键：聚焦 textarea（导出码框）⇒ 按方向键 ⇒ 环不动、焦点仍在输入框
{
  await page.click('button.tab[data-tab="settings"]'); await page.waitForTimeout(250);
  await page.click('#sv-export'); await page.waitForTimeout(250);
  await page.click('#sv-export-code'); await page.waitForTimeout(150);
  const 环前 = await 环();
  await 按('ArrowRight', 2);
  const 环后 = await 环();
  const 焦点在输入框 = await page.evaluate(() => document.activeElement && document.activeElement.tagName === 'TEXTAREA');
  判('⑦ 输入框不劫持方向键：textarea 聚焦时按键 ⇒ 环不动、焦点仍在输入框',
    焦点在输入框 && JSON.stringify(环前) === JSON.stringify(环后), { 环前, 环后, 焦点在输入框 });
}
判('⑧ 全程零 pageerror', 错.length === 0, { 错: 错.length });

await browser.close(); srv.close();
const 红 = 断言.filter(x => !x.ok).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ 断言, 页面错误: 错, 红, 通过: 红 === 0 && 错.length === 0 }, null, 2), 'utf8');
console.log('\n键盘导航探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit((红 || 错.length) ? 1 : 0);
