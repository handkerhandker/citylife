// 第 232／233 单·委托·C「替他拿主意」＋B「捎句话」探针（真浏览器；只读诊断，进冒烟档 2）
//
// 口径：① 摆一个"两选一"委托（kind:'pick'）⇒ 短信页出现题面与两枚按钮；
//      ② 点第二枚 ⇒ 额度 -1、当天第一条 +1、`req.pick=1`、多一条 `sms:'pick'` 日志、
//         卡片变成"已回主意「…」"；③ 推到 20:00 步进一次 ⇒ 结算走**对应选项**的结局线
//         （逐字等于 REQ_PICK[工种][qi].out[1][0]）＋谢礼 +1；
//      ④ 对照（不点）⇒ 20:00 后 `req.done` 但 0 条"忙完了："、关系不动；
//      ⑤ B（第 233 单）：委托人页显示"还没带到"；在收件人页点「把话带到」＝额度 -1＋收件人 +1＋
//         `sent`＋一条 sms:deliver 日志；20:00 结算 ⇒ 委托人落"话带到了"＋谢礼 +2（两头都记）；
//      ⑥ 全程零 pageerror。
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
  return el ? { hidden: el.hidden, 文: el.textContent.replace(/\s+/g, ' ').trim(),
                钮: el.querySelectorAll('[data-pick]').length, 捎钮: el.querySelectorAll('[data-deliver]').length } : null;
});
const 读数 = () => page.evaluate(() => {
  const w = __pv.state.world, S = __pv.Sim;
  const ag = w.agents.find(a => a.id === 'a1'), a2 = w.agents.find(a => a.id === 'a2');
  return { credits: w.credits, 关1: S.relYouGet(ag), 关2: S.relYouGet(a2),
           拍1: ag.req && ag.req.pick, 完1: ag.req && ag.req.done, 完2: a2.req && a2.req.done,
           捎sent: !!(ag.req && ag.req.sent),
           pick日志: w.log.filter(e => e.sms === 'pick').length,
           deliver日志: w.log.filter(e => e.sms === 'deliver').length,
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

// ⑦ 委托·B（捎句话）：a1 托你把一句话带给 a2
await page.evaluate(() => {
  const w = __pv.state.world, P = __pv.PURE;
  w.speed = 0; w.credits = 3;
  const 天 = P.dayOf(w.t);
  const a1 = w.agents.find(a => a.id === 'a1');
  a1.req = { day: 天, ok: false, done: false, kind: 'deliver', to: 'a2', line: '周末我多半要加班，别等我一起吃饭。' };
  w.agents.find(a => a.id === 'a2').relYou = { v: 4, day: 0 };
});
await page.click('#ph-agents [data-to="a1"]'); await page.waitForTimeout(200);
const 甲页 = await 卡文();
记(甲页 && !甲页.hidden && 甲页.文.indexOf('还没带到') >= 0, '委托人那一页显示"还没带到"');
await page.click('#ph-agents [data-to="a2"]'); await page.waitForTimeout(200);
const 捎卡 = await 卡文();
const 高亮 = await page.evaluate(() => ({
  a1: document.querySelector('#ph-agents [data-to="a1"]').classList.contains('gold'),
  a2: document.querySelector('#ph-agents [data-to="a2"]').classList.contains('gold'),
}));
记(高亮.a2 && !高亮.a1, '选中收件人时高亮跟着走（a2 亮、a1 不亮）');
if (!捎卡 || 捎卡.hidden || 捎卡.捎钮 !== 1) {
  记(false, '在收件人页出现"捎句话"卡片与「把话带到」按钮（本版没有——第 233 单之前的版本即此形态）');
} else {
  记(true, '在收件人页出现"捎句话"卡片与「把话带到」按钮');
  await page.screenshot({ path: path.join(OUT, '委托-捎句话.png') });
  const 前B = await 读数();
  await page.click('#ph-ask [data-deliver="1"]'); await page.waitForTimeout(250);
  const 后B = await 读数();
  记(后B.credits === 前B.credits - 1 && 后B.关2 === 前B.关2 + 1 && 后B.捎sent === true && 后B.deliver日志 === 前B.deliver日志 + 1,
     '点「把话带到」：额度 ' + 前B.credits + '→' + 后B.credits + '、收件人关系 ' + 前B.关2 + '→' + 后B.关2 + '、`sent`、多一条 sms:deliver');
  const B期望 = await page.evaluate(() => {
    const w = __pv.state.world, S = __pv.Sim, P = __pv.PURE;
    w.t = (P.dayOf(w.t) - 1) * 1440 + 20 * 60 - 10;
    S.step(w, 10);
    return S.REQ_DELIVER_DONE[0];
  });
  await page.waitForTimeout(200);
  const 结B = await 读数();
  记(结B.甲忙.length >= 1 && 结B.甲忙[结B.甲忙.length - 1] === B期望 && 结B.关1 === 前B.关1 + 2,
     '20:00 结算：委托人落"话带到了"＋谢礼 +2（两头都记）');
}

// ⑧ 额度为 0：卡片上的按钮要像"发送/打电话"一样禁用（不然点了毫无反应）——第 234 单审计补
await page.evaluate(() => {
  const w = __pv.state.world, P = __pv.PURE;
  w.speed = 0; w.credits = 0;
  const 天 = P.dayOf(w.t);
  w.agents.find(a => a.id === 'a1').req = { day: 天, ok: false, done: false, kind: 'pick', qi: 0 };
  w.agents.find(a => a.id === 'a2').req = { day: 天, ok: false, done: false, kind: 'deliver', to: 'a1', line: '测试' };
});
await page.click('#ph-agents [data-to="a1"]'); await page.waitForTimeout(200);
const 缺额 = await page.evaluate(() => ({
  捎: Array.from(document.querySelectorAll('#ph-ask [data-deliver]')).map(b => b.disabled),
  拣: Array.from(document.querySelectorAll('#ph-ask [data-pick]')).map(b => b.disabled),
}));
记(缺额.捎.length === 1 && 缺额.捎[0] === true, '额度 0：「把话带到」按钮禁用（实测 ' + JSON.stringify(缺额.捎) + '）');
记(缺额.拣.length === 2 && 缺额.拣.every(Boolean), '额度 0：两枚主意按钮禁用（实测 ' + JSON.stringify(缺额.拣) + '）');
await page.evaluate(() => { __pv.state.world.credits = 3; });

// ⑨ 坏档：`pick`／`line` 是坏值时，卡片说人话（不出现 "undefined"）——第 235 单补
await page.evaluate(() => {
  const w = __pv.state.world, P = __pv.PURE;
  w.speed = 0; w.credits = 3;
  const 天 = P.dayOf(w.t);
  w.agents.find(a => a.id === 'a1').req = { day: 天, ok: true, done: false, kind: 'pick', qi: 0, pick: 99 };
  w.agents.find(a => a.id === 'a2').req = { day: 天, ok: false, done: false, kind: 'deliver', to: 'a1', line: 5 };
});
await page.click('#ph-agents [data-to="a1"]'); await page.waitForTimeout(200);
const 坏档卡 = await page.evaluate(() => document.querySelector('#ph-ask').textContent.replace(/\s+/g, ' '));
记(坏档卡.indexOf('undefined') < 0 && 坏档卡.indexOf('（这条读不出来了）') >= 0,
   '坏档（pick=99／line=5）：卡片说人话，不出现 "undefined"');
await page.evaluate(() => {
  const w = __pv.state.world, P = __pv.PURE;
  const 天 = P.dayOf(w.t);
  w.agents.find(a => a.id === 'a1').req = null;
  w.agents.find(a => a.id === 'a2').req = null;
});

记(错.length === 0, '全程零 pageerror（实测 ' + 错.length + '）');
for (const x of 判) console.log((x.过 ? ' ok ' : ' FAIL') + ' ' + x.名);
const 过 = 判.every(x => x.过);
console.log('委托探针：' + 判.filter(x => x.过).length + '/' + 判.length + (过 ? ' 全过' : ' **有 FAIL**') + '；报表与截图：' + OUT);
await browser.close(); srv.close();
process.exit(过 ? 0 : 1);
