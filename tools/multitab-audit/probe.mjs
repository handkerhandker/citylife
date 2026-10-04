// 第 135 单·双开（两个标签页）危害取证（真浏览器；只读诊断，进冒烟档 2）
//
// 现场：双击两次 / 旧标签页没关 ⇒ 同一浏览器里两页同玩，同一 localStorage 键（citylife-save-v1）。
// 两页各自每 15 秒自动存档，发信 / 切走 / 关页也各存各的 ⇒ **谁的档后写谁赢**。本工具取证：
//
// A 段·危害（任何版本都能跑）：
//   ① 双开共存：两页都开得起来、零 pageerror；
//   ② 两页都在写同一个存档键（每页挂 Storage 钩子，各记 ≥1 笔）；
//   ③ 覆盖现场（确定性三步）：A 页发一条短信（存档 credits=2）→ B 页「立即存档」（credits=3，
//      **A 的动作在存档里消失**）→ A 再存（credits=2 翻回来）——存档依次 2→3→2；
//   ④ 丢动作实证：在 ③b 那一刻新开第三页 ⇒ 界面余额＝3 ≠ A 的 2（重开后 A 发过的短信没了）；
//   ⑤ 自动档（无手动操作）下继续互相覆盖：约 60 秒逐秒采样，credits 取值集合应含 {2,3}。
//
// B 段·「双开提示」验收（仅当页面已含 multi-hint 代码时跑；未实现则跳过并注明）：
//   ⑥ 单开不误报：独立浏览器里单页 ≈12 秒无 #multi-hint；
//   ⑦ 双开要报：同浏览器开第二页 ⇒ 两页都出现 #multi-hint；
//   ⑧ 关掉第二页后：第一页的提示 ≤20 秒自动收起（心跳过期）。
//
// 用法：node tools/multitab-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'multitab-audit'));
fs.mkdirSync(OUT, { recursive: true });

const HTML = path.join(REPO, 'city-life-framework.html');
const 支持提示 = /id=["']multi-hint["']/.test(fs.readFileSync(HTML, 'utf8'));
const URL_ = pathToFileURL(HTML).href;

const exe = process.env.CITYLIFE_CHROME || undefined;
const browser = await chromium.launch({ executablePath: exe });
const 断言 = [];
const 读数集 = [];
const 判 = (n, ok, 读数_) => { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); };
const 读数 = (n, v) => { 读数集.push({ n, v }); console.log(' 读数 ' + n + '  ' + JSON.stringify(v)); };
const 错 = [];
const openTab = async (ctx, 名) => {
  const p = await ctx.newPage();
  p.on('pageerror', e => 错.push(名 + ': ' + ((e && e.message) || e)));
  await p.goto(URL_, { waitUntil: 'load' });
  await p.waitForTimeout(1600);
  return p;
};
const 读存 = p => p.evaluate(() => {
  try {
    const s = localStorage.getItem('citylife-save-v1');
    if (!s) return null;
    const o = JSON.parse(s);
    return { credits: (o && o.world) ? o.world.credits : null, t: (o && o.world) ? o.world.t : null, at: (o && o.meta) ? o.meta.at : null };
  } catch (_) { return null; }
});
const 读写 = p => p.evaluate(() => (window.__saveWrites || []).slice());
const 读msgn = p => p.evaluate(() => { const el = document.querySelector('#tb-msgn'); return el ? el.textContent : null; });
const 有无提示 = p => p.evaluate(() => !!document.getElementById('multi-hint'));
const HOOK = () => {
  try {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      try {
        if (String(k) === 'citylife-save-v1') {
          window.__saveWrites = window.__saveWrites || [];
          let credits = null, t = null;
          try { const o = JSON.parse(String(v)); credits = o && o.world ? o.world.credits : null; t = o && o.world ? o.world.t : null; } catch (_) {}
          window.__saveWrites.push({ at: Date.now(), credits, t });
        }
      } catch (_) {}
      return orig.apply(this, arguments);
    };
  } catch (_) {}
};

// ── A 段：危害取证 ─────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.addInitScript(HOOK);
  const A = await openTab(ctx, 'A');
  const B = await openTab(ctx, 'B');
  判('A① 双开共存：两页都开得起来、零 pageerror', 错.length === 0,
    { A余额: await 读msgn(A), B余额: await 读msgn(B), 错误: 错.length });
  // ② 两页各存一笔（同一键）
  await A.bringToFront(); await A.click('button.tab[data-tab="settings"]'); await A.click('#sv-now'); await A.waitForTimeout(400);
  await B.bringToFront(); await B.click('button.tab[data-tab="settings"]'); await B.click('#sv-now'); await B.waitForTimeout(400);
  const wA = await 读写(A), wB = await 读写(B);
  判('A② 两页都在写同一个存档键（各 ≥1 笔）', wA.length >= 1 && wB.length >= 1,
    { A写笔数: wA.length, B写笔数: wB.length, 末笔: { A: wA[wA.length - 1], B: wB[wB.length - 1] } });
  // ③a A 发一条短信（发信本身会立刻存档）
  await A.bringToFront();
  await A.click('button.tab[data-tab="phone"]').catch(() => {});
  await A.waitForSelector('#ph-msgs button[data-msg]:not([disabled])', { timeout: 8000 }).catch(() => {});
  await A.click('#ph-msgs button[data-msg]').catch(() => {});
  await A.waitForTimeout(800);
  const s2 = await 读存(A);
  // ③b B 立即存档（把 A 的动作从存档里覆盖掉）
  await B.bringToFront();
  await B.click('button.tab[data-tab="settings"]').catch(() => {});
  await B.click('#sv-now'); await B.waitForTimeout(500);
  const s3 = await 读存(A);
  // ④ 在"credits=3"那一刻新开第三页：界面余额应为 3（A 的动作没了）
  const C = await openTab(ctx, 'C');
  const cMsgn = await 读msgn(C);
  await C.close();
  // ③c A 再存：翻回来
  await A.bringToFront();
  await A.click('button.tab[data-tab="settings"]').catch(() => {});
  await A.click('#sv-now'); await A.waitForTimeout(500);
  const s4 = await 读存(A);
  判('A③ 覆盖现场：存档依次 2→3→2（B 把 A 的动作覆盖、又翻回来）',
    !!s2 && !!s3 && !!s4 && s2.credits === 2 && s3.credits === 3 && s4.credits === 2,
    { A发信后存档: s2, B存后存档: s3, A再存后存档: s4 });
  判('A④ 丢动作实证：此刻重开新页余额＝3（A 发过的短信没了）', String(cMsgn) === '3',
    { 新页余额: cMsgn, A页余额: await 读msgn(A) });
  // ⑤ 自动档窗：不再手动操作，两页各自的 15 秒自动存档继续互相覆盖
  const 见 = new Set(); const t0 = Date.now();
  while (Date.now() - t0 < 60000 && 见.size < 2) {
    const s = await 读存(A); if (s) 见.add(s.credits);
    await A.waitForTimeout(1000);
  }
  const 见集 = [...见].sort();
  判('A⑤ 自动档（无手动操作）下仍在互相覆盖：60 秒内 credits 取值含 {2,3}',
    (见集.indexOf(2) >= 0 && 见集.indexOf(3) >= 0), { 取值集合: 见集, 窗口秒: Math.round((Date.now() - t0) / 1000) });
  读数('全程写笔数', { A: (await 读写(A)).length, B: (await 读写(B)).length });
  await ctx.close();
}

// ── B 段：双开提示验收（页面未含该代码时跳过）──────────────────────────
if (!支持提示) {
  console.log('\n-- B 段跳过：当前页面尚无 multi-hint（本次只跑危害取证）--');
} else {
  const browser2 = await chromium.launch({ executablePath: exe });   // 独立浏览器：保证 localStorage 不串
  const ctx2 = await browser2.newContext({ viewport: { width: 1200, height: 800 } });
  const P1 = await openTab(ctx2, 'P1');
  await P1.waitForTimeout(12000);                       // 跨过多个心跳周期
  const h1 = await 有无提示(P1);
  判('B⑥ 单开不误报：单页 12 秒无提示', h1 === false, { 提示: h1 });
  const P2 = await openTab(ctx2, 'P2');
  const 等提示 = async p => { try { await p.waitForFunction(() => !!document.getElementById('multi-hint'), null, { timeout: 9000 }); return true; } catch (_) { return false; } };
  const hA = await 等提示(P1), hB = await 等提示(P2);
  判('B⑦ 双开要报：两页都出现 #multi-hint', hA && hB, { P1: hA, P2: hB });
  await P2.close();
  let 收 = false;
  for (let i = 0; i < 20; i++) { await P1.waitForTimeout(1000); if ((await 有无提示(P1)) === false) { 收 = true; break; } }
  判('B⑧ 关掉第二页后：第一页提示 ≤20 秒自动收起', 收, { 收起: 收 });
  /* 第 185 单·把最坏样本补进门禁：**刷新**不是双开。
     病根（本单实测）：页标识原先每次加载都新生成 ⇒ 刷新后旧心跳被当成"另一页"，
     连带旧页收尾那笔存档也会触发"存档键"提示——刷新必弹一次冤枉提示。
     治法：标识改存 sessionStorage（同标签页刷新不变）＋存档提示只认"本页开钟之后"的笔。 */
  await P1.reload({ waitUntil: 'load' });
  let 刷新误报 = false;
  for (let i = 0; i < 12; i++) { await P1.waitForTimeout(1000); if (await 有无提示(P1)) { 刷新误报 = true; break; } }
  判('B⑨ 刷新不误报：同一页刷新后 12 秒内不得出现 #multi-hint', !刷新误报, { 刷新误报 });
  /* 复制标签页会把 sessionStorage 一起抄过去（同 id）——心跳那条认不出它，
     由"存档键"那条兜底：它一存（每 15 秒一次）就该报。 */
  const 同id = await P1.evaluate(() => { try { return sessionStorage.getItem('citylife-tab-id') || ''; } catch (_) { return ''; } });
  const P3 = await ctx2.newPage();
  P3.on('pageerror', e => 错.push('P3: ' + ((e && e.message) || e)));
  await P3.addInitScript(id => { try { sessionStorage.setItem('citylife-tab-id', id); } catch (_) {} }, 同id);
  await P3.goto(URL_, { waitUntil: 'load' });
  let 复制报 = false;
  for (let i = 0; i < 25; i++) { await P3.waitForTimeout(1000); if (await 有无提示(P3)) { 复制报 = true; break; } }
  判('B⑩ 复制标签页（同 id）也要报：靠"存档键"那条兜底 ≤25 秒', 复制报, { 同id: !!同id, 复制报 });
  await P3.close();
  await ctx2.close(); await browser2.close();
}

await browser.close();
const 红 = 断言.filter(x => !x.ok).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ 支持提示, 断言, 读数: 读数集, 错误: 错, 红, 通过: 红 === 0 }, null, 2), 'utf8');
console.log('\n双开探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
