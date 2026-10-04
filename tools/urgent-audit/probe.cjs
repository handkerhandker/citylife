// 第 171 单·加急短信取证（只读诊断，进冒烟档 1）
//
// 为什么要有它：加急的效果是**行为面**的（"能停的事先停"），浏览器里靠手点看不出边界，
// 得把三种对照摆在一起跑：
//   ① 加急 ＋ 能停的活动（stroll）：信在**两拍内**被读到，忙点被拉回；
//   ② 普通短信 ＋ 同样的活动：三拍内读不到（还挂在原活动上）；
//   ③ 加急 ＋ 停不住的活动（work）：三拍内也读不到（守"停不住就等忙完"）；
//   ④ 读到时的回话分两种口吻：能停⇒"你说急，手里的事先撂下了"，停不住⇒"手头这摊停不住"；
//   ⑤ 发送本身**不摇 rng**（`w.rngState` 前后相同）。
// 用法：node tools/urgent-audit/probe.cjs [--种子=20260803]
const path = require('path');
const { Sim } = require(path.resolve(__dirname, '../../app.js'));

const 参数 = {};
for (const a of process.argv.slice(2)) { const m = /^--([^=]+)=?(.*)$/.exec(a); if (m) 参数[m[1]] = m[2]; }
const 种子 = parseInt(参数['种子'] || '20260803', 10) || 20260803;
let 红 = 0;
const 判 = (名, ok, 读) => { if (!ok) 红++; console.log((ok ? ' ok  ' : ' FAIL ') + 名 + '：' + JSON.stringify(读)); };

function 摆(w, 型, 分钟){
  const ag = w.agents.find(a => a.id === 'a2');
  ag.activity = { type: 型, label: (型 === 'work' ? '工作中' : '测试中'), think: '' };
  ag.busyUntil = w.t + 分钟;
  ag.inbox.length = 0;
  return ag;
}
function 跑(型, urgent, 拍){
  const w = Sim.makeWorld(种子);
  const ag = 摆(w, 型, 600);
  Sim.sendCustomMessage(w, 'a2', '快回来', urgent);
  for (let i = 0; i < 拍; i++) Sim.step(w, 10);
  const 读 = w.log.filter(e => e.sms === 'read' && e.agent === 'a2');
  return { 读到: 读.length, 回话: (读[读.length - 1] || {}).thought || '', 还在等: ag.inbox.length };
}

const 一 = 跑('stroll', true, 2);
判('① 加急＋能停的活动：两拍内读到', 一.读到 === 1 && 一.还在等 === 0 && 一.回话.indexOf('你说急') >= 0, 一);
const 二 = 跑('stroll', false, 3);
判('② 普通短信＋同样的活动：三拍内读不到', 二.读到 === 0 && 二.还在等 === 1, 二);
const 三 = 跑('work', true, 3);
判('③ 加急＋停不住的活动（work）：三拍内也读不到', 三.读到 === 0 && 三.还在等 === 1, 三);
{
  const w = Sim.makeWorld(种子), ag = 摆(w, 'work', 600);
  Sim.sendCustomMessage(w, 'a2', '快回来', true);
  ag.busyUntil = w.t;          // 手工把班下掉（模拟"忙完了"），下一拍 decide 就会读
  Sim.step(w, 10);
  const 读 = w.log.filter(e => e.sms === 'read' && e.agent === 'a2');
  判('④ 停不住那一档的回话口吻：等忙完读到、话里说明"停不住"',
    (读[读.length - 1] || {}).thought && (读[读.length - 1].thought.indexOf('停不住') >= 0),
    { 读到: 读.length, 回话: (读[读.length - 1] || {}).thought || '' });
}
{
  const w = Sim.makeWorld(种子);
  const 前 = w.rngState;
  Sim.sendCustomMessage(w, 'a1', '测试', true);
  判('⑤ 发送本身不摇 rng（rngState 前后相同）', w.rngState === 前, { 前, 后: w.rngState });
}
console.log('\n加急短信：' + (红 ? (红 + ' 条不过') : '全绿'));
process.exit(红 ? 1 : 0);
