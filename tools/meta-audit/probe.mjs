// 第 239 单·信封（meta）坏档普查（真浏览器；只读诊断，进冒烟档 2）
//
// 为什么要有它：`tools/save-fuzz` 普查的是 **world**（那条腿很硬）；而 `select / phSeen / phSeenBy /
// miles / ai / keeps / lastReflectDay` 这些小账走的是**存档信封**（`meta`），开机由各 `boot*`
// 归一回读——这块一直**没有机器普查**（第 238 单就是在 `keeps` 上踩到的：卡结构一坏，收藏视图当场崩）。
// 口径：对每个字段喂几种坏值（非对象／负值／字符串／空元素）→ 开机 → 依次点开 角色／剪辑（含
// 切收藏视图）／短信 三页 → 判据：**起得来 + 零 pageerror**；`keeps` 那几例再查"逐项归一"
// （`items` 里的非对象元素被丢掉、`d` 非有限的整张丢）。
// 第 241 单·批后审计修：①「坏卡」样例原是没有 name 的裸卡——`clipCard` 走 `!c.name` 的"空卡"
// 分支、碰不到 `items[null]`，把第 238 单的归一撤掉也照样全绿（故障注入复现过）；现改成"带 name
// 的真卡再打断"。②归一结果从"只打印"改成**硬断言**：坏卡 keeps=1／items=0／q=0／收藏视图 1 张卡；
// 其余 keeps 坏值（非数组／空元素／无 d）整张丢掉（keeps=0）。
// 用法：node tools/meta-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'meta-audit'));
fs.mkdirSync(OUT, { recursive: true });
const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state},get Sim(){return Sim},get PURE(){return PURE}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18995;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/blank') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end('<!doctype html><meta charset="utf-8">'); return; }
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const 址 = `http://127.0.0.1:${PORT}/city-life-framework.html`;

// 坏值案（改 meta 里的字段；值都可用 JSON 传进页面）
const 案子 = [
  ['selected=5',          m => m.selected = 5],
  ['selected=zzz',        m => m.selected = 'zzz'],
  ['phSeen=x',            m => m.phSeen = 'x'],
  ['phSeen=-5',           m => m.phSeen = -5],
  ['phSeenBy=x',          m => m.phSeenBy = 'x'],
  ['phSeenBy=[]',         m => m.phSeenBy = []],
  ['phSeenBy.a1=x',       m => m.phSeenBy = { a1: 'x' }],
  ['miles=x',             m => m.miles = 'x'],
  ['miles={sms:x}',       m => m.miles = { sms: 'x' }],
  ['miles={calls:-5}',    m => m.miles = { calls: -5 }],
  ['miles.countedLid=x',  m => m.miles = { countedLid: 'x' }],
  ['ai=x',                m => m.ai = 'x'],
  ['ai={day:x,used:-1}',  m => m.ai = { day: 'x', used: -1 }],
  ['keeps=x',             m => m.keeps = 'x'],
  ['keeps=[null]',        m => m.keeps = [null]],
  ['keeps=[{}]',          m => m.keeps = [{}]],
  ['keeps=[{d:x}]',       m => m.keeps = [{ d: 'x' }]],
  ['keeps=[坏卡]',         m => m.keeps = [{ d: 1, wd: 0, id: 'a1', name: '顾云帆', score: 2, base: 10, full: true, items: [null], q: [null], sc: {} }]],
  ['lastReflectDay=x',    m => m.lastReflectDay = 'x'],
  ['at=x',                m => m.at = 'x'],
];
const 案表 = 案子.map(([名, fn]) => [名, fn.toString()]);

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const page = await ctx.newPage();

// 拿一份合法档当底
await page.goto(址, { waitUntil: 'load' }); await page.waitForTimeout(1500);
await page.click('#tabbar [data-tab="settings"]'); await page.waitForTimeout(200);
await page.click('#sv-now'); await page.waitForTimeout(300);
const 底 = await page.evaluate(() => localStorage.getItem('citylife-save-v1'));
if (!底 || 底.length < 200) { console.error('拿不到合法底档'); process.exit(2); }

const 结果 = [];
let 红 = 0;
for (const [名, 函数源] of 案表) {
  await page.goto(`http://127.0.0.1:${PORT}/blank`, { waitUntil: 'load' });
  await page.evaluate(([底, 函]) => {
    const 档 = JSON.parse(底);
    档.meta = 档.meta || {};
    // eslint-disable-next-line no-eval
    (eval('(' + 函 + ')'))(档.meta);
    localStorage.setItem('citylife-save-v1', JSON.stringify(档));
  }, [底, 函数源]);
  const 页错 = [];
  const 捕 = e => 页错.push(String((e && e.message) || e).slice(0, 90));
  page.on('pageerror', 捕);
  let 起得来 = false, 明细 = '', 归一过 = true;
  try {
    await page.goto(址, { waitUntil: 'load' }); await page.waitForTimeout(1500);
    起得来 = await page.evaluate(() => !!window.__pv && Array.isArray(window.__pv.state.keeps));
    await page.click('#tabbar [data-tab="roles"]'); await page.waitForTimeout(200);
    await page.click('#tabbar [data-tab="clip"]'); await page.waitForTimeout(250);
    await page.click('#clip-mode'); await page.waitForTimeout(250);          // 收藏视图也要能开
    await page.click('#tabbar [data-tab="phone"]'); await page.waitForTimeout(200);
    if (名.indexOf('keeps=') === 0) {
      /* 第 241 单·批后审计：这两条从"只打印"改成**硬断言**。故障注入复现过：原来的「坏卡」样例
         没有 name，`clipCard` 走"空卡"分支、根本读不到 `items[null]`——把第 238 单的归一撤掉，
         本工具照样全绿（假绿）。现样例＝"带 name 的真卡再打断"，并钉住：坏卡归一后
         keeps=1／items=0／q=0／收藏视图 1 张卡；其余 keeps 坏值整张丢掉（keeps=0）。 */
      const 归一 = await page.evaluate(() => {
        const ks = window.__pv.state.keeps || [], k = ks[0];
        return { n: ks.length, items: k ? k.items.length : -1, q: k ? k.q.length : -1,
                 卡数: document.querySelectorAll('#clip-keeps .clip').length };
      });
      明细 = '归一后 keeps=' + 归一.n + '、items=' + 归一.items + '、q=' + 归一.q + '、卡=' + 归一.卡数;
      归一过 = (名 === 'keeps=[坏卡]')
        ? (归一.n === 1 && 归一.items === 0 && 归一.q === 0 && 归一.卡数 === 1)
        : (归一.n === 0);
    }
  } catch (e) { 明细 = '点页抛错：' + String(e.message).slice(0, 60); 归一过 = false; }
  page.off('pageerror', 捕);
  const 过 = 起得来 && 页错.length === 0 && 归一过;
  if (!过) 红++;
  结果.push({ 名, 过, 起得来, 页错: 页错.length, 首错: 页错[0] || '', 明细 });
  console.log((过 ? ' ok  ' : ' FAIL ') + 名 + (明细 ? '  ' + 明细 : '') + (页错.length ? ('  首错：' + 页错[0]) : ''));
}
// 收尾：把底档放回去（免得这个环境留给下一个探针一个坏档）
await page.goto(`http://127.0.0.1:${PORT}/blank`, { waitUntil: 'load' });
await page.evaluate(底 => localStorage.setItem('citylife-save-v1', 底), 底);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ 结果, 底档长度: 底.length }, null, 2), 'utf8');
console.log('信封坏档普查：' + (结果.length - 红) + '/' + 结果.length + (红 ? ('　**' + 红 + ' 例判红**') : ' 全过') + '；报表在 ' + OUT);
await browser.close(); srv.close();
process.exit(红 ? 1 : 0);
