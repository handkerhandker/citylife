// 第 132 单·存档两条用户路径探针（真浏览器；只读诊断，进冒烟档 2）
//
// A 段·导出/导入往返：
//   ① 导出拿到 `CLS1.` 码（够长）；② 之后改世界（发一条短信 ⇒ 额度 −1、多一条 out 日志）；
//   ③ 把刚导出的码导回去 ⇒ 页面重载，世界回到导出那一刻（额度／日志／时间都对得上）；
//   ④ 再试一串坏码 ⇒ 只出「这串码读不出来」、**不重载、不崩**。
// B 段·离线补算＋回城弹窗：
//   ① 先立即存档，把存档信封的 `at` 改成"两天前"再刷新 ⇒ 城市自己补过两天（t 前进 ≈2 天）；
//   ② **补算期间零 AI**：**load 一回来**读 `state.llm.calls === 0`（补算窗口＝boot 里那一段；
//      第 166 单·口径修：原来算到"开机后 1.5 秒"，正常玩起来的第一笔 AI 调用会被误算成补算期调用）、
//      `llm.on` 仍为真、日志里没有那条"已就地关闭本局 AI"；
//   ③ 回城弹窗当场弹出（含"你不在的时候"），关得掉。
// 用法：node tools/save-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'save-audit'));
fs.mkdirSync(OUT, { recursive: true });
const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18954;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  // 同源空白页：B 段在这里改存档信封（此时游戏页已卸载，pagehide 自动存档已经写完，不会再覆盖修改）
  if (u === '/blank.html') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end('<!doctype html><meta charset="utf-8"><title>blank</title>'); return; }
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const 断言 = [];
const 判 = (名, 好, 读数_) => { 断言.push({ 名, 好, 读数_ }); console.log((好 ? ' ok  ' : ' FAIL ') + 名 + '  ' + JSON.stringify(读数_)); };
const 世界读数 = p => p.evaluate(() => {
  const w = window.__pv.state.world;
  return { t: w.t, lidSeq: w.lidSeq, credits: w.credits, out数: (w.log || []).filter(e => e.sms === 'out').length };
});

// ── A 段：导出 / 导入往返 ──────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await ctx.newPage();
  const 错 = [];
  page.on('pageerror', e => 错.push('pageerror: ' + (e && e.message || e)));
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.click('button.tab[data-tab="settings"]').catch(() => {});
  await page.waitForTimeout(200);
  await page.click('#sv-export');
  await page.waitForTimeout(300);
  const 码 = await page.inputValue('#sv-export-code').catch(() => '');
  const 导出时 = await 世界读数(page);
  await page.click('[data-close]').catch(() => {});
  await page.waitForTimeout(200);
  判('A① 导出拿到 CLS1 码', 码.startsWith('CLS1.') && 码.length > 200 && 导出时.credits === 3, { 码长: 码.length, 导出时 });
  // 改世界：发一条短信（额度 −1、多一条 out）
  await page.click('button.tab[data-tab="phone"]').catch(() => {});
  await page.waitForSelector('#ph-msgs button[data-msg]:not([disabled])', { timeout: 10000 }).catch(() => {});
  await page.click('#ph-msgs button[data-msg]');
  await page.waitForTimeout(1500);
  const 改后 = await 世界读数(page);
  // 导回去
  await page.click('button.tab[data-tab="settings"]').catch(() => {});
  await page.waitForTimeout(200);
  await page.click('#sv-import');
  await page.waitForTimeout(200);
  await page.fill('#sv-import-code', 码);
  await page.click('#sv-import-go');
  await page.waitForTimeout(1600);   // 300ms 后 reload + 载入
  const 导回后 = await 世界读数(page);
  判('A② 改世界后导回：额度与 out 条数回到导出那一刻', 改后.credits === 2 && 改后.out数 === 导出时.out数 + 1
     && 导回后.credits === 导出时.credits && 导回后.out数 === 导出时.out数
     && 导回后.t >= 导出时.t && 导回后.t - 导出时.t < 1440, { 导出时, 改后, 导回后 });
  // 坏码：只出提示、不重载、不崩
  await page.evaluate(() => { window.__mark = 1; });
  // 上一段"导回"会整页重载 ⇒ 设置面板被关掉；先重开设置页，否则点不到隐藏的 #sv-import（探针自修，2026-10-04）
  await page.click('button.tab[data-tab="settings"]').catch(() => {});
  await page.waitForTimeout(200);
  await page.click('#sv-import');
  await page.waitForTimeout(200);
  await page.fill('#sv-import-code', 'CLS1.这不是合法的存档码');
  await page.click('#sv-import-go');
  await page.waitForTimeout(1200);
  const 坏码 = await page.evaluate(() => ({ msg: (document.querySelector('#sv-import-msg') || {}).textContent || '', mark: window.__mark === 1 }));
  判('A③ 坏码：只提示、不重载、不崩', 坏码.mark && 坏码.msg.indexOf('读不出来') >= 0 && 错.length === 0, { ...坏码, 错: 错.length });
  await ctx.close();
}

// ── B 段：离线补算 ＋ 回城弹窗 ＋ 零 AI ────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await ctx.newPage();
  const 错 = [];
  page.on('pageerror', e => 错.push('pageerror: ' + (e && e.message || e)));
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.click('button.tab[data-tab="settings"]').catch(() => {});
  await page.waitForTimeout(200);
  await page.click('#sv-now');                       // 先立即存档
  await page.waitForTimeout(300);
  const 离开前 = await 世界读数(page);
  /* 关键走位（探针自修，2026-10-04）：游戏的 pagehide 会把"此刻"重新写进信封，
     直接在游戏页里改 at 再 reload ⇒ 修改立刻被 pagehide 覆盖（实测：补算不触发，差=10 分钟）。
     忠实做法＝先离开游戏页（＝关页，pagehide 此刻存的是"刚离开"的档），再到同源空白页把
     at 改成两天前，然后进游戏——boot 读到的就是"两天前的存档信封"。 */
  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: 'load' });
  const 改档 = await page.evaluate(() => {
    const s = localStorage.getItem('citylife-save-v1');
    if (!s) return '无存档';
    const o = JSON.parse(s);
    o.meta.at = Date.now() - 2 * 24 * 3600 * 1000;   // 把"上次存档时刻"改成两天前
    localStorage.setItem('citylife-save-v1', JSON.stringify(o));
    return 'ok';
  });
  await page.goto(URL_, { waitUntil: 'load' });
  /* 第 166 单·口径修：**补算窗口只到"开机那一刻"**——catch-up 在 boot 里同步跑完，
     load 一回来先读一次 calls（补算后即刻）；原写法把"开机后 1.5 秒"也算进窗口，
     正常玩起来后的第一笔 AI 调用会被算成"补算期调用"（全量冒烟实测 calls=1 的假红）。 */
  const 补算后 = await page.evaluate(() => ({ calls: window.__pv.state.llm.calls }));
  await page.waitForTimeout(1500);                   // 等 UI（弹窗/日志）起来再读其余项
  const 回来 = await page.evaluate(() => {
    const S = window.__pv.state, w = S.world;
    return {
      t: w.t, calls: S.llm.calls, on: S.llm.on,
      关了AI: (w.log || []).some(e => String(e.text || '').indexOf('已就地关闭本局 AI') >= 0),
      补算旁白: (w.log || []).some(e => String(e.text || '').indexOf('你不在的时候') >= 0),
      /* 判弹窗本身开没开：看 #dialog-root.open 与 .dlg——不看 body 文本。
         "你不在的时候"这句同时会进日志墙（那是**应该**留下的），拿 body 文本判必然假阳（探针自修，2026-10-04）。 */
      弹窗: (() => { const r = document.querySelector('#dialog-root');
        return !!r && r.classList.contains('open') && !!r.querySelector('.dlg') && (r.innerText || '').indexOf('你不在的时候') >= 0; })(),
    };
  });
  判('B① 离线两天：城市自己补过 ≈2 天', 改档 === 'ok' && 回来.t - 离开前.t >= 2 * 1440 && 回来.t - 离开前.t <= 2 * 1440 + 120,
    { 离开前: 离开前.t, 回来: 回来.t, 差: 回来.t - 离开前.t });
  判('B② 补算期间零 AI：补算后即刻 calls=0、AI 没被关、没有告警', 补算后.calls === 0 && 回来.on === true && !回来.关了AI && 回来.补算旁白,
    { 补算后即刻calls: 补算后.calls, '1.5秒后calls': 回来.calls, on: 回来.on, 关了AI: 回来.关了AI, 补算旁白: 回来.补算旁白 });
  判('B③ 回城弹窗当场弹出', 回来.弹窗, { 弹窗: 回来.弹窗 });
  const 关掉 = await page.evaluate(() => {
    const b = document.querySelector('#dialog-root [data-close]');
    if (!b) return false;
    b.click(); return true;
  });
  await page.waitForTimeout(300);
  // 关掉了＝容器收起且内容清空；日志墙那条 ⏱ 照旧在，是应该的（故不看 body 文本）
  const 关后 = await page.evaluate(() => {
    const r = document.querySelector('#dialog-root');
    return !!r && !r.classList.contains('open') && r.innerHTML === '';
  });
  判('B④ 弹窗关得掉', 关掉 && 关后 && 错.length === 0, { 关掉, 关后, 错: 错.length });
  await ctx.close();
}

await browser.close(); srv.close();
const 红 = 断言.filter(x => !x.好).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(断言, null, 2), 'utf8');
console.log('存档两条路径探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
