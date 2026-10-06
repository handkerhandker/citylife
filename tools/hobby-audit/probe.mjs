// 第 255 单·四个人的爱好 实机取证（真浏览器；只读诊断，进冒烟档 2）
//
// 量什么：
//   ① 真跑：从固定种子开跑、逐步推进（每次 10 游戏分钟），直到**真的撞上一个"爱好日"的空闲拍**——
//      某人的 activity.label 恰是他的爱好标签；找不到即判红；
//   ② 角色卡：那一刻点开他的「详情」，卡里「正在」应当带爱好标签、「此刻」应当是本人池里的独白；
//   ③ 池账：命中的独白出自**他本人**的池（不串人）、且命中那一下确在**他的爱好日**上；
//   ④ 覆盖面：继续跑（共 ≈ 24 游戏天）——四个人的爱好日都得真露面（≥3 人）、零串池；
//   ⑤ 全程零 pageerror。
// 对照：--改前=<git-ref> 旧版没有 HOBBY 概念 ⇒ ① 找不到（判红）。
// 用法：node tools/hobby-audit/probe.mjs [输出目录] [--改前=<git-ref>]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'hobby-audit'));
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';

const rawHtml = BEFORE
  ? execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:city-life-framework.html`], { maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }

const PORT = 18978;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const 错 = [];
page.on('pageerror', e => 错.push('pageerror: ' + ((e && e.message) || e)));
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html?seed=20261006`, { waitUntil: 'load' });
await page.waitForTimeout(2200);
await page.evaluate(() => { const st = __pv.state, w = st.world; w.speed = 0; st.llm.on = false; });

/* ① 逐步推进，撞第一个"爱好日"的空闲拍（最多 4.2 天）。 */
const 首 = await page.evaluate(() => {
  const st = __pv.state, w = st.world, S = __pv.Sim;
  if (!S.HOBBY) return { 无表: true };
  for (let k = 0; k < 600; k++) {
    S.step(w, 10);
    for (const ag of w.agents) {
      const h = S.HOBBY[ag.id]; if (!h) continue;
      if (ag.activity && ag.activity.type === 'idle' && ag.activity.label === h.label) {
        const 词 = String(ag.activity.think || '');
        const 串 = ['a1', 'a2', 'a3', 'a4'].some(id => id !== ag.id && S.HOBBY[id] && S.HOBBY[id].池.indexOf(词) >= 0);
        const 好日 = S.爱好日(w, ag) || S.爱好日({ t: w.t - 10, agents: w.agents }, ag);
        return { id: ag.id, label: ag.activity.label, think: 词, t: w.t, 池内: h.池.indexOf(词) >= 0, 串池: 串, 好日 };
      }
    }
  }
  return null;
});
const 找 = !!(首 && !首.无表);
console.log('▶ 首例：' + JSON.stringify(首));

/* ② 那一刻：角色**页**的卡片「正在」要带爱好标签；点开他的「详情」，弹窗「此刻」是那句独白（截图取证）。 */
let 卡 = { 打开: false, 文本: '', 正在: '' };
if (找) {
  await page.click('button.tab[data-tab="roles"]').catch(() => {});
  await page.waitForTimeout(400);
  const 页卡 = await page.evaluate(id => {
    const c = document.querySelector('[data-role="' + id + '"] .rr-act');
    return c ? String(c.textContent || '') : '';
  }, 首.id);
  await page.click(`button[data-act="detail"][data-id="${首.id}"]`).catch(() => {});
  await page.waitForTimeout(400);
  卡 = await page.evaluate(() => {
    const root = document.querySelector('#dialog-root');
    const open = !!(root && root.classList.contains('open'));
    return { 打开: open, 文本: root ? String(root.textContent || '').slice(0, 400) : '', 正在: '' };
  });
  卡.正在 = 页卡;                                   // 页卡片上的「正在」行（renderRoles 填的）
  await page.locator('#dialog-root').screenshot({ path: path.join(OUT, '爱好-角色卡.png') }).catch(() => {});
}
const 卡好 = !!(卡.打开 && 首 && 卡.正在.indexOf(首.label) >= 0 && 卡.文本.indexOf(首.think) >= 0);

/* ③ 继续跑（共 ≈ 24 天）：四个人的爱好日各露面几次；零串池。 */
const 统计 = await page.evaluate(() => {
  const st = __pv.state, w = st.world, S = __pv.Sim;
  const 日 = {}; let 串 = 0, 错日 = 0;
  if (!S.HOBBY) return { 日, 串, 错日 };
  for (let k = 0; k < 3200; k++) {
    S.step(w, 10);
    for (const ag of w.agents) {
      const h = S.HOBBY[ag.id]; if (!h) continue;
      if (ag.activity && ag.activity.type === 'idle' && ag.activity.label === h.label) {
        const key = ag.id + '@' + Math.floor(w.t / 1440);
        日[ag.id] = 日[ag.id] || {};
        日[ag.id][key] = 1;
        const 词 = String(ag.activity.think || '');
        if (h.池.indexOf(词) < 0) 串++;
        if (!(S.爱好日(w, ag) || S.爱好日({ t: w.t - 10, agents: w.agents }, ag))) 错日++;
      }
    }
  }
  const 天数 = {}; for (const id of Object.keys(日)) 天数[id] = Object.keys(日[id]).length;
  return { 天数, 串, 错日 };
});
await browser.close(); srv.close();

const 断言 = [];
const 判 = (n, ok, 读数_) => { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); };
判('① 真跑撞上"爱好日"的空闲拍（标签＝某人的爱好）', 找, 首 || {});
判('② 那一下确在他的爱好日上（哈希选日）', 找 && 首.好日 === true, { 好日: 首 && 首.好日 });
判('③ 独白出自本人池、且不串别人池', 找 && 首.池内 === true && 首.串池 === false, { 池内: 首 && 首.池内, 串池: 首 && 首.串池 });
判('④ 看得见：角色页卡片「正在」带爱好标签、详情弹窗「此刻」是那句独白', 卡好, { 打开: 卡.打开, 正在: 卡.正在 });
判('⑤ 覆盖面：≈24 天里 ≥3 人的爱好日真露面', (统计.天数 && Object.keys(统计.天数).length >= 3), 统计);
判('⑥ 全程零串池、零错日', 统计.串 === 0 && 统计.错日 === 0, { 串: 统计.串, 错日: 统计.错日 });
判('⑦ 全程零 pageerror', 错.length === 0, { 错: 错.slice(0, 3) });

const 结论 = { 版本: BEFORE || '（工作区当前版本）', 首例: 首, 卡, 统计, 断言, 页面错误: 错, 通过: 断言.every(x => x.ok) };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
const 红 = 断言.filter(x => !x.ok).length;
console.log('\n爱好探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
