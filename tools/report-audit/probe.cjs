// 第 172 单·「出门采访」取证（只读诊断，进冒烟档 1）
//
// 为什么要有它：采访只在**写稿人的工作日**里、每 5 天出一次，而且只改"在哪儿上班、叫什么、
// 说什么"——30 天窗口里能看见，但边界（题面确定性／采访点三选一／非采访日照旧在家）要看长的。
// 判据（400 天 × 3 种子）：
//   ① 每个种子都出过采访日（≈80 天；闸真的会开）；
//   ② 题面全部来自 REPORT_TOPICS；**同种子两遍逐字相同**（纯哈希、零 rng）；
//   ③ 采访日的锚点落在 REPORT_SPOTS 三处之一；
//   ④ 非采访日仍见过 home_desk（对照：采访不是"到处乱跑"）；
//   ⑤ 活动类型始终 work（只换地点与文案，不改活动种类）。
// 用法：node tools/report-audit/probe.cjs [--天=400] [--种子=20260803,424242,777]
const path = require('path');
const { Sim } = require(path.resolve(__dirname, '../../app.js'));

const 参数 = {};
for (const a of process.argv.slice(2)) { const m = /^--([^=]+)=?(.*)$/.exec(a); if (m) 参数[m[1]] = m[2]; }
const 天 = Math.max(1, parseInt(参数['天'] || '400', 10) || 400);
const 种子表 = String(参数['种子'] || '20260803,424242,777').split(',').map(s => parseInt(s, 10)).filter(isFinite);
const 题池 = Sim.REPORT_TOPICS || [];
const 点池 = new Set(Sim.REPORT_SPOTS || []);
let 红 = 0;
const 判 = (名, ok, 读) => { if (!ok) 红++; console.log((ok ? ' ok  ' : ' FAIL ') + 名 + '：' + JSON.stringify(读)); };

function 跑一遍(seed){
  const w = Sim.makeWorld(seed);
  const a4 = w.agents.find(a => a.id === 'a4');
  let 水位 = 0;
  const 采访天 = [];
  let 非采访日见家 = false, 采访日点ok = true, 类型乱 = 0;
  let 当天见点 = null, 当天见家 = false;
  for (let d = 1; d <= 天; d++) {
    当天见点 = null; 当天见家 = false;
    for (let i = 0; i < 144; i++) {
      Sim.step(w, 10);
      if (a4.activity && a4.activity.type !== 'work' && a4.activity.type !== 'sleep' && a4.activity.type !== 'nap' && a4.activity.type !== 'idle' && a4.activity.type !== 'eat' && a4.activity.type !== 'stroll' && a4.activity.type !== 'chat') 类型乱++;
      if (点池.has(a4.anchor) && !当天见点) 当天见点 = a4.anchor;
      if (a4.anchor === 'home_desk') 当天见家 = true;
    }
    for (const e of w.log) if (e.lid > 水位) {
      水位 = e.lid;
      const t = String(e.text || '');
      /* 同一天可能落多条到岗日志（中间回家吃饭又回来）——**按天去重**，
         否则"采访日 ~80 天"会被数成 ~175 条。 */
      if (t.indexOf('带着题目出门采访：') >= 0 && !(采访天.length && 采访天[采访天.length - 1].d === d))
        采访天.push({ d, 题: t.split('：')[1] || '', 点: 当天见点 || '' });
    }
    const 今采访 = 采访天.length > 0 && 采访天[采访天.length - 1].d === d;
    if (今采访 && !当天见点) 采访日点ok = false;
    if (!今采访 && 当天见家) 非采访日见家 = true;
  }
  return { 采访天, 非采访日见家, 采访日点ok, 类型乱 };
}

for (const seed of 种子表) {
  const 一 = 跑一遍(seed), 二 = 跑一遍(seed);
  const 题好 = 一.采访天.every(x => 题池.indexOf(x.题) >= 0);
  const 点好 = 一.采访天.every(x => 点池.has(x.点));
  const 同 = JSON.stringify(一.采访天) === JSON.stringify(二.采访天);
  判('[' + seed + '] 出过采访日（' + 一.采访天.length + ' 天）', 一.采访天.length >= 1, { 头三天: 一.采访天.slice(0, 3) });
  判('[' + seed + '] 题面来自题池且采访点在三处之一', 题好 && 点好 && 一.采访日点ok, { 题好, 点好, 采访日点ok: 一.采访日点ok });
  判('[' + seed + '] 同种子两遍逐字相同（纯哈希、零 rng）', 同, { 第一遍: 一.采访天.slice(0, 4), 第二遍: 二.采访天.slice(0, 4) });
  判('[' + seed + '] 非采访日仍见过 home_desk（对照）＋活动类型未新增', 一.非采访日见家 && 一.类型乱 === 0,
    { 非采访日见家: 一.非采访日见家, 类型乱: 一.类型乱 });
}
console.log('\n出门采访：' + (红 ? (红 + ' 条不过') : '全绿'));
process.exit(红 ? 1 : 0);
