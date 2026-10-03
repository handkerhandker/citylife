// 第 107 单·B 档②「熟的人更常凑一起」的定标取证（只读诊断，不进 gate.yml、不判红）
//
// 量什么：把 `REL_CHAT_MUL`（同屋聊天的档位系数）**在内存里全部抹成 1**，与现行版跑同一批种子，
// 比"闲聊总次数"——30 天窗口看它对读数的影响有多小，400 天长跑看它的效果有多大。
// （闲聊次数＝`w.stats.pair` 各对求和，也就是门禁 sim30 里那个"社交"读数。）
//
// 用法：node tools/rel-audit/chat-mul.cjs [--天=30,400] [--种子=20260803,424242,777]
const path = require('path');
const { Sim } = require(path.resolve(__dirname, '../../app.js'));

const 参数 = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=?(.*)$/.exec(a);
  if (m) 参数[m[1]] = m[2];
}
const 天表 = String(参数['天'] || '30,400').split(',').map(s => parseInt(s, 10)).filter(isFinite);
const 种子表 = String(参数['种子'] || '20260803,424242,777').split(',').map(s => parseInt(s, 10)).filter(isFinite);

const 跑 = (seed, 天) => {
  const w = Sim.makeWorld(seed);
  for (let i = 0; i < 天 * 144; i++) Sim.step(w, 10);
  let 闲聊 = 0; for (const k of Object.keys(w.stats.pair)) 闲聊 += w.stats.pair[k];
  return 闲聊;
};
console.log('口径：同一批种子（' + 种子表.join('／') + '）；A＝现行（档位系数生效）／B＝把系数表全抹成 1');
console.log('覆盖：30 天窗口里关系刚长到「熟」（系数才刚生效）⇒ 影响很小；400 天才是它的真效果。\n');
for (const 天 of 天表) {
  let A = 0, B = 0;
  for (const s of 种子表) {
    A += 跑(s, 天);
    const 原表 = {}; for (const k of Object.keys(Sim.REL_CHAT_MUL)) { 原表[k] = Sim.REL_CHAT_MUL[k]; Sim.REL_CHAT_MUL[k] = 1; }
    B += 跑(s, 天);
    for (const k of Object.keys(原表)) Sim.REL_CHAT_MUL[k] = 原表[k];
  }
  console.log(' ' + 天 + ' 天 × ' + 种子表.length + ' 种子：闲聊 A ' + A + ' ／ B ' + B
    + ' ⇒ ' + ((A / B - 1) * 100).toFixed(1) + '%（' + (A - B >= 0 ? '+' : '') + (A - B) + ' 次）');
}
console.log('\n当前档位系数：' + Sim.REL_TIERS.map(t => t.name + '（' + t.lo + '）×' + Sim.REL_CHAT_MUL[t.lo]).join('　'));
