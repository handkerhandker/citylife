// 第 138 单·回城弹窗「看全部剪辑」＋跨处一致性探针（真浏览器；只读诊断，进冒烟档 2）
//
// 背景：第 30 单的 popshots 把弹窗五种形态照过相、但**没有点过「看全部剪辑」**，也没有把
//   「弹窗 ↔ 剪辑页横幅 ↔ 日志墙 ⏱」三处的话对过账。本工具补这一段：
//   A 甲·离开 3 天（有新卡）：
//     ① 弹窗是甲形态（有卡、lead 含「结算了 N 天」、按钮含「看全部剪辑」「知道了」）；
//     ② 点「看全部剪辑」⇒ 弹窗关、落到剪辑页、横幅出现且「结算了 N 天」与弹窗**同一个数**；
//     ③ 弹窗摆的那张卡与剪辑页**第一张卡**（＝最新）逐字相同，剪辑页卡数＝N；
//     ④ 日志墙那条 ⏱ 与弹窗并存（不是被替换）。
//   B 丙·离开 10 天（触封顶）：
//     ⑤ 弹窗、横幅、日志**三处**都出现「只补到封顶的 3 天」与「没有补算」。
//   C 乙·离开 1 小时（没新卡）：
//     ⑥ 弹窗是乙形态（无卡、lead 含「没有结算出新的剪辑卡」、只有「知道了」）；
//     ⑦ 点「知道了」⇒ 弹窗关、仍在现场页、横幅不出。
//
// 用法：node tools/backpop-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'backpop-audit'));
fs.mkdirSync(OUT, { recursive: true });

const rawHtml = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const PORT = 18957;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(rawHtml); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const exe = process.env.CITYLIFE_CHROME || undefined;
const browser = await chromium.launch({ executablePath: exe });
const 断言 = [];
const 判 = (n, ok, 读数_) => { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); };
let 全错 = [];

const 读 = page => page.evaluate(() => {
  const root = document.querySelector('#dialog-root');
  const dlg = root && root.querySelector('.dlg');
  const scr = [...document.querySelectorAll('.screen')].find(s => s.classList.contains('active'));
  const cardOf = el => el ? {
    who: (el.querySelector('.clip-who') || {}).textContent || '',
    score: (el.querySelector('.clip-score') || {}).textContent || '',
    items: [...el.querySelectorAll('.clip-items li')].map(li => li.textContent.trim()),
    foot: (el.querySelector('.clip-foot') || {}).textContent || '',
  } : null;
  const firstListCard = document.querySelector('#clip-list .clip');
  const bk = document.querySelector('#clip-back');
  return {
    popOpen: !!(root && root.classList.contains('open')),
    popLead: dlg ? (dlg.querySelector('.back-lead') || {}).textContent || '' : '',
    popQuiet: dlg ? [...dlg.querySelectorAll('.back-quiet')].map(p => p.textContent).join(' ') : '',
    popCard: dlg ? cardOf(dlg.querySelector('#back-card .clip')) : null,
    popBtns: dlg ? [...dlg.querySelectorAll('button')].map(b => b.textContent.trim()) : [],
    popClosed: !root || !root.classList.contains('open'),
    screen: scr ? scr.id : '(无)',
    bannerShown: bk ? !bk.hidden : false,
    banner: bk ? bk.textContent : '',
    listN: document.querySelectorAll('#clip-list .clip').length,
    listFirst: cardOf(firstListCard),
    tickLog: [...document.querySelectorAll('#log-list li')].map(li => li.textContent).filter(t => t.indexOf('你不在的时候') >= 0),
  };
});
const N天 = s => { const m = /结算了\s*(\d+)\s*天/.exec(s || ''); return m ? +m[1] : null; };

/* ── 造基准存档（生产路径自己落盘），供各场景把 meta.at 往前拨 ── */
async function 造基准() {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1250 } });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(`http://127.0.0.1:${PORT}/`)) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => 全错.push('base: ' + String(e && e.message || e)));
  await page.goto(URL_);
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const raw = await page.evaluate(() => localStorage.getItem('citylife-save-v1'));
  await ctx.close();
  if (!raw) throw new Error('基准存档没落盘');
  return raw;
}

async function 场景(SAVE, awayMin) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1250 } });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(`http://127.0.0.1:${PORT}/`)) return route.continue();
    return route.abort();
  });
  const doctored = (() => { const o = JSON.parse(SAVE); o.meta.at = Date.now() - awayMin * 60000; return JSON.stringify(o); })();
  await ctx.addInitScript(s => { try { localStorage.setItem('citylife-save-v1', s); } catch (_) {} }, doctored);
  const page = await ctx.newPage();
  page.on('pageerror', e => 全错.push('page: ' + String(e && e.message || e)));
  await page.goto(URL_);
  await page.waitForTimeout(700);
  return { ctx, page };
}

const BASE = await 造基准();

// ── A 甲·离开 3 天 ──────────────────────────────────────────────
{
  const { ctx, page } = await 场景(BASE, 4320);
  const a = await 读(page);
  const N = N天(a.popLead);
  判('A① 甲形态：有卡、lead 含「结算了 N 天」、按钮含「看全部剪辑」「知道了」',
    a.popOpen && !!a.popCard && N !== null && N >= 1 && a.popBtns.indexOf('看全部剪辑') >= 0 && a.popBtns.indexOf('知道了') >= 0,
    { 标题leads: a.popLead.slice(0, 60), N, 按钮: a.popBtns });
  判('A④ 日志墙 ⏱ 与弹窗并存', a.tickLog.length >= 1 && a.tickLog[0].indexOf('你不在的时候') >= 0,
    { 条数: a.tickLog.length });
  await page.click('#dialog-root [data-back-clip]').catch(() => {});
  await page.waitForTimeout(400);
  const b = await 读(page);
  const Nb = N天(b.banner);
  判('A② 点「看全部剪辑」⇒ 弹窗关、落剪辑页、横幅「结算了 N 天」与弹窗同一个数',
    b.popClosed && b.screen === 'scr-clip' && b.bannerShown && Nb !== null && Nb === N,
    { 屏幕: b.screen, 横幅: b.banner.slice(0, 70), N弹窗: N, N横幅: Nb });
  判('A③ 弹窗那张卡＝剪辑页第一张卡（逐字）且卡数＝N',
    b.listN === N && JSON.stringify(b.listFirst) === JSON.stringify(a.popCard),
    { 卡数: b.listN, N, 弹窗卡: a.popCard, 列表首卡: b.listFirst });
  await ctx.close();
}

// ── B 丙·离开 10 天（封顶）───────────────────────────────────────
{
  const { ctx, page } = await 场景(BASE, 14400);
  const a = await 读(page);
  const 弹 = /只补到封顶的\s*3\s*天/.test(a.popQuiet) && /没有补算/.test(a.popQuiet);
  const 墙 = a.tickLog.some(t => /只补到封顶的\s*3\s*天/.test(t) && /没有补算/.test(t));
  await page.click('#dialog-root [data-back-clip]').catch(() => {});
  await page.waitForTimeout(400);
  const b = await 读(page);
  const 幅 = /只补到封顶的\s*3\s*天/.test(b.banner) && /没有补算/.test(b.banner);
  判('B⑤ 封顶三处一致：弹窗、日志墙、剪辑页横幅都写明「只补到封顶的 3 天…没有补算」',
    弹 && 墙 && 幅,
    { 弹窗: 弹, 日志墙: 墙, 横幅: 幅, 弹窗原文: a.popQuiet.slice(0, 70) });
  await ctx.close();
}

// ── C 乙·离开 1 小时（没新卡）────────────────────────────────────
{
  const { ctx, page } = await 场景(BASE, 60);
  const a = await 读(page);
  /* ✕ 是对话框标准关闭钮（恒在），不算动作按钮——乙形态的动作按钮应恰有一个「知道了」 */
  判('C⑥ 乙形态：无卡、lead 含「没有结算出新的剪辑卡」、动作按钮只有「知道了」',
    a.popOpen && a.popCard === null && a.popLead.indexOf('没有结算出新的剪辑卡') >= 0
    && a.popBtns.filter(t => t !== '✕').length === 1 && a.popBtns.indexOf('知道了') >= 0,
    { lead: a.popLead.slice(0, 70), 按钮: a.popBtns, 有卡: !!a.popCard });
  await page.click('#dialog-root .dlg button').catch(() => {});
  await page.waitForTimeout(300);
  const b = await 读(page);
  判('C⑦ 点「知道了」⇒ 弹窗关、仍在现场页、横幅不出',
    b.popClosed && b.screen === 'scr-live' && b.bannerShown === false,
    { 屏幕: b.screen, 横幅: b.bannerShown });
  await ctx.close();
}

await browser.close();
srv.close();
const 红 = 断言.filter(x => !x.ok).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ 断言, 页面错误: 全错, 红, 通过: 红 === 0 && 全错.length === 0 }, null, 2), 'utf8');
console.log('\n回城弹窗一致性探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；页面错误 ' + 全错.length + '；报表在 ' + OUT);
process.exit((红 || 全错.length) ? 1 : 0);
