// 第 123 单·坏档容错普查（渲染面；进冒烟档 2）
//
// 为什么还要一支浏览器侧的：`personalLog` 坏元素崩的是**角色卡对话框**、`saidDay` 坏值崩的是
// **页面里的游戏循环**——这两条在无头 sim 里碰不到，必须真开页面点一遍。
// 口径：把畸形存档塞进隔离上下文的 localStorage → 开页 → 点角色页第一张卡 → 换短信页 →
//   · 全程零 pageerror（网络类噪声只印不算）；
//   · 闸该拒的（personalLog／inbox 坏元素）必须走"挪 BAK＋开新城"（`citylife-save-v1-bak` 有值）；
//   · 闸放行的（saidDay 坏值）必须被就地治好、页面照跑。
// 只读：跑在独立浏览器上下文里，碰不到决策者自己的存档。
//
// 第 281 单追加·**玩家侧小账**（信封里的 miles／keeps／ai／phSeenBy——它们不在世界闸（worldUsable）射程内，
//   世界档永远"合法"，坏的是小账）：五例——miles 全畸形／keeps 混合垃圾／keeps 100 条超上限／
//   ai 畸形／phSeenBy 畸形。逐例查"载入后归一成什么"＋"手账／收藏视图画不画得出来"（真 DOM 真点击）。
//
// 用法：node tools/save-fuzz/dom-probe.mjs [输出目录] [--只小账]
//   （`--只小账`＝只跑第 281 单那五例玩家侧小账——给注入验证/本地迭代用的快档；冒烟里不带参数、跑全量。）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const 要 = createRequire(path.join(REPO, 'x.js'));
const { chromium } = 要('playwright');
const { Sim } = 要(path.join(REPO, 'app.js'));
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天(), 'save-fuzz-dom'));
function 今天() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
fs.mkdirSync(OUT, { recursive: true });

const rawHtml = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state}};\n})();\n</script>');   // 第 281 单：给"查页"一个小账读数口
const PORT = 18946;   // 第 270 单批后自查：原 18942 与 nameplate-audit/audit.mjs 撞车（冒烟里当场炸）⇒ 改号
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

function 造档() {
  const w = Sim.makeWorld(20260803);
  for (let d = 1; d <= 400; d++) { w.credits = 99; for (let i = 0; i < 144; i++) Sim.step(w, 10); }
  return w;
}
const 底 = JSON.parse(Sim.serialize(造档(), null));
const 例 = [
  ['对照·原档', s => s, false],
  ['personalLog=[null]', s => (s.world.agents[0].personalLog = [null], s), true],
  ['inbox=[null]', s => (s.world.agents[0].inbox = [null], s), true],
  ['saidDay="x"', s => (s.world.saidDay = 'x', s), false],
  ['personalLog=[{}]', s => (s.world.agents[0].personalLog = [{}], s), true],
  ['clips=[null]', s => (s.world.clips = [null], s), false],
  ['log=[{}]', s => (s.world.log = [{}], s), false],
  /* ── 第 281 单·玩家侧小账（信封字段；世界闸射程之外）────────────────────────────── */
  ['小账·miles 全畸形', s => (s.meta = Object.assign({}, s.meta, {
      miles: { sms: 'x', replies: -5, notes: null, bdays: {}, calls: [], delivers: '9', picks: 12345, bottle: 2, countedLid: -1 } }), s), false,
    async page => {
      await page.click('button.tab[data-tab="roles"]').catch(() => {});
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const S = window.__pv && window.__pv.state;
        const lis = [...document.querySelectorAll('#mile-list li')];
        return { 小账: S ? JSON.parse(JSON.stringify(S.miles)) : null, 条数: lis.length,
          计数: (document.querySelector('#mile-count') || {}).textContent || '', lidSeq: S ? S.world.lidSeq : -1 };
      });
      const m = r.小账 || {};
      /* 口径校准（第 281 单）：计数类八项的归一**本来就是"非负整数"**（`isFinite` 会把数串 '9' 认成 9——
         这是设计，不是漏网）；**严格布尔只对 `bottle`**。故这里钉的是"绝不出现 NaN／负数／怪东西"＋瓶那一条。 */
      const 好 = ['sms', 'replies', 'notes', 'bdays', 'calls', 'delivers', 'picks', 'countedLid']
        .every(k => Number.isInteger(m[k]) && m[k] >= 0)
        /* 第 294 单：手账 21 → **25** 条（五期 +4＝见过的风景）；`saw` 四键一律**布尔 0/1**
           （★不能钉"全是 0"：开局那一屏本来就看得见公园的蝴蝶 ⇒ 蝶 会被正当点亮——本单第一版栽过） */
        && m.bottle === 0 && m.countedLid === r.lidSeq && r.条数 === 25 && /^\d+\/25$/.test(r.计数)
        && m.saw && ['蝶','蜓','蜗牛','雪人'].every(k => m.saw[k] === 0 || m.saw[k] === 1);
      return { 好, 读数: r };
    }],
  ['小账·keeps 混合垃圾', s => (s.meta = Object.assign({}, s.meta, {
      keeps: [null, 42, 'x', [], { d: 'x' },
        { d: 9, name: 7, score: 'x', base: 'y', full: 'z', items: [null, 3, { id: {}, k: 'x' }], q: ['x', { text: '嗯' }], sc: 'x' }] }), s), false,
    async page => {
      await page.click('button.tab[data-tab="clip"]').catch(() => {});
      await page.waitForTimeout(250);
      await page.click('#clip-mode').catch(() => {});          // 切到"看收藏"
      await page.waitForTimeout(350);
      const r = await page.evaluate(() => {
        const S = window.__pv && window.__pv.state;
        return { 条数: (S && S.keeps || []).length, d: (S && S.keeps && S.keeps[0] || {}).d,
          卡片数: document.querySelectorAll('#clip-keeps .clip').length,
          看收藏文案: (document.querySelector('#clip-mode') || {}).textContent || '' };
      });
      const 好 = r.条数 === 1 && r.d === 9 && r.卡片数 === 1;
      return { 好, 读数: r };
    }],
  ['小账·keeps 100 条超上限', s => (s.meta = Object.assign({}, s.meta, {
      keeps: Array.from({ length: 100 }, (_, i) => ({ d: i + 1, items: [] })) }), s), false,
    async page => {
      const r = await page.evaluate(() => {
        const S = window.__pv && window.__pv.state;
        return { 条数: (S && S.keeps || []).length, 首: (S && S.keeps && S.keeps[0] || {}).d };
      });
      const 好 = r.条数 === 60 && r.首 === 1;
      return { 好, 读数: r };
    }],
  ['小账·ai 畸形', s => (s.meta = Object.assign({}, s.meta, { ai: { day: 'x', used: -3 } }), s), false,
    { 初: async page => {                     // 必须"载入即读"：游戏一跑起来，成本闸会照常记当天用量（那是对的）
      const r = await page.evaluate(() => {
        const S = window.__pv && window.__pv.state;
        return S ? JSON.parse(JSON.stringify(S.aiGate)) : null;
      });
      const 好 = r && r.day === -1 && r.used === 0;
      return { 好, 读数: r };
    } }],
  ['小账·phSeenBy 畸形', s => (s.meta = Object.assign({}, s.meta, {
      phSeen: 7, phSeenBy: { a1: 'x', a2: -1, a3: '5' } }), s), false,
    async page => {
      const r = await page.evaluate(() => {
        const S = window.__pv && window.__pv.state;
        return S ? JSON.parse(JSON.stringify(S.phSeenBy)) : null;
      });
      const 好 = r && r.a1 === 7 && r.a2 === 7 && r.a3 === 5 && r.a4 === 7;
      return { 好, 读数: r };
    }],
  /* 第 294 单·手账五期：`saw`（见过的风景）畸形 ⇒ 四键一律布尔归 0（只有 true／1 才算见过） */
  ['小账·miles.saw 畸形', s => (s.meta = Object.assign({}, s.meta, { miles: Object.assign({}, s.meta && s.meta.miles, {
      saw: { 蝶: 'x', 蜓: -1, 蜗牛: 2, 雪人: true } }) }), s), false,
    async page => {
      await page.click('button.tab[data-tab="roles"]').catch(() => {});
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const S = window.__pv && window.__pv.state;
        const 行 = [...document.querySelectorAll('#mile-list li')].map(li => li.textContent.replace(/\s+/g, ' ').trim());
        return { saw: S ? JSON.parse(JSON.stringify(S.miles.saw)) : null,
                 行: 行.filter(t => /蝴蝶|蜻蜓|蜗牛|雪人/.test(t)) };
      });
      /* 畸形入的 `{蝶:'x', 蜓:-1, 蜗牛:2, 雪人:true}` ⇒ 归一只认 true/1：蜓／蜗牛归 0、雪人留 1；
         蝶 归 0 但可能被开局那一屏（默认就看得见公园的蝴蝶）正当点亮 ⇒ 只要求它是 0/1。 */
      const 好 = r.saw && (r.saw.蝶 === 0 || r.saw.蝶 === 1) && r.saw.蜓 === 0 && r.saw.蜗牛 === 0 && r.saw.雪人 === 1
        && r.行.length === 4 && /小雪人/.test(r.行[3]) && /✓/.test(r.行[3]) && !/✓/.test(r.行[1]) && !/✓/.test(r.行[2]);
      return { 好, 读数: r };
    }],
];

const 只小账 = process.argv.includes('--只小账');
const 例选 = 只小账 ? 例.filter(x => String(x[0]).startsWith('小账·')) : 例;
const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const 报表 = [];
let 红 = 0;
for (const [名, 变, 期望拒收, 钩] of 例选) {
  const H = (typeof 钩 === 'function') ? { 页: 钩 } : (钩 || {});
  const 档 = 变(JSON.parse(JSON.stringify(底)));
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.addInitScript(`try{localStorage.setItem('citylife-save-v1', ${JSON.stringify(JSON.stringify(档))});}catch(e){}`);
  const page = await ctx.newPage();
  const 错 = [];
  page.on('pageerror', e => 错.push('pageerror: ' + (e && e.message || e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() && m.location().url) || '';
    if (/favicon|\/relay|net::ERR/.test(u) || /Failed to load resource/.test(m.text())
        || /CORS|Failed to fetch|api\.anthropic/i.test(m.text())) return;
    错.push('console: ' + m.text().slice(0, 120));
  });
  let 诊 = null;
  let 额外初 = null;
  try {
    await page.goto(URL_, { waitUntil: 'load', timeout: 20000 });
    if (H.初) { try { 额外初 = await H.初(page); } catch (e) { 额外初 = { 好: false, 读数: 'driver:' + String(e.message).slice(0, 90) }; } }
    await page.waitForTimeout(700);
    await page.click('button.tab[data-tab="roles"]').catch(() => {});
    await page.waitForTimeout(250);
    await page.click('#roles-grid button[data-act]').catch(() => {});
    await page.waitForTimeout(250);
    await page.click('button.tab[data-tab="phone"]').catch(() => {});
    await page.waitForTimeout(250);
    诊 = await page.evaluate(() => ({
      day: (document.body.innerText.match(/D\d+/) || [''])[0],
      拒收: !!localStorage.getItem('citylife-save-v1-bak'),
    })).catch(() => null);
  } catch (e) { 错.push('driver: ' + String(e.message).slice(0, 120)); }
  let 额外 = null;
  if (H.页) {
    await page.keyboard.press('Escape').catch(() => {});      // 先把标准流程可能开着的弹窗关掉
    await page.waitForTimeout(150);
    try { 额外 = await H.页(page); } catch (e) { 额外 = { 好: false, 读数: 'driver:' + String(e.message).slice(0, 90) }; }
  }
  if (额外初) 额外 = 额外 ? { 好: 额外.好 && 额外初.好, 读数: 额外初.读数 } : 额外初;
  await ctx.close();
  const 拒收对 = 诊 ? (诊.拒收 === 期望拒收) : false;
  const 好 = 错.length === 0 && 拒收对 && (!额外 || 额外.好);
  if (!好) 红++;
  报表.push({ 名, 错, 诊, 期望拒收, 额外, 好 });
  console.log((好 ? ' ok  ' : ' FAIL ') + 名.padEnd(22) + (诊 ? '［' + 诊.day + ' 拒收=' + 诊.拒收 + '（期望 ' + 期望拒收 + '）］' : '')
    + (额外 ? '［小账 ' + (额外.好 ? 'ok' : 'FAIL') + ' ' + JSON.stringify(额外.读数 || 额外).slice(0, 130) + '］' : '')
    + (错.length ? '  ← ' + 错.slice(0, 2).join(' ; ') : ''));
}
await browser.close();
srv.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(报表, null, 2), 'utf8');
console.log('渲染面坏档普查' + (只小账 ? '（只小账）' : '') + '：' + 红 + ' 例不过 / 共 ' + 例选.length + ' 例；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
