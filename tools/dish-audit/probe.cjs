// 第 170 单·「自己研究一道菜」取证（只读诊断，进冒烟档 1）
//
// 为什么要有它：这道闸挂在"在家做饭"那一支上、约每 5 天一次，而且**钱/饭/时长/锚点一个不改**
// （只加记录与文案）——世界指纹与逐拍比对都看不出它。想知道"真会不会发生、会不会重样、
// 会不会把行为带偏"，只能跑长的：
//   ① 400 天里每人都至少琢磨出 1 道（否则这道闸等于没做，判红）；
//   ② 同一人**零重样**（表长 === Set 大小）；
//   ③ 每人 ≤ DISH_POOL.length（24 道封顶，满了不再触发）；
//   ④ **确定性**：同种子跑两遍，dish 序列逐字相同（触发与取词全走哈希、零 rng）。
// 另印：首道出在入档第几天、封顶了几人——供交付件引用。
// 用法：node tools/dish-audit/probe.cjs [--天=400] [--种子=20260803,424242,777]
const path = require('path');
const { Sim } = require(path.resolve(__dirname, '../../app.js'));

const 参数 = {};
for (const a of process.argv.slice(2)) { const m = /^--([^=]+)=?(.*)$/.exec(a); if (m) 参数[m[1]] = m[2]; }
const 天 = Math.max(1, parseInt(参数['天'] || '400', 10) || 400);
const 种子表 = String(参数['种子'] || '20260803,424242,777').split(',').map(s => parseInt(s, 10)).filter(isFinite);
const 池长 = (Sim.DISH_POOL || []).length || 24;

console.log('口径：' + 天 + ' 天 × ' + 种子表.length + ' 种子；池长 ' + 池长 + ' 道；判据＝每人 ≥1／零重样／≤池长／同种子两遍逐字相同\n');
let 红 = 0;
const 判 = (名, ok, 读) => { if (!ok) 红++; console.log((ok ? ' ok  ' : ' FAIL ') + 名 + '：' + JSON.stringify(读)); };

for (const seed of 种子表) {
  const w = Sim.makeWorld(seed);
  const 首日 = {};
  for (let d = 1; d <= 天; d++) {
    for (let i = 0; i < 144; i++) Sim.step(w, 10);
    for (const a of w.agents) {
      const n = Array.isArray(a.dishes) ? a.dishes.length : 0;
      if (n && !首日[a.id]) 首日[a.id] = d;
    }
  }
  const 表 = w.agents.map(a => ({ id: a.id, n: (Array.isArray(a.dishes) ? a.dishes.length : 0), 菜: Array.isArray(a.dishes) ? a.dishes.slice() : [] }));
  const w2 = Sim.makeWorld(seed);
  for (let i = 0; i < 天 * 144; i++) Sim.step(w2, 10);
  const 表2 = w2.agents.map(a => (Array.isArray(a.dishes) ? a.dishes : []));
  判('[' + seed + '] 每人至少 1 道', 表.every(x => x.n >= 1), { 每人: 表.map(x => x.id + '=' + x.n), 首日 });
  判('[' + seed + '] 同一人零重样', 表.every(x => x.n === new Set(x.菜).size), 表.map(x => x.id + '=' + x.n));
  判('[' + seed + '] 每人 ≤ 池长', 表.every(x => x.n <= 池长), { 池长, 最多: Math.max(...表.map(x => x.n)) });
  判('[' + seed + '] 同种子两遍逐字相同（纯哈希、零 rng）', JSON.stringify(表.map(x => x.菜)) === JSON.stringify(表2),
    { 第一遍: 表.map(x => x.菜.join('／')), 第二遍: 表2.map(x => x.join('／')) });
}
console.log('\n自己研究一道菜：' + (红 ? (红 + ' 条不过') : '全绿'));
process.exit(红 ? 1 : 0);
