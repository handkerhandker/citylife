// 第 91 单·交心（星露谷 heart events 的落成）取证（只读诊断，不进 gate.yml、不判红）
//
// 为什么要有它：这道闸只在**关系两边都到「老友」（≥35）**之后才可能发生，而 30 天窗口里
// 关系最多长到 29 上下 ⇒ 门禁那两枚指纹**看不出来**（改前改后都一样）。想知道"这事在真实世界里
// 到底会不会发生、什么时候发生、会不会重复"，只能**跑长的**。本工具跑 N 天 × 3 种子，
// 逐拍扫新落的日志（`lid` 增量，不靠日志墙留痕）把每一场交心记下来：
//   · 每颗种子至少一场（否则判红：说明这道闸等于没做）
//   · **同一对只一场**（旗子是布尔，重复即 bug）
//   · 两侧旗子必须一致（A 记了、B 没记 ⇒ 不一致）
//
// 用法：node tools/heart-audit/probe.cjs [--天=400] [--种子=20260803,424242,777]
const path = require('path');
const { Sim } = require(path.resolve(__dirname, '../../app.js'));

const 参数 = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=?(.*)$/.exec(a);
  if (m) 参数[m[1]] = m[2];
}
const 天 = Math.max(1, parseInt(参数['天'] || '400', 10) || 400);
const 种子表 = String(参数['种子'] || '20260803,424242,777').split(',').map(s => parseInt(s, 10)).filter(isFinite);

console.log('口径：' + 天 + ' 天 × ' + 种子表.length + ' 种子（' + 种子表.join('／') + '）；交心＝关系两边都到「老友」'
  + '（≥' + Sim.HEART.at + '）之后的第一次同屋见面\n');
let 红 = 0;
for (const seed of 种子表) {
  const w = Sim.makeWorld(seed);
  const 场 = [];
  let 已 = 0;
  for (let i = 0; i < 天 * 144; i++) {
    const 起点 = w.lidSeq;
    Sim.step(w, 10);
    for (const e of w.log) {
      if (!(e.lid > 起点)) continue;
      const t = String(e.text || '');
      if (t.indexOf('交心：') !== 0) continue;
      场.push({ 天: Math.floor(e.t / 1440) + 1, 谁: e.name, 和: t.slice(4, t.indexOf('坐下来')) });
    }
  }
  /* 旗子对账：① 两侧必须一致；② 有旗子的对数 ＝ 日志里数出来的场数。
     重复只从**日志**里判：同一对出现 4 条（＝两场）才算重复——
     旗子是布尔，两侧各存一份，按旗子数必然"一条边看两次"，那不是重复（第一版就把它误判成重复了）。 */
  let 不一致 = 0;
  const 有旗 = new Set();
  const 见过 = new Set();
  for (const a of w.agents) {
    const R = a.rel || {};
    for (const id in R) {
      if (!R[id] || !R[id].heart) continue;
      const o = w.agents.find(x => x.id === id);
      if (!o) continue;
      if (!(o.rel && o.rel[a.id] && o.rel[a.id].heart)) 不一致++;
      有旗.add([a.id, id].sort().join('+'));
    }
  }
  const 计数 = {};
  for (const x of 场) { const k = [x.谁, x.和].sort().join('+'); 计数[k] = (计数[k] || 0) + 1; }
  const 对 = 有旗.size;
  const 重复 = Object.values(计数).filter(n => n > 2).length;
  const 对数_日志 = Object.values(计数).reduce((s, n) => s + n / 2, 0);
  const ok = 对 >= 1 && 不一致 === 0 && 重复 === 0 && Math.abs(对数_日志 - 对) < 1e-9;
  if (!ok) 红++;
  console.log((ok ? ' ok : ' : ' FAIL: ') + '[' + seed + '] 交心 ' + 对 + ' 对（日志 ' + 场.length + ' 条）'
    + '；旗子不一致 ' + 不一致 + ' 处；重复 ' + 重复 + ' 处');
  const 头 = 场.filter((x, i) => i % 2 === 0).slice(0, 3);
  console.log('        最早几场：' + (头.map(x => 'D' + x.天 + ' ' + x.谁 + '↔' + x.和).join('；') || '（一场都没有）'));
  // 顺带印终局的关系分布（这把尺第 88 单立的，这里是它的第一个用途）
  const 档 = {};
  for (const a of w.agents) for (const id in (a.rel || {})) {
    const n = Sim.relTierName(a.rel[id].v); 档[n] = (档[n] || 0) + 1;
  }
  console.log('        终局关系档位分布（12 条边）：' + Object.entries(档).map(([k, v]) => k + '×' + v).join(' '));
}
console.log('');
console.log(红 ? ('✘ ' + 红 + ' 颗种子不对——交心这层没接好') :
  ('✔ ' + 种子表.length + ' 颗种子 × ' + 天 + ' 天：每颗种子都真发生过交心，且同一对只一场、两侧旗子一致'));
process.exit(红 ? 1 : 0);
