const {PURE, Sim} = require('./app.js');
let fails=0;
const ok=(cond,msg)=>{ if(!cond){fails++; console.log('FAIL:',msg);} else console.log(' ok :',msg); };

// --- 纯函数 ---
ok(PURE.decideLayout(390,844,'auto')==='compact-portrait','iPhone 竖屏→compact-portrait');
ok(PURE.decideLayout(844,390,'auto')==='compact-landscape','iPhone 横屏→compact-landscape');
ok(PURE.decideLayout(820,1180,'auto')==='medium','iPad 竖屏→medium');
ok(PURE.decideLayout(1440,900,'auto')==='expanded','桌面→expanded');
ok(PURE.decideLayout(300,600,'expanded')==='expanded','强制布局生效');
ok(PURE.fmtTime(8*60+5)==='08:05','fmtTime');
ok(PURE.weekdayName(0)==='一' && PURE.weekdayName(4*1440)==='五' && PURE.weekdayName(6*1440)==='日','weekday D1=一 D5=五 D7=日');
const from={x:0,y:0,w:10,h:10}, right={x:100,y:0,w:10,h:10}, below={x:0,y:100,w:10,h:10};
ok(PURE.navScore(from,right,1,0)<PURE.navScore(from,below,1,0),'空间寻焦：向右优先选右侧');
ok(PURE.navScore(from,right,-1,0)===Infinity,'反方向候选被排除');

// --- 模拟 8 天（含周五发薪、周日街市、D2 交租） ---
const w=Sim.makeWorld();
Sim.sendMessage(w,'a1','late');
Sim.sendMessage(w,'a2','cheer');
ok(w.credits===1,'短信额度扣减 3→1');
ok(Sim.sendMessage(w,'a3','eat') && !Sim.sendMessage(w,'a4','sleep'),'额度用尽后拒发');

// 先推进 1 小时，在日志被 400 条上限截断之前验证短信反应
for(let i=0;i<6;i++) Sim.step(w,10);
const early=w.log.map(e=>(e.thought||'')+e.text).join('\n');
ok(early.includes('绝不迟到'),'短信被读取并产生反应');

let sawSleepAll=new Set();
for(let i=0;i<8*144-6;i++){
  Sim.step(w,10);
  for(const a of w.agents){
    if(a.activity.type==='sleep') sawSleepAll.add(a.id);
    if(!isFinite(a.money)||!isFinite(a.hunger)||!isFinite(a.energy)){ok(false,'NaN in '+a.name);process.exit(1);}
    if(a.hunger<0||a.hunger>100||a.energy<0||a.energy>100){ok(false,'范围越界 '+a.name+' h'+a.hunger+' e'+a.energy);process.exit(1);}
  }
}
ok(true,'8 天无 NaN、状态始终在 0–100');
ok(sawSleepAll.size===4,'四人都睡过觉');
const text=w.log.map(e=>e.name+e.text+(e.thought||'')).join('\n');
ok(text.includes('发薪'),'周五发薪触发');
ok(text.includes('交租'),'交租日触发');
ok(text.includes('街市'),'周日街市有人去');
ok(text.includes('下起雨'),'导演层：雨触发过');
ok(text.includes('聊了几句'),'同屋闲聊发生过');
ok(w.log.length>=100,'日志量充足: '+w.log.length);
ok(w.credits===3,'跨天后额度重置为 3');
for(const a of w.agents) ok(a.money>-50,'负债有界: '+a.name+' ¥'+Math.round(a.money));
for(const a of w.agents) console.log('  ',a.name,'¥'+Math.round(a.money),'饱食',Math.round(100-a.hunger),'体力',Math.round(a.energy));
ok(Sim.sendCustomMessage(w,'a1','今晚吃点好的'),'自定义短信可发送');
ok(w.credits===2,'自定义短信扣额度');
for(let i=0;i<6;i++) Sim.step(w,10);
ok(w.log.map(e=>e.text).join('').includes('今晚吃点好的'),'自定义短信被读取');
// --- 种子化确定性 ---
{
  const A=Sim.makeWorld(12345), B=Sim.makeWorld(12345), C=Sim.makeWorld(54321);
  for(let i=0;i<2*144;i++){ Sim.step(A,10); Sim.step(B,10); Sim.step(C,10); }
  const sig=w2=>w2.log.map(e=>e.t+e.name+e.text+(e.thought||'')).join('|')+w2.agents.map(a=>a.id+Math.round(a.money)+'@'+a.anchor).join('|');
  ok(A.seed===12345 && typeof A.rng==='function','世界携带种子与随机源');
  ok(sig(A)===sig(B),'同种子两日完全一致');
  ok(sig(A)!==sig(C),'异种子产生不同命运');
}
// parseJsonLoose
ok(PURE.parseJsonLoose('```json\n{"a":1}\n```').a===1,'parseJsonLoose 剥围栏');
ok(PURE.parseJsonLoose('前言 {"reaction":"好"} 后记').reaction==='好','parseJsonLoose 截大括号');
ok(PURE.parseJsonLoose('不是json')===null && PURE.parseJsonLoose('{"x":}')===null,'parseJsonLoose 坏输入返回 null');
// --- 指标纯函数 ---
ok(Math.abs(PURE.entropy({a:1,b:1})-1)<1e-9,'熵：均匀两类=1比特');
ok(PURE.entropy({a:4})===0,'熵：单一类=0');
ok(PURE.gini([1,1,1,1])<1e-9,'基尼：完全平均=0');
ok(PURE.gini([0,0,0,10])>0.7,'基尼：极端集中>0.7');
// --- 节律分化 ---
{
  const w=Sim.makeWorld(1);
  ok(new Set(w.agents.map(a=>a.metab.hungerRate)).size>=3,'饥饿速率已分化');
  ok(new Set(w.agents.map(a=>a.metab.eatAt)).size>=3,'开饭阈值已分化');
  ok(new Set(w.agents.map(a=>a.metab.napAt)).size>=3,'小憩阈值已分化');
}
// --- 存档往返 ---
{
  const w=Sim.makeWorld(7);
  for(let i=0;i<300;i++) Sim.step(w,10);
  const s=Sim.serialize(w,{k:1});
  ok(typeof s==='string' && s.length>200,'序列化产出字符串');
  const r=Sim.hydrate(s);
  ok(!!r && r.meta && r.meta.k===1,'反序列化成功且带回 meta');
  const w2=r.world;
  const sg=x=>JSON.stringify(x.stats)+'|'+x.agents.map(a=>a.id+':'+a.money+':'+a.anchor+':'+a.hunger+':'+a.energy).join('|')+'|'+x.rngState;
  for(let i=0;i<300;i++){ Sim.step(w,10); Sim.step(w2,10); }
  ok(sg(w)===sg(w2),'存档续跑与原世界同命运');
  ok(Sim.hydrate('垃圾')===null && Sim.hydrate('{"sv":9}')===null,'坏档返回 null');
}
// --- 磨蹭错峰与当日去重 ---
{
  const w=Sim.makeWorld(11);
  ok(w.agents.every(a=>a.tempo && isFinite(a.tempo.durMul)),'四人磨蹭参数就位');
  const durs={};
  let prev=w.agents.map(a=>a.activity.type);
  for(let i=0;i<4320;i++){
    Sim.step(w,10);
    w.agents.forEach((a,j)=>{
      if(a.activity.type!==prev[j]){ (durs[a.id]=durs[a.id]||[]).push(w.t); prev[j]=a.activity.type; }
    });
  }
  ok(Object.keys(durs).length===4 && w.agents.every(a=>(durs[a.id]||[]).length>10),'活动切换可观测');
  const dayTexts={};
  let dup=0;
  (w.log||[]).forEach(e=>{
    if(!e||!e.name||!e.text) return;
    if(!(e.text.indexOf('工作中')===0||e.text.indexOf('回到工位')===0||e.text.indexOf('到岗开始工作')===0)) return;
    // 等价适配（附件C ※ 注）：独白正文在 e.thought 字段（e.text 仅为事件词），键补 thought，语义不降
    const k=e.name+'|'+Math.floor(e.t/1440)+'|'+e.text+'|'+(e.thought||'');
    if(dayTexts[k]) dup++; else dayTexts[k]=1;
  });
  ok(dup===0,'同人同日工作独白零复读');
  const s=Sim.serialize(w,{k:1});
  const d=JSON.parse(s);
  d.world.agents.forEach(a=>{ delete a.tempo; });
  delete d.world.saidDay;
  const r=Sim.hydrate(JSON.stringify(d));
  ok(!!r,'旧档（无新字段）可反序列化');
  for(let i=0;i<300;i++) Sim.step(r.world,10);
  ok(isFinite(r.world.t) && r.world.agents.every(a=>isFinite(a.hunger)),'旧档续跑 300 拍无异常');
}
// --- 外围角色与事件表（第 17 单） ---
{
  const roleOf=Sim.PEER_ROLE, tbl=Sim.PEER_EVENTS;
  const names=['work','clerk','trade','write'].map(k=>roleOf[k]);
  ok(names.join('/')==='组长/店长/客户/编辑','外围角色四个：'+names.join('/'));
  // 硬口径：不进 ROOMS/ANCHORS、不在地图上
  const mapText=Sim.ROOMS.map(r=>r.id+'|'+r.label).join('|')
    +'|'+Object.keys(Sim.ANCHORS).map(k=>k+'|'+Sim.ANCHORS[k].label+'|'+Sim.ANCHORS[k].s).join('|');
  ok(names.every(n=>mapText.indexOf(n)<0),'外围角色不进 ROOMS/ANCHORS');
  for(const k of ['work','clerk','trade','write']){
    const arr=tbl[k];
    ok(Array.isArray(arr) && arr.length>=5 && arr.length<=7, '事件表 '+k+' 条数 '+(arr||[]).length+'（口径 5–7）');
    const ks=new Set(arr.map(e=>e.k));
    ok(ks.has('good')&&ks.has('bad')&&ks.has('flat'),'事件表 '+k+' 好坏参半且有平淡档');
    ok(arr.every(e=>e.text&&e.thought&&e.card),'事件表 '+k+' 三字段齐全');
  }
}
// --- 外围事件触发口径与处境状态（第 17 单） ---
{
  const DAYS=20;
  const w=Sim.makeWorld(2026);
  const kindOf={}, textSet=new Set();
  for(const k in Sim.PEER_EVENTS) Sim.PEER_EVENTS[k].forEach(e=>{ kindOf[e.text]=e.k; textSet.add(e.text); });
  // 工作时段外沿（含 工作狂 −30 与 短信「别迟到」earlyWork −30 两档提前量），午休 12:00–13:00 挖空
  const WIN={a1:[8.5*60,18*60], a2:[9.5*60,19*60], a3:[8*60,18*60], a4:[9*60,17*60]};
  const perDay={}, hitBy={}, sawKind=new Set(), lastText={};
  let outOfWindow=0, seenLid=0, repeat=0;
  for(let i=0;i<DAYS*144;i++){
    Sim.step(w,10);
    for(const e of w.log){
      if(!e.lid || e.lid<=seenLid || !e.agent || !textSet.has(e.text)) continue;
      const mod=PURE.minuteOfDay(e.t), win=WIN[e.agent];
      if(!win || mod<win[0] || mod>=win[1] || (mod>=12*60 && mod<13*60)) outOfWindow++;
      perDay[e.agent+'|'+PURE.dayOf(e.t)]=(perDay[e.agent+'|'+PURE.dayOf(e.t)]||0)+1;
      hitBy[e.agent]=(hitBy[e.agent]||0)+1;
      sawKind.add(kindOf[e.text]);
      if(lastText[e.agent]===e.text) repeat++;      // 同人连着两次抽到同一条
      lastText[e.agent]=e.text;
    }
    seenLid=w.lidSeq;
  }
  ok(repeat===0,'同人相邻两次外围事件不复读（复读 '+repeat+' 次）');
  const hits=Object.keys(perDay).length;
  ok(hits>0,'20 天内外围事件触发过：'+hits+' 次');
  ok(Object.keys(hitBy).length===4,'四名住户都收到过外围事件：'+JSON.stringify(hitBy));
  ok(Object.values(perDay).every(v=>v===1),'一天至多一次（最大 '+Math.max(...Object.values(perDay))+'）');
  ok(outOfWindow===0,'全部落在该住户当天的工作时段内（越界 '+outOfWindow+' 次）');
  ok(sawKind.has('good')&&sawKind.has('bad')&&sawKind.has('flat'),'好／坏／平淡三档都出现过：'+[...sawKind].join('/'));
  // 处境状态字段：当天有效、跨天失效、坏输入不抛错
  const ag=w.agents[0], today=PURE.dayOf(w.t);
  ag.sit={k:'bad', from:'组长', text:'CR 被组长打回', day:today};
  const cur=Sim.currentSit(w,ag);
  ok(!!cur && cur.text==='CR 被组长打回' && cur.from==='组长','处境状态当天有效');
  ag.sit={k:'bad', from:'组长', text:'CR 被组长打回', day:today-1};
  ok(Sim.currentSit(w,ag)===null,'处境状态跨天自动失效');
  ok(Sim.currentSit(w,{})===null,'旧档缺 sit 字段返回 null，不判坏档');
  ok(Sim.currentSit(w,{sit:'x'})===null && Sim.currentSit(w,{sit:1})===null,'篡改档 sit 为原始类型不抛错');
  // 旧档兼容：抹掉 sit 与 flags.peerDay 仍可续跑
  const d=JSON.parse(Sim.serialize(w,null));
  d.world.agents.forEach(a=>{ delete a.sit; if(a.flags) delete a.flags.peerDay; });
  const r=Sim.hydrate(JSON.stringify(d));
  ok(!!r,'旧档（无 sit/peerDay）可反序列化');
  for(let i=0;i<300;i++) Sim.step(r.world,10);
  ok(isFinite(r.world.t) && r.world.agents.every(a=>isFinite(a.hunger)),'旧档续跑 300 拍无异常');
}
console.log(fails? ('\n'+fails+' FAILURES') : '\nALL PASS');
process.exit(fails?1:0);
