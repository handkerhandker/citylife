// 第 229 单·电话·第 1 层探针（真浏览器；只读诊断，进冒烟档 2）
//
// 口径：① 手机页点「📞 打电话」，接通态下走完两轮选项＋挂断 ⇒ 面板出现开场白／回话／告别语与
//      "通话结束"；结算＝额度 -1、关系 +1、多一条 `sms:'call'` 日志；
//      ② 同一天再拨一次、点同一串选项 ⇒ 回话逐字相同（纯哈希、可复现）；
//      ③ 上班中 ⇒ 面板写"打不通"，**不扣额度、不落字**；
//      ④ 累（energy=1）⇒ 面板写"按掉了"＋落一条日志，但**不扣额度、关系不动**；
//      ⑤ 取消路径：开了就关（✕）⇒ 世界零变化（通话进度只在闭包里，不悬挂）；
//      ⑥ 全程零 pageerror。
// --改前=<git-ref>：对第 229 单之前的版本跑同一套（手机页没有打电话入口）⇒ 点不出、判红。
// 用法：node tools/call-audit/probe.mjs [输出目录] [--改前=<git-ref>]  （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'call-audit'));
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},get PURE(){return PURE}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18974;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const 判=[];   // {过, 名, 详}
const 记=(过,名,详='')=>判.push({过,名,详});
const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 440, height: 744 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push(String(e && e.message || e)));
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(2200);

const 设状态 = (act, energy, hunger, credits) => page.evaluate(([act, energy, hunger, credits]) => {
  const st = __pv.state, w = st.world;
  w.speed = 0;
  const ag = w.agents.find(a => a.id === 'a1');
  ag.activity = { type: act };
  ag.energy = energy; ag.hunger = hunger;
  if (credits !== null) w.credits = credits;
}, [act, energy, hunger, credits]);
const 读数 = () => page.evaluate(() => {
  const w = __pv.state.world, S = __pv.Sim;
  const ag = w.agents.find(a => a.id === 'a1');
  const 末 = w.log.length ? w.log[w.log.length - 1] : null;
  return { credits: w.credits, 关系: S.relYouGet(ag), 日志数: w.log.length,
           末条: 末 ? { type: 末.type, sms: 末.sms || '', text: String(末.text || '') } : null };
});
const 弹窗开 = () => page.evaluate(() => document.querySelector('#dialog-root').classList.contains('open'));
const 弹窗文 = () => page.evaluate(() => {
  const r = document.querySelector('#dialog-root');
  return r.classList.contains('open') ? r.textContent.replace(/\s+/g, ' ').trim() : '';
});
const 关弹窗 = async () => {
  if (await 弹窗开()) { await page.click('#dialog-root [data-close]'); await page.waitForTimeout(180); }
};
const TA句 = () => page.evaluate(() => {
  const a = document.querySelectorAll('#dialog-root .call-flow>.ta');
  return Array.from(a).map(x => x.textContent.trim());
});
const 走完一通 = async () => {           // 两轮（生疏档）＋挂断；返回 TA 的全部句子
  await page.click('#ph-call'); await page.waitForTimeout(250);
  const 开 = await 弹窗文();
  await page.click('#dialog-root [data-opt="day"]'); await page.waitForTimeout(200);
  await page.click('#dialog-root [data-opt="dinner"]'); await page.waitForTimeout(200);
  const 有挂 = await page.evaluate(() => !!document.querySelector('#dialog-root [data-hang]'));
  const 句 = await TA句();
  await page.click('#dialog-root [data-hang]'); await page.waitForTimeout(250);
  const 终 = await 弹窗文();
  return { 开, 有挂, 句, 终 };
};

// —— 进手机页、选中 a1 ——
try {
  await page.click('#tabbar [data-tab="phone"]', { timeout: 4000 });
  await page.click('#ph-agents [data-to="a1"]', { timeout: 4000 });
} catch (e) {
  console.log(' FAIL 手机页或打电话入口没找到（第 229 单之前的版本即此形态）：' + String(e.message || e).slice(0, 80));
  await browser.close(); srv.close(); process.exit(1);
}
const 有入口 = await page.evaluate(() => !!document.querySelector('#ph-call'));
if (!有入口) {
  console.log(' FAIL 手机页没有「📞 打电话」入口（第 229 单之前的版本即此形态）');
  await browser.close(); srv.close(); process.exit(1);
}

// ① 接通：两轮＋挂断＝结算
await 设状态('idle', 100, 0, 3);
const 甲 = await 走完一通();
await page.screenshot({ path: path.join(OUT, '电话-接通.png') });
const s甲 = await 读数();
记(甲.开.indexOf('☎') >= 0 && 甲.句.length >= 3 && 甲.有挂, '接通面板：开场白＋两轮回话＋告别语＋挂断钮（TA 共 '+甲.句.length+' 句）');
记(甲.终.indexOf('通话结束') >= 0, '挂断后有"通话结束"交代');
记(s甲.credits === 2 && s甲.关系 === 1 && s甲.末条 && s甲.末条.sms === 'call' && s甲.末条.type === 'player',
   '结算：额度 3→' + s甲.credits + '、关系 0→' + s甲.关系 + '、末条日志 sms=' + (s甲.末条 && s甲.末条.sms));
// ①b 重渲染后仍在：切到别人再切回来（整页重刷），这条通话应留在这个人的「往来记录」里
await 关弹窗();
await page.click('#ph-agents [data-to="a2"]'); await page.waitForTimeout(150);
await page.click('#ph-agents [data-to="a1"]'); await page.waitForTimeout(150);
const 重刷文 = await page.evaluate(() => document.querySelector('#ph-history').textContent.replace(/\s+/g, ' '));
记(重刷文.indexOf('和你通了会儿电话') >= 0, '重渲染后通话仍留在这个人的「往来记录」里（挂人＋居民口吻）');

// ② 确定性：同一天、同一串选项，TA 的回话逐字相同
await 关弹窗();
await 设状态('idle', 100, 0, 3);
const 乙 = await 走完一通();
记(JSON.stringify(甲.句) === JSON.stringify(乙.句), '两次通话逐字同话（纯哈希）：' + JSON.stringify(乙.句.slice(0, 2)));

// ③ 上班中 ⇒ 打不通（不扣额度、不落字）
await 关弹窗();
await 设状态('work', 100, 0, 3);
const b0 = await 读数();
await page.click('#ph-call'); await page.waitForTimeout(250);
const 忙文 = await 弹窗文();
await page.screenshot({ path: path.join(OUT, '电话-打不通.png') });
const b1 = await 读数();
记(忙文.indexOf('打不通') >= 0 && b1.credits === b0.credits && b1.日志数 === b0.日志数,
   '上班中＝打不通且零代价（额度 '+b0.credits+'→'+b1.credits+'、日志 +'+(b1.日志数 - b0.日志数)+'）');

// ④ 累 ⇒ 拒接（日志 +1，但额度与关系不动）
await 关弹窗();
await 设状态('idle', 1, 0, 3);
const c0 = await 读数();
await page.click('#ph-call'); await page.waitForTimeout(250);
const 拒文 = await 弹窗文();
await page.screenshot({ path: path.join(OUT, '电话-被拒.png') });
const c1 = await 读数();
记(拒文.indexOf('按掉了') >= 0 && c1.credits === c0.credits && c1.关系 === c0.关系
   && c1.日志数 === c0.日志数 + 1 && c1.末条 && c1.末条.sms === 'call',
   '累了＝被按掉（额度仍 '+c1.credits+'、关系仍 '+c1.关系+'、日志 +1）');

// ⑤ 取消路径：开了就关 ⇒ 世界零变化
await 关弹窗();
await 设状态('idle', 100, 0, 3);
const e0 = await 读数();
await page.click('#ph-call'); await page.waitForTimeout(250);
await page.click('#dialog-root [data-close]'); await page.waitForTimeout(200);
const e1 = await 读数();
记(e1.credits === e0.credits && e1.关系 === e0.关系 && e1.日志数 === e0.日志数,
   '取消路径不留账（额度 '+e0.credits+'→'+e1.credits+'、关系 '+e0.关系+'→'+e1.关系+'、日志 +'+(e1.日志数 - e0.日志数)+'）');

记(错.length === 0, '全程零 pageerror（实测 '+错.length+'）' + (错.length ? '：' + 错[0] : ''));

for (const x of 判) console.log((x.过 ? ' ok ' : ' FAIL') + ' ' + x.名 + (x.详 ? '（' + x.详 + '）' : ''));
const 过 = 判.every(x => x.过);
console.log('电话探针：' + 判.filter(x => x.过).length + '/' + 判.length + (过 ? ' 全过' : ' **有 FAIL**') + '；报表与截图：' + OUT);
await browser.close(); srv.close();
process.exit(过 ? 0 : 1);
