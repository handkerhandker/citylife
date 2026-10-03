// 第 115 单·玩家篇①期探针（只读诊断；进冒烟档 1，不进 gate.yml）
//
// 它量的是**你在他们心里的分量**（`ag.relYou`）在三种玩家节奏下怎么走：
//   A 每天一条 ／ B 隔天一条 ／ C 整月不发（然后回头看掉档）
// 判据（退出码）：① 发一条 +1；② 同一天只加一次；③ 生日当天那句 +3；④ 连着 3 天没信第 4 天起
// 每天 −1、**落到本档下限就停**；⑤ 默认（从不发信）不给任何人凭空建账。五条全绿才退 0。
// 用法：node tools/rel-audit/you-probe.cjs
const path = require('path');
const { Sim, PURE } = require(path.resolve(__dirname, '../../app.js'));

const 跑天 = (w, n) => { for (let i = 0; i < n * 144; i++) Sim.step(w, 10); };
const 档 = a => Sim.relYouGet(a) + '(' + Sim.relTierName(Sim.relYouGet(a)) + ')';
const 发 = (w, id, msg) => { w.credits = 99; return Sim.sendMessage(w, id, msg); };   // 探针要点满额度（世界每天只给 3 封）
let 红 = 0;
const ok = (好, 话) => { console.log((好 ? ' ok : ' : ' FAIL: ') + 话); if (!好) 红++; };

// ① 每天一条：四人各 +1/天
{
  const w = Sim.makeWorld(20260803);
  const 天 = [1, 2, 3].map(() => { w.agents.forEach(a => 发(w, a.id, 'cheer')); 跑天(w, 1); return w.agents.map(a => Sim.relYouGet(a)); });
  ok(天[0].every(v => v === 1) && 天[2].every(v => v === 3),
    'A·每天一条：四人三天后都到 3（实测 ' + 天[2].join('/') + '）');
  const 前=Sim.relYouGet(w.agents[0]);
  发(w, 'a1', 'cheer'); 发(w, 'a1', 'cheer');
  ok(Sim.relYouGet(w.agents[0])===前+1,
    '② 同一天连发两条只加一次（' + 前 + ' → ' + Sim.relYouGet(w.agents[0]) + '）');
}
// ③ 生日当天那句 +3
{
  const w = Sim.makeWorld(20260803), a = w.agents[0];
  w.t = Sim.thisYearBdayAt(w, a) + 60;
  发(w, 'a1', 'birthday');
  ok(Sim.relYouGet(a) === 3, '③ 生日当天发「生日快乐」＝ +3（实测 ' + Sim.relYouGet(a) + '）');
  发(w, 'a1', 'birthday');
  ok(Sim.relYouGet(a) === 3, '③ 同日再发不加（仍是 ' + Sim.relYouGet(a) + '）');
}
// ④ 隔天一条 / 整月不发：掉档与下限
{
  const w = Sim.makeWorld(20260803), a = w.agents[1];
  a.relYou = { v: 12, day: PURE.dayOf(w.t) };            // 12＝「点头之交」档内（10–19）
  跑天(w, 6);                                            // 断联 6 天：第 4 天起每天 −1，撞到本档下限就停
  ok(Sim.relYouGet(a) === 10, '④ 断联 6 天：12 → ' + Sim.relYouGet(a) + '（第 4 天起每天 −1，**停在「点头之交」档底 10**）');
  const 锚 = a.lastYouCold;
  ok(!!锚 && String(锚.tx).indexOf('好几天没收到你的消息') >= 0, '④ 断联第 5 天留一条"关系："日志（锚：' + (锚 && 锚.tx) + '）');
  a.relYou = { v: 40, day: PURE.dayOf(w.t) };            // 40＝「老友」档内（35–49）
  跑天(w, 12);
  ok(Sim.relYouGet(a) === 35, '④ 老友 40 上断联 12 天 → ' + Sim.relYouGet(a) + '（停在「老友」档底 35，不掉穿）');
  a.relYou = { v: 20, day: PURE.dayOf(w.t) - 10 };       // 熟档下限 20
  跑天(w, 10);
  ok(Sim.relYouGet(a) === 20, '④ 已在档底（熟 20）：断联 10 天仍是 ' + Sim.relYouGet(a) + '（一次都不掉）');
}
// ⑤ 默认路径：从不发信，谁都不该长出账
{
  const w = Sim.makeWorld(20260803);
  跑天(w, 30);
  const 有账 = w.agents.filter(a => a.relYou !== undefined).length;
  ok(有账 === 0, '⑤ 默认路径（从不发信）30 天：长出 `relYou` 的人 ' + 有账 + ' 个（应为 0——不给全城凭空长表）');
}
// 轨迹总览（给人看的）
{
  const w = Sim.makeWorld(20260803);
  const 线 = [];
  for (let d = 1; d <= 12; d++) {
    if (d % 2 === 1) Sim.sendMessage(w, 'a1', 'cheer');           // 隔天一条
    跑天(w, 1);
    线.push('D' + d + ' ' + 档(w.agents[0]));
  }
  console.log('轨迹（隔天一条给顾云帆）：' + 线.join(' | '));
}
// ⑥ 第 117 单·玩家篇②期：「等你回话」的窗口按档位
{
  const 表=[0,10,20,35,50].map(v=>Sim.等你天数({relYou:{v,day:1}}));
  ok(JSON.stringify(表)===JSON.stringify([2,2,3,4,5]),
    '②期·窗口表：生疏/点头之交 2 天 → 熟 3 → 老友 4 → 家人一样 5（实测 '+表.join('/')+' 天）');
  const w=Sim.makeWorld(20260803);
  ok(w.agents.every(a=>Sim.等你天数(a)===2),'②期·默认路径：没发过信的人人 2 天（不动默认轨迹）');
}
// ⑦ 第 117 单·玩家篇②期：角色卡的短信挂点带上"和这个号码的来往"（AI 据此换语气）
{
  const w=Sim.makeWorld(20260803), a=w.agents[0];
  a.relYou={v:30,day:1};
  console.log('⑦ 角色卡（短信挂点那一行）：和这个号码的来往 → '+Sim.relYouWord(a)
    +'；把账抹掉就是「'+Sim.relYouWord({})+'」');
  ok(Sim.relYouWord(a)==='熟（30）'&&Sim.relYouWord({})==='还没说上过话',
    '②期·那句"你在他心里"一处定义：有账＝熟（30）／空账＝还没说上过话');
}
// ⑧ 第 119 单·兜底回应也按档位（没有中转站时，玩家看到的就是这张表）
{
  const 读=v=>{
    const w=Sim.makeWorld(20260803), a=w.agents[0];
    if(v>0) a.relYou={v,day:1};
    w.credits=99; Sim.sendMessage(w,'a1','eat');
    for(let i=0;i<24;i++) Sim.step(w,10);
    const e=[...w.log].reverse().find(x=>x.type==='player'&&x.sms==='read'&&x.agent==='a1');
    return e?String(e.thought||''):'';
  };
  const 生=读(0), 熟=读(20);
  console.log('⑧ 同一条「记得吃饭」：生疏 → '+生+'；熟 → '+熟);
  ok(生===Sim.REACT.eat&&熟===Sim.REACT_NEAR.eat,'玩家篇收尾·兜底回应按档位：生疏走原表、熟走近版');
}
// ⑨ 第 121 单·玩家篇③期：生日回信也按档位（没有中转站时玩家看到的那张表）
{
  const 读=(v,当天,拆)=>{
    const w=Sim.makeWorld(20260803), a=w.agents[0];
    if(v>0) a.relYou={v,day:1};
    if(当天) w.t=Sim.thisYearBdayAt(w,a)+60;
    const 保=Sim.REACT_BDAY_NEAR.birthdayToday; if(拆) delete Sim.REACT_BDAY_NEAR.birthdayToday;
    try{ w.credits=99; Sim.sendMessage(w,'a1','birthday');
      for(let i=0;i<24;i++) Sim.step(w,10);
      const e=[...w.log].reverse().find(x=>x.type==='player'&&x.sms==='read'&&x.agent==='a1');
      return e?String(e.thought||''):''; }
    finally{ if(拆) Sim.REACT_BDAY_NEAR.birthdayToday=保; }
  };
  const 生=读(0,true), 熟=读(20,true), 拆=读(20,true,true);
  console.log('⑨ 生日当天「生日快乐」：生疏 → '+生+'；熟 → '+熟);
  ok(生===Sim.REACT.birthdayToday&&熟===Sim.REACT_BDAY_NEAR.birthdayToday&&拆===Sim.REACT.birthdayToday,
    '③期·生日回信按档位：生疏走原表、熟走近版、拆键回落原表');
}
// ⑩ 第 121 单·玩家篇③期：生日留言也按档位（21:00 那一句）
{
  const 留言=v=>{
    const w=Sim.makeWorld(20260803), a=w.agents[0];
    if(v>0) a.relYou={v,day:1};
    w.t=Sim.thisYearBdayAt(w,a)+12*60-10;      // 生日当天 20:50
    let 已=w.lidSeq, 出='';
    for(let i=0;i<3;i++){ Sim.step(w,10);
      for(const e of w.log){ if(e.lid<=已) continue; 已=e.lid;
        if(e.type==='player'&&e.sms==='note'&&e.agent==='a1') 出=String(e.text); } }
    return 出;
  };
  const 生=留言(0), 熟=留言(20);
  const 在池=(文,池)=>池.some(s=>文.indexOf(s)>=0);
  console.log('⑩ 生日留言：生疏 → '+生+'；熟 → '+熟);
  ok(在池(生,Sim.NOTE_LINES.bday)&&在池(熟,Sim.NOTE_LINES_NEAR.bday)&&生!==熟,
    '③期·生日留言按档位换池：生疏走原池、熟走近版');
}
console.log(红 ? ('✘ ' + 红 + ' 条判据不过')
  : '✔ 玩家篇：①期（涨／落／下限／一天一次／默认不长表）＋②期（窗口按档位／那句一处定义）＋收尾（兜底回应按档位）＋③期（生日回信／生日留言按档位）——全绿');
process.exit(红 ? 1 : 0);
