// 第 37 单 · 世界侧三问取证（**只读诊断**：不进 gate.yml、不判红、不改任何产品代码）
//
// 为什么要有这一单：待办里挂着三条「世界不像世界」的账，但一直只有感觉、没有读数——
//   问一 · `decide()` 不查星期 ⇒ 四个人周六日照常上班
//   问二 · `decide()` 全程不读 `w.weather` ⇒ 雨是纯壁纸（白天四分之一时间挂在屏幕上）
//   问三 · 兜底闲聊的接话句与开口句零关联 ⇒ 约一半对话答非所问
// 三条都要动 SIM（rng 流位移、世界指纹变），按改动分级属大改动，**必须先有取证、再请决策者拍板**。
// 本脚本就是那份取证：把「三个人周末在干嘛」变成逐日逐人的读数。
//
// 口径（照第 23／24 单「门禁要量的东西若不在 w.stats 里，就在门禁侧逐拍观测，不给世界加字段」）：
//   · 逐拍读 `ag.activity.type` 与 `ag.anchor`（都是只读），按**星期**与**天气**两个维度分桶；
//   · 起床时刻取 `ag.rest.wake`（第 22 单的作息字段），每天正午后采一次；
//   · 全程只调 `Sim.step`，不写世界任何字段。
//
// 用法：先跑门禁第 1 步（或 `node -e` 解包）生成 app.js，然后 `node tools/world-audit/anchors.cjs`
const {PURE, Sim} = require('../../app.js');

const SEEDS = [20260803, 424242, 777];   // 三颗种子
const DAYS  = 56;                        // 8 周：工作日 40 天、周末 16 天
const 在家 = a => /^(home_|bed)/.test(a);
const 在岗 = a => /^(desk|store_)/.test(a);

const 桶 = {};
const 新桶 = () => ({ 拍: 0, 人拍: 0, work: 0, idle: 0, sleep: 0, 离家: 0, 在岗: 0, 在外: 0, 起床: [] });
const 记 = (k, t, a, v) => {
  const b = 桶[k] || (桶[k] = 新桶());
  b.拍++; b.人拍++;
  if (t === 'work') b.work++;
  if (t === 'idle') b.idle++;
  if (t === 'sleep') b.sleep++;
  if (!在家(a)) b.离家++;
  if (在岗(a)) b.在岗++;
  if (!在家(a) && !在岗(a)) b.在外++;
  void v;
};

const 起床桶 = { 工作日: [], 周末: [] };

for (const seed of SEEDS) {
  const w = Sim.makeWorld(seed);
  for (let i = 0; i < DAYS * 144; i++) {
    Sim.step(w, 10);
    const wd = PURE.weekday(w.t);                 // 0=周一
    const 雨 = w.weather.rain ? 'rain' : 'clear';
    const 周 = wd >= 5 ? 'wd-end' : 'wd-day';
    for (const ag of w.agents) {
      const t = ag.activity && ag.activity.type, a = ag.anchor || '';
      记('周' + wd, t, a);
      记(周, t, a);
      记(雨, t, a);
      // 按「钟点 × 天气」再分一层：雨天的拍子若集中在白天，直接拿雨/晴比「上工占比」会被时段混淆
      记('h' + Math.floor(PURE.minuteOfDay(w.t) / 60) + 雨, t, a);
    }
    // 每天正午后采一次起床时刻（那天的 `ag.rest.wake`）
    if (PURE.minuteOfDay(w.t) === 720) {
      // `ag.rest.wake` 是**世界时间戳**（与 w.t 同量纲，如 2030），不是钟点 ⇒ 必须取当日分钟
      for (const ag of w.agents) if (ag.rest && isFinite(ag.rest.wake)) {
        (wd >= 5 ? 起床桶.周末 : 起床桶.工作日).push(PURE.minuteOfDay(ag.rest.wake));
      }
    }
  }
}

const pct = (n, d) => d ? (n / d * 100).toFixed(2) + '%' : '—';
const 均 = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const sd = a => { if (a.length < 2) return NaN; const m = 均(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const 时刻 = v => isFinite(v) ? String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(Math.round(v % 60)).padStart(2, '0') : '—';

console.log('种子 ' + SEEDS.join('/') + '，各 ' + DAYS + ' 天（工作日 40 天 / 周末 16 天）\n');

console.log('═══ 问一 · 按星期分桶：「做什么」有区别吗 ═══');
console.log('星期   人·拍      上工     在家待着   睡觉     离家     在岗     在外');
for (let d = 0; d < 7; d++) {
  const b = 桶['周' + d]; if (!b) continue;
  console.log(('周' + '一二三四五六日'[d] + '  ').padEnd(7)
    + String(b.人拍).padEnd(10) + pct(b.work, b.人拍).padEnd(9) + pct(b.idle, b.人拍).padEnd(11)
    + pct(b.sleep, b.人拍).padEnd(10) + pct(b.离家, b.人拍).padEnd(9) + pct(b.在岗, b.人拍).padEnd(9) + pct(b.在外, b.人拍));
}
for (const [k, 名] of [['wd-day', '工作日'], ['wd-end', '周末  ']]) {
  const b = 桶[k];
  console.log(名 + '  ' + String(b.人拍).padEnd(10) + pct(b.work, b.人拍).padEnd(9) + pct(b.idle, b.人拍).padEnd(11)
    + pct(b.sleep, b.人拍).padEnd(10) + pct(b.离家, b.人拍).padEnd(9) + pct(b.在岗, b.人拍).padEnd(9) + pct(b.在外, b.人拍));
}
{
  const a = 桶['wd-day'], b = 桶['wd-end'];
  const d = f => ((f(b) - f(a)) / f(a) * 100);
  console.log('周末 vs 工作日 相对差：上工 ' + d(x => x.work / x.人拍).toFixed(1) + '%'
    + '　离家 ' + d(x => x.离家 / x.人拍).toFixed(1) + '%'
    + '　在外 ' + d(x => x.在外 / x.人拍).toFixed(1) + '%');
  console.log('起床时刻：工作日 ' + 时刻(均(起床桶.工作日)) + '（sd ' + 均([sd(起床桶.工作日)]).toFixed(1) + ' 分, n=' + 起床桶.工作日.length + '）'
    + '　周末 ' + 时刻(均(起床桶.周末)) + '（sd ' + sd(起床桶.周末).toFixed(1) + ' 分, n=' + 起床桶.周末.length + '）'
    + '　差 ' + (均(起床桶.周末) - 均(起床桶.工作日)).toFixed(1) + ' 分');
}

console.log('\n═══ 问二 · 按天气分桶：「做什么」有区别吗 ═══');
console.log('天气   人·拍      上工     在家待着   睡觉     离家     在岗     在外');
for (const [k, 名] of [['clear', '晴    '], ['rain', '雨    ']]) {
  const b = 桶[k]; if (!b) continue;
  console.log(名 + '  ' + String(b.人拍).padEnd(10) + pct(b.work, b.人拍).padEnd(9) + pct(b.idle, b.人拍).padEnd(11)
    + pct(b.sleep, b.人拍).padEnd(10) + pct(b.离家, b.人拍).padEnd(9) + pct(b.在岗, b.人拍).padEnd(9) + pct(b.在外, b.人拍));
}
{
  const a = 桶.clear, b = 桶.rain;
  const 占比 = (x, f) => f(x) / x.人拍;
  const dif = f => (占比(b, f) - 占比(a, f)) * 100;
  console.log('雨天 − 晴天（**未控时段**，百分点）：上工 ' + dif(x => x.work).toFixed(2)
    + '　在家待着 ' + dif(x => x.idle).toFixed(2) + '　离家 ' + dif(x => x.离家).toFixed(2)
    + '　在外 ' + dif(x => x.在外).toFixed(2));
  console.log('\n按钟点分层（同一小时内雨 vs 晴，上工占比）：');
  console.log('钟点   雨天n    晴n     雨上工    晴上工    差(百分点)');
  for (let h = 0; h < 24; h++) {
    const R = 桶['h' + h + 'rain'], C = 桶['h' + h + 'clear'];
    if (!R || !C || R.人拍 < 40 || C.人拍 < 40) continue;
    const a1 = R.work / R.人拍, a2 = C.work / C.人拍;
    console.log(String(h).padStart(2, '0') + '时   ' + String(R.人拍).padEnd(9) + String(C.人拍).padEnd(9)
      + (a1 * 100).toFixed(1).padStart(6) + '%  ' + (a2 * 100).toFixed(1).padStart(7) + '%  '
      + ((a1 - a2) * 100).toFixed(2).padStart(8));
  }
  const 雨钟 = []; for (let h = 0; h < 24; h++) if (桶['h' + h + 'rain']) 雨钟.push({ h, n: 桶['h' + h + 'rain'].人拍 });
  雨钟.sort((x, y) => y.n - x.n);
  console.log('下雨拍数最集中的钟点：' + 雨钟.slice(0, 6).map(x => x.h + '时(' + x.n + ')').join('　'));
}

console.log('\n═══ 问三 · 兜底闲聊：接话答不答得上 ═══');
{
  /* 第 48 单改：接话池从「逐人 8 条万能句」改成「逐人 × 开口类别 各一组」，
     故本节的打印口径同步改成分组形态——改的是**读数怎么印**，不是判什么。 */
  const OP = Sim.CHAT_FB_OPEN, RP = Sim.CHAT_FB_REPLY, KI = Sim.CHAT_OPEN_KIND, KS = Sim.CHAT_KINDS;
  const 人 = Object.keys(OP);
  const 摊平 = k => [].concat(...KS.map(kd => (RP[k] && RP[k][kd]) || []));
  const 起手 = arr => { const m = {}; for (const s of arr) { const k = String(s).slice(0, 2); m[k] = (m[k] || 0) + 1; } return m; };
  const 展 = m => Object.entries(m).sort((a, b) => b[1] - a[1]);
  const 全 = arr => Object.values(起手(arr)).reduce((a, b) => a + b, 0);
  const 开口全 = [].concat(...人.map(k => OP[k]));
  const 接话全 = [].concat(...人.map(k => 摊平(k)));
  console.log('开口池：' + 人.length + ' 人 × ' + OP[人[0]].length + ' 条（平铺）；'
    + '接话池：' + 人.length + ' 人 × ' + KS.length + ' 组（第 48 单按开口类别分组）');
  const o = 起手(开口全), r = 起手(接话全);
  console.log('开口起手（前 2 字）种类 ' + Object.keys(o).length + ' / ' + 全(开口全) + ' 条，最高频 '
    + 展(o).slice(0, 3).map(x => x[0] + '×' + x[1]).join('　'));
  console.log('接话起手（前 2 字）种类 ' + Object.keys(r).length + ' / ' + 全(接话全) + ' 条，最高频 '
    + 展(r).slice(0, 5).map(x => x[0] + '×' + x[1]).join('　'));
  const 承接 = ['同感', '确实', '细想', '也是', '倒是', '说得', '还真', '这话', '可不是', '嗯'];
  const n = 接话全.filter(s => 承接.some(k => String(s).startsWith(k))).length;
  console.log('接话句以承接语起手的：' + n + ' / ' + 接话全.length + '（' + (n / 接话全.length * 100).toFixed(0) + '%）'
    + '　—— 第 37 单量的是顾云帆那一池（改前 1 / 8＝13%），改后按全城口径印');
  console.log('\n★ 逐条印出来自己看（起手词的机械统计说明不了「答不答得上」，语义只能目验）：');
  for (const k of 人) {
    console.log('【' + k + '·开口归类】' + OP[k].map((s, i) => (KS.indexOf(KI[k][i]) >= 0 ? KI[k][i] : '?')).join(' '));
    for (const kd of KS) console.log('【' + k + '·' + kd + '】' + (RP[k] && RP[k][kd] ? RP[k][kd].join(' ／ ') : '（缺组）'));
  }
}
