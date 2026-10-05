// 第 232 单·委托·C「替他拿主意」探针（真浏览器；只读诊断，进冒烟档 2）
//
// 口径：① 摆一个"两选一"委托（kind:'pick'）⇒ 短信页出现题面与两枚按钮；
//      ② 点第二枚 ⇒ 额度 -1、当天第一条 +1、`req.pick=1`、多一条 `sms:'pick'` 日志、
//         卡片变成"已回主意「…」"；③ 推到 20:00 步进一次 ⇒ 结算走**对应选项**的结局线
//         （逐字等于 REQ_PICK[工种][qi].out[1][0]）＋谢礼 +1；
//      ④ 对照（不点）⇒ 20:00 后 `req.done` 但 0 条"忙完了："、关系不动；⑤ 全程零 pageerror。
// --改前=<git-ref>：对第 232 单之前的版本跑同一套（短信页没有这块卡片）⇒ 点不出、判红。
// 用法：node tools/req-audit/probe.mjs [输出目录] [--改前=<git-ref>]  （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'req-audit'));
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},get PURE(){return PURE}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18983;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
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

// 摆状态：给 a1 一笔来往＋一个"两选一"委托；a2 也摆一个（后面当"不点"的对照）
await page.evaluate(() => {
  const st = __pv.state, w = st.world, S = __pv.Sim, P = __pv.PURE;
  w.speed = 0; w.credits = 3;
  const 天 = P.dayOf(w.t);
  for (const id of ['a1', 'a2']) {
    const ag = w.agents.find(a => a.id === id);
    ag.relYou = { v: 4, day: 0 };
    ag.req = { day: 天, ok: false, done: false, kind: 'pick', qi: 0 };
  }
});
try {
  await page.click('#tabbar [data-tab="phone"]', { timeout: 4000 });
  await page.click('#ph-agents [data-to="a1"]', { timeout: 4000 });
} catch (e) {
  console.log(' FAIL 手机页没找到：' + String(e.message || e).slice(0, 80));
  await browser.close(); srv.close(); process.exit(1);
}
await page.waitForTimeout(300);

const 卡文 = () => page.evaluate(() => {
  const el = document.querySelector('#ph-ask');
  return el ? { hidden: el.hidden, 文: el.textContent.replace(/\s+/g, ' ').trim(), 钮: el.querySelectorAll('[data-pick]').length } : null;
});
const 读数 = () => page.evaluate(() => {
  const w = __pv.state.world, S = __pv.Sim;
  const ag = w.agents.find(a => a.id === 'a1'), a2 = w.agents.find(a => a.id === 'a2');
  return { credits: w.credits, 关1: S.relYouGet(ag), 关2: S.relYouGet(a2),
           拍1: ag.req && ag.req.pick, 完1: ag.req && ag.req.done, 完2: a2.req && a2.req.done,
           pick日志: w.log.filter(e => e.sms === 'pick').length,
           甲忙: w.log.filter(e => e.agent === 'a1' && String(e.text).indexOf('忙完了：') === 0).map(e => e.text),
           乙忙: w.log.filter(e => e.agent === 'a2' && String(e.text).indexOf('忙完了：') === 0).length };
});

const 甲 = await 卡文();
if (!甲 || 甲.hidden || 甲.钮 !== 2) {
  console.log(' FAIL 短信页没有"他问你"的两枚按钮（第 232 单之前的版本即此形态）：' + JSON.stringify(甲));
  await browser.close(); srv.close(); process.exit(1);
}
记(甲.钮 === 2, '卡片出现：题面＋两枚按钮（「' + 甲.文.slice(0, 26) + '…」）');
await page.screenshot({ path: path.join(OUT, '委托-他问你.png') });

const 前 = await 读数();
await page.click('#ph-ask [data-pick="1"]');
await page.waitForTimeout(250);
const 后 = await 读数();
const 卡二 = await 卡文();
记(后.credits === 前.credits - 1 && 后.关1 === 前.关1 + 1 && 后.拍1 === 1 && 后.pick日志 === 前.pick日志 + 1,
   '点第二枚＝回主意：额度 ' + 前.credits + '→' + 后.credits + '、关系 ' + 前.关1 + '→' + 后.关1 + '、`pick=1`、多一条 sms:pick');
记(卡二 && 卡二.文.indexOf('已回主意') >= 0, '卡片变成回执：「' + (卡二 ? 卡二.文.slice(0, 24) : '—') + '…」');

// 推到 20:00（`advance10` 先加 10 分钟，故从 19:50 起跳）：结算走"选项 1"的结局线；a2 不点 ⇒ 零后果
const 期望 = await page.evaluate(() => {
  const w = __pv.state.world, S = __pv.Sim, P = __pv.PURE;
  const ag = w.agents.find(a => a.id === 'a1');
  const 题 = (S.REQ_PICK[ag.workKind] || S.REQ_PICK.work)[0];
  w.t = (P.dayOf(w.t) - 1) * 1440 + 20 * 60 - 10;
  S.step(w, 10);
  return 题.out[1][0];
});
await page.waitForTimeout(200);
const 结 = await 读数();
记(结.甲忙.length >= 1 && 结.甲忙[结.甲忙.length - 1] === 期望 && 结.关1 === 前.关1 + 2,
   '20:00 结算走对应选项的结局线（「' + 期望.slice(0, 18) + '…」）＋谢礼 +1');
记(结.完2 === true && 结.乙忙 === 0 && 结.关2 === 前.关2,
   '不点的对照：`req` 静静收口、0 条"忙完了："、关系不动 ⇒ 错过零后果');
await page.screenshot({ path: path.join(OUT, '委托-已回执.png') });

记(错.length === 0, '全程零 pageerror（实测 ' + 错.length + '）');
for (const x of 判) console.log((x.过 ? ' ok ' : ' FAIL') + ' ' + x.名);
const 过 = 判.every(x => x.过);
console.log('委托探针：' + 判.filter(x => x.过).length + '/' + 判.length + (过 ? ' 全过' : ' **有 FAIL**') + '；报表与截图：' + OUT);
await browser.close(); srv.close();
process.exit(过 ? 0 : 1);
