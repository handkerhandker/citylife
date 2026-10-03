// 第 123 单·坏档容错普查（只读诊断；进冒烟档 1）
//
// 打的是什么：**存档被写坏之后，产品自带的"坏档闸"（worldUsable）放行的档必须还跑得动**。
// 口径（与产品同一条契约）：
//   畸形档 → Sim.hydrate（不许抛错）→ 按**产品源码里的 worldUsable**（抠出来求值）过闸
//   · 不过闸 ⇒ 走产品既有的"挪 BAK＋开新城"路径，算合法结局；
//   · 过闸   ⇒ 必须能再跑 5 天不抛错。
// 为什么不是"hydrate 后必须能跑"：产品路径本来就会先过闸（svAgentUsable 白名单）。
//
// 本单用它现场抓到并修掉的三处（防回归点名）：
//   ① `w.saidDay` 被写成字符串/数字 ⇒ `pickV` 往字符串上挂属性，游戏循环当场崩（现在就地重建）；
//   ② `a.inbox` 里有坏元素（null）⇒ `decide()` 读 `m.id` 崩（现在闸拒收）；
//   ③ `a.personalLog` 里有坏元素（null）⇒ 角色卡对话框读 `e.t` 崩（现在闸拒收）。
//
// 用法：node tools/save-fuzz/probe.cjs [--天=400]
const fs = require('fs');
const path = require('path');
const 仓 = path.resolve(__dirname, '../..');
const { Sim } = require(path.join(仓, 'app.js'));
const src = fs.readFileSync(path.join(仓, 'city-life-framework.html'), 'utf8');

const 闸源 = (src.match(/const SV_WORK_KINDS=\{[\s\S]*?\n\}\nfunction worldUsable\(w\)\{[\s\S]*?\n\}/) || [''])[0];
if (!闸源) { console.log('FAIL：抠不到坏档闸源码（worldUsable）'); process.exit(1); }
const worldUsable = new Function('Sim', 闸源 + '\nreturn worldUsable;')(Sim);

const 参数 = {};
for (const a of process.argv.slice(2)) { const m = /^--([^=]+)=?(.*)$/.exec(a); if (m) 参数[m[1]] = m[2]; }
const 天 = Math.max(30, parseInt(参数['天'] || '400', 10) || 400);

function 造档() {
  const w = Sim.makeWorld(20260803);
  for (let d = 1; d <= 天; d++) {
    w.credits = 99;
    const 生日 = w.agents.find(x => Sim.inBirthday(w, x));
    Sim.sendMessage(w, (生日 || w.agents[(d - 1) % 4]).id, 生日 ? 'birthday' : 'cheer');
    for (let i = 0; i < 144; i++) Sim.step(w, 10);
  }
  return w;
}
const 底档 = JSON.parse(Sim.serialize(造档(), null));
const W = 底档.world;

const 坏值 = [null, '', 'x', 0, -1, 12345, [], {}, true];
const 坐标 = [];
for (let ai = 0; ai < 4; ai++) for (const k of Object.keys(W.agents[ai])) for (const v of 坏值) 坐标.push({ ai, k, v });
for (const k of Object.keys(W)) { if (k === 'agents') continue; for (const v of 坏值) 坐标.push({ k, v }); }
const 内部 = [
  { ai: 0, k: 'relYou', v: { v: 'x', day: -5 } }, { ai: 0, k: 'relYou', v: 999 },
  { ai: 0, k: 'rel', v: { a2: null } }, { ai: 0, k: 'rel', v: { a2: { v: 'x', day: null, heart: 'x' } } },
  { ai: 0, k: 'giftRecv', v: ['x'] }, { ai: 0, k: 'giftRecv', v: { t: 'x' } },
  { ai: 0, k: 'bdayCoYears', v: { a2: 'x' } }, { ai: 0, k: 'giftYears', v: { a3: 'x' } },
  { ai: 0, k: 'waiting', v: { t: 'x', line: 1 } }, { ai: 0, k: 'lastHeart', v: { lv: 9 } },
  { ai: 0, k: 'personalLog', v: [null] }, { ai: 0, k: 'personalLog', v: ['x'] }, { ai: 0, k: 'personalLog', v: [{}] },
  { ai: 0, k: 'inbox', v: [null] }, { ai: 0, k: 'inbox', v: ['x'] }, { ai: 0, k: 'inbox', v: [{}] },
  { ai: 0, k: 'flags', v: { x: 'y' } }, { ai: 0, k: 'week', v: { 信: 'x' } },
  { ai: 0, k: 'goal', v: { k: 'ghost', born: 'x', until: null } },
  { ai: 0, k: 'activity', v: { type: 'ghost', label: 5 } }, { ai: 0, k: 'rest', v: { bed: 'x', wake: -1 } },
  { k: 'log', v: [null] }, { k: 'log', v: [{}] }, { k: 'clips', v: [null] }, { k: 'clips', v: [{}] },
  { k: 'sentToday', v: [null] }, { k: 'saidDay', v: { a1: null } }, { k: 'saidDay', v: { a1: 'x' } },
  { k: 'stats', v: { act: 'x', pair: {}, rain: 0, pay: 0, rentPaid: 0, market: 0, maxGap: 0 } },
  { k: 'stats', v: { act: {}, pair: 'x', rain: 0, pay: 0, rentPaid: 0, market: 0, maxGap: 0 } },
];
for (const m of 内部) 坐标.push(m);

const 违规 = [];
let 拒收 = 0, 过闸 = 0, 丢档 = 0;
for (const c of 坐标) {
  const 档 = JSON.parse(JSON.stringify(底档));
  const 目标 = c.ai !== undefined ? 档.world.agents[c.ai] : 档.world;
  目标[c.k] = c.v;
  let s; try { s = JSON.stringify(档); } catch (e) { continue; }
  let w2 = null;
  try { const r = Sim.hydrate(s); w2 = r && r.world; }
  catch (e) { 违规.push(`hydrate 抛错：${c.ai !== undefined ? 'agents.' + c.k : c.k} ← ${String(e.message).slice(0, 80)}`); continue; }
  if (!w2) { 丢档++; continue; }
  if (!worldUsable(w2)) { 拒收++; continue; }
  过闸++;
  try { for (let i = 0; i < 720; i++) Sim.step(w2, 10); }
  catch (e) { 违规.push(`过闸后跑崩：${c.ai !== undefined ? 'agents.' + c.k : c.k}=${JSON.stringify(c.v).slice(0, 24)} ← ${String(e && e.message || e).slice(0, 80)}`); }
}
// 点名三处现场（防回归）
const 点名 = [];
{
  const 档 = JSON.parse(JSON.stringify(底档));
  档.world.saidDay = 'x';
  const { world } = Sim.hydrate(JSON.stringify(档));
  for (let i = 0; i < 720; i++) Sim.step(world, 10);
  点名.push(['saidDay 坏值就地重建', typeof world.saidDay === 'object' && world.saidDay !== null]);
}
{
  const 档 = JSON.parse(JSON.stringify(底档));
  档.world.agents[0].inbox = [null];
  const { world } = Sim.hydrate(JSON.stringify(档));
  点名.push(['inbox 坏元素被闸拒收', !worldUsable(world)]);
}
{
  const 档 = JSON.parse(JSON.stringify(底档));
  档.world.agents[0].personalLog = [null];
  const { world } = Sim.hydrate(JSON.stringify(档));
  点名.push(['personalLog 坏元素被闸拒收', !worldUsable(world)]);
}
const 点名坏 = 点名.filter(x => !x[1]);

console.log(`坏档普查：喂 ${坐标.length} 个畸形档（${天} 天底档）→ 拒收 ${拒收}／hydrate 丢档 ${丢档}／过闸 ${过闸}；违规 ${违规.length} 处`);
for (const l of 违规.slice(0, 10)) console.log('  ' + l);
for (const [名, 好] of 点名) console.log((好 ? ' ok : ' : ' FAIL: ') + '点名·' + 名);
if (违规.length || 点名坏.length) process.exit(1);
console.log('✔ 过闸的档全部跑得动；三处现场（saidDay／inbox／personalLog）都被正确处置');
