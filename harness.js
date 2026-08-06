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
// 第 19 单追加一：按时间排列的列表须打日期戳，否则跨天条目混叠（决策者实证：短信往来记录看似时间倒流）
ok(PURE.fmtStamp(8*60+5)==='D1 08:05','fmtStamp 首日：D1 08:05');
ok(PURE.fmtStamp(74*1440+4*60+40)==='D75 04:40' && PURE.fmtStamp(76*1440+3*60+30)==='D77 03:30','fmtStamp 跨天可分辨：D75 04:40 / D77 03:30');
ok(PURE.fmtStamp(74*1440+4*60+40)!==PURE.fmtStamp(75*1440+4*60+40),'同一时分不同日 → 时间戳不同（混叠即由此消除）');
ok(PURE.fmtStamp(0)==='D1 00:00' && PURE.fmtStamp(1439)==='D1 23:59','fmtStamp 日界两端');
ok(PURE.fmtStamp(1440)==='D2 00:00','fmtStamp 跨零点进位');
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
    ok(Array.isArray(arr) && arr.length===7, '事件表 '+k+' 条数 '+(arr||[]).length+'（补充指令二口径：每人 7 条）');
    const g1=arr.filter(e=>e.k==='good').length, b1=arr.filter(e=>e.k==='bad').length, f1=arr.filter(e=>e.k==='flat').length;
    // 逐人好坏相等（补充指令二）：全城对半会让两人结构性偏逆、两人结构性偏顺，
    // 30 天累积成境遇系统性分化，污染本单假说验收，故配平口径下沉到逐人
    ok(g1===b1,'事件表 '+k+' 逐人好坏相等：'+g1+' 好 / '+b1+' 坏');
    ok(f1===1,'事件表 '+k+' 恰好 1 条平淡档');
    // 铁律 3：外围角色是事件源不是人——事件条目只许有 k 与 text，不得携带独白/日程/画像等"人"的字段
    ok(arr.every(e=>typeof e.text==='string' && e.text && Object.keys(e).length===2),
       '事件表 '+k+' 每条仅 k+text 两字段（外围角色不得获得内心世界）');
  }
  const all=['work','clerk','trade','write'].reduce((a,k)=>a.concat(tbl[k]),[]);
  const f=all.filter(e=>e.k==='flat').length;
  ok(all.length===28 && f===4,'全城 28 条含 4 平：'+all.length+' 条 / '+f+' 平');
  // 文案唯一：四表互不相交是 ②「四人同挂同一条」恒为 0 的结构前提
  ok(new Set(all.map(e=>e.text)).size===28,'28 条文案互不重复（四表不相交）');
}
// --- 外围事件触发口径与处境状态（第 17 单） ---
{
  const DAYS=20;
  const w=Sim.makeWorld(2026);
  const textK={};
  for(const k in Sim.PEER_EVENTS) Sim.PEER_EVENTS[k].forEach(e=>{ textK[e.text]=e.k; });
  // 工作时段外沿（含 工作狂 −30 与 短信「别迟到」earlyWork −30 两档提前量）
  const WIN={a1:[8.5*60,18*60], a2:[9.5*60,19*60], a3:[8*60,18*60], a4:[9*60,17*60]};
  // 饭点那一小时挖空。第 22 单起饭点逐人化＝本人上班起点（含工作狂 −30，不含 earlyWork）
  // ＋ RHY_LUNCH_AFTER，四人互异；本表照 decide() 的算法按真值算出来，改常量不必改门禁。
  const LUNCH={}; for(const k in WIN) LUNCH[k]=0;
  { const base={a1:9*60, a2:10*60, a3:9*60-30, a4:9.5*60};   // startBase ＋ 工作狂 −30
    for(const k in base) LUNCH[k]=base[k]+Sim.RHY_LUNCH_AFTER; }
  const perDay={}, hitBy={}, sawKind=new Set(), lastText={}, prevSit={};
  let outOfWindow=0, repeat=0, logLeak=0, ttlBad=0;
  const logLen0=w.log.length;
  for(let i=0;i<DAYS*144;i++){
    Sim.step(w,10);
    for(const ag of w.agents){
      const s=ag.sit;
      const stamp=s?(s.until+'|'+s.text):'';
      if(s && stamp!==prevSit[ag.id]){                  // 新挂上一条（until 变化即为新事件）
        const mod=PURE.minuteOfDay(w.t), win=WIN[ag.id];
        const lu=LUNCH[ag.id];
        if(!win || mod<win[0] || mod>=win[1] || (mod>=lu && mod<lu+60)) outOfWindow++;
        if(s.until!==w.t+Sim.SIT_TTL) ttlBad++;         // 时效＝SIT_TTL（补充指令一裁定 14 小时）
        perDay[ag.id+'|'+PURE.dayOf(w.t)]=(perDay[ag.id+'|'+PURE.dayOf(w.t)]||0)+1;
        hitBy[ag.id]=(hitBy[ag.id]||0)+1;
        sawKind.add(textK[s.text]);
        if(lastText[ag.id]===s.text) repeat++;
        lastText[ag.id]=s.text;
      }
      prevSit[ag.id]=stamp;
    }
  }
  // 硬口径：外围角色不进日志墙——全部日志正文/独白里不得出现任何事件表措辞
  const allLog=w.log.map(e=>(e.name||'')+(e.text||'')+(e.thought||'')).join('\n');
  for(const t in textK){ if(allLog.indexOf(t)>=0) logLeak++; }
  ok(logLeak===0,'外围角色事件不进日志墙（泄漏 '+logLeak+' 条）');
  ok(w.log.length>logLen0,'日志墙照常有其他内容（'+w.log.length+' 条），非整体静默');
  const hits=Object.keys(perDay).length;
  ok(hits>0,'20 天内外围事件触发过：'+hits+' 次');
  ok(Object.keys(hitBy).length===4,'四名住户都收到过外围事件：'+JSON.stringify(hitBy));
  ok(Object.values(perDay).every(v=>v===1),'一天至多一次（最大 '+Math.max(...Object.values(perDay))+'）');
  ok(outOfWindow===0,'全部落在该住户当天的工作时段内（越界 '+outOfWindow+' 次）');
  ok(ttlBad===0,'时效一律为 SIT_TTL＝'+(Sim.SIT_TTL/60)+' 小时（偏差 '+ttlBad+' 次）');
  ok(Sim.SIT_TTL>=10*60 && Sim.SIT_TTL<=14*60,'SIT_TTL 落在任务书 10–14 小时口径内：'+(Sim.SIT_TTL/60)+' 小时');
  ok(repeat===0,'同人相邻两次外围事件不复读（复读 '+repeat+' 次）');
  ok(sawKind.has('good')&&sawKind.has('bad')&&sawKind.has('flat'),'好／坏／平淡三档都出现过：'+[...sawKind].join('/'));
  // 处境状态字段：至多 1 条、到点消失、坏输入不抛错
  ok(w.agents.every(a=>a.sit===undefined||a.sit===null||typeof a.sit==='object'),'每人至多挂 1 条（单字段，新的顶掉旧的）');
  const ag=w.agents[0];
  ag.sit={k:'bad', from:'组长', text:'CR 被组长打回，评语写了三行', i:0, until:w.t+60};
  ok((Sim.currentSit(w,ag)||{}).text==='CR 被组长打回，评语写了三行','处境状态时效内有效');
  ag.sit={k:'bad', from:'组长', text:'x', i:0, until:w.t};
  ok(Sim.currentSit(w,ag)===null,'处境状态到点自然消失');
  ok(Sim.currentSit(w,{})===null,'旧档缺 sit 字段返回 null，不判坏档');
  ok(Sim.currentSit(w,{sit:'x'})===null && Sim.currentSit(w,{sit:1})===null,'篡改档 sit 为原始类型不抛错');
  ok(Sim.currentSit(w,{sit:{text:'x'}})===null && Sim.currentSit(w,{sit:{text:'x',until:'abc'}})===null,'sit 缺/坏 until 一律判失效');
  // 旧档兼容：抹掉 sit 与 flags.peerDay 仍可续跑
  const d=JSON.parse(Sim.serialize(w,null));
  d.world.agents.forEach(a=>{ delete a.sit; if(a.flags) delete a.flags.peerDay; });
  const r=Sim.hydrate(JSON.stringify(d));
  ok(!!r,'旧档（无 sit/peerDay）可反序列化');
  for(let i=0;i<300;i++) Sim.step(r.world,10);
  ok(isFinite(r.world.t) && r.world.agents.every(a=>isFinite(a.hunger)),'旧档续跑 300 拍无异常');
}
// --- 闲聊话题派活（第 18 单·病症三） ---
{
  const POOL=Sim.TOPIC_POOL, N=Sim.TOPIC_RECENT;
  ok(Array.isArray(POOL) && POOL.length>=7 && POOL.length<=9,'TOPIC_POOL 7–9 类：'+(POOL||[]).length+' 类');
  ok(POOL.every(t=>typeof t==='string' && t.length>0),'TOPIC_POOL 每类均为非空字符串');
  ok(new Set(POOL).size===POOL.length,'TOPIC_POOL 无重复类目');
  ok(isFinite(N) && N>=1 && N<POOL.length,'TOPIC_RECENT='+N+' 落在 1..池长-1（否则无类可派）');
  // 频次过滤：全城最近 N 次派过的类不再派
  {
    const w=Sim.makeWorld(99);
    const seq=[]; for(let i=0;i<400;i++) seq.push(Sim.pickTopic(w));
    let near=0;
    for(let i=0;i<seq.length;i++) for(let k=1;k<=N && i-k>=0;k++) if(seq[i]===seq[i-k]) near++;
    ok(near===0,'最近 '+N+' 次用过的类不再派（近距复读 '+near+' 次）');
    ok(new Set(seq).size===POOL.length,'400 次派活覆盖全部 '+POOL.length+' 类：'+new Set(seq).size);
    ok(w.chatTopics.length===N,'记账窗口恒为 TOPIC_RECENT 长：'+w.chatTopics.length);
  }
  // 每条闲聊日志都带话题，且没有一类霸屏
  {
    const w=Sim.makeWorld(2027);
    for(let i=0;i<30*144;i++) Sim.step(w,10);
    const chats=w.log.filter(e=>e.type==='chat' && e.with);
    ok(chats.length>0 && chats.every(e=>POOL.indexOf(e.topic)>=0),'闲聊条目一律携带池内话题（'+chats.length+' 条）');
    const cnt={}; chats.forEach(e=>{ cnt[e.topic]=(cnt[e.topic]||0)+1; });
    const top=Math.max(...Object.values(cnt));
    ok(top<=Math.ceil(chats.length/POOL.length)+2,'无话题霸屏：最多一类 '+top+' 次 / 共 '+chats.length+' 次');
    // 旧档（无 chatTopics）兼容
    const d=JSON.parse(Sim.serialize(w,null));
    ok(Array.isArray(d.world.chatTopics),'chatTopics 随存档序列化');
    delete d.world.chatTopics;
    const r=Sim.hydrate(JSON.stringify(d));
    ok(!!r,'旧档（无 chatTopics）可反序列化');
    for(let i=0;i<600;i++) Sim.step(r.world,10);
    ok(isFinite(r.world.t) && r.world.agents.every(a=>isFinite(a.hunger)),'旧档续跑 600 拍无异常');
    // 篡改档：chatTopics 为畸形值不得抛错
    const bad=JSON.parse(Sim.serialize(w,null)); bad.world.chatTopics='x';
    const rb=Sim.hydrate(JSON.stringify(bad));
    for(let i=0;i<50;i++) Sim.step(rb.world,10);
    ok(Array.isArray(rb.world.chatTopics),'篡改档 chatTopics 非数组 → 就地重建，不抛错');
  }
}
// --- AI 文案层：DOM 层源码抽取求值（第 18 单；照 tools/voice-check 先例，被验的是生产源码原文） ---
{
  const fs=require('fs'), path=require('path');
  const src=fs.readFileSync(path.resolve(__dirname,'city-life-framework.html'),'utf8');
  const grab=(re,name)=>{ const m=src.match(re); if(!m){ ok(false,'源码抽取失败:'+name); return '""'; } return m[0]; };
  const vcState={world:null};
  const mk=new Function('Sim','state','return (function(){'
    +grab(/const AI_VOICE=\{[\s\S]*?\n\};/,'AI_VOICE')+'\n'
    +grab(/const SIT_MOOD=\{[\s\S]*?\};/,'SIT_MOOD')+'\n'
    +grab(/function hungerWord\(h\)\{[^\n]*\}/,'hungerWord')+'\n'
    +grab(/const OPEN_KINDS=\[[\s\S]*?\nfunction styleAssign\(ag, hook\)\{[\s\S]*?\n\}/,'styleAssign')+'\n'
    +grab(/const LEAD_INTERJ=\[[\s\S]*?\nfunction redoLead\(who, kind\)\{[\s\S]*?\n\}/,'方案乙闸')+'\n'
    +grab(/function agentCard\(ag, hook\)\{[\s\S]*?\n\}/,'agentCard')
    +'\nreturn {agentCard, styleAssign, SIT_MOOD, OPEN_KINDS, DIARY_OPEN_KINDS, leadsWithInterj, chatLeadBad, reOpenKind, redoLead, LEAD_INTERJ, LEAD_INTERJ_AMB};})()');
  const V=mk(Sim, vcState);
  const w=Sim.makeWorld(31337);
  for(let i=0;i<200;i++) Sim.step(w,10);
  vcState.world=w;                                  // agentCard 经 state.world 取当天处境，取卡前对齐

  // 病症一：卡上不得出现任何 PEER_EVENTS 事件原文（逐条正则扫，28 条全查）
  {
    const all=[];
    for(const k in Sim.PEER_EVENTS) Sim.PEER_EVENTS[k].forEach(e=>all.push(e));
    ok(all.length===28,'待扫事件文案 28 条：'+all.length);
    const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    let leak=0, moodMiss=0, cards=0;
    for(const ev of all){
      for(const ag of w.agents){
        ag.sit={k:ev.k, from:'X', text:ev.text, i:0, until:w.t+600};
        for(const hook of ['sms','chat','diary']){
          const card=V.agentCard(ag, hook); cards++;
          for(const other of all) if(new RegExp(esc(other.text)).test(card)) leak++;
          if(card.indexOf(V.SIT_MOOD[ev.k])<0) moodMiss++;
        }
      }
    }
    ok(leak===0,'角色卡零事件原文泄漏（'+cards+' 张卡 × 28 条正则，泄漏 '+leak+' 处）');
    ok(moodMiss===0,'角色卡照挂档位标签（缺失 '+moodMiss+' 张）');
    const ag=w.agents[0];
    ag.sit={k:'bad', from:'X', text:'CR 被组长打回，评语写了三行', i:0, until:w.t};   // 已过期
    ok(V.agentCard(ag,'diary').indexOf('今天的心境')<0,'处境过期 → 心境整行省略');
    delete ag.sit;
    ok(V.agentCard(ag,'diary').indexOf('今天的心境')<0,'从未挂过 → 心境整行省略');
    ag.sit={k:'不存在的档', from:'X', text:'x', i:0, until:w.t+600};
    ok(V.agentCard(ag,'diary').indexOf('今天的心境')<0,'篡改档档位不明 → 心境整行省略，不注入空标签');
    delete ag.sit;
    ok(['good','bad','flat'].every(k=>typeof V.SIT_MOOD[k]==='string' && V.SIT_MOOD[k]),'SIT_MOOD 三档标签齐备：'+['good','bad','flat'].map(k=>V.SIT_MOOD[k]).join('/'));
  }
  // 病症二：语气词起手闸
  {
    const bad=['欸你说这都几点了','欸你阳台那盆薄荷','欸你闻见没','诶你看见没','哎呀我跟你说',
               '「欸，你看这个」','  嘿，今天挺顺','哦，忘了说','啊，又是这样','唉，算了'];
    const good=['你闻见没','跑通了，收工。','3% 的概率而已。','今天欸了一声，没人理。',
                '窗台上的灰又厚了一层。','阳台那盆薄荷长疯了','','哈尔滨的雪。'];
    ok(bad.every(s=>V.leadsWithInterj(s)),'语气词起手全数拦下（'+bad.length+' 条）');
    ok(good.every(s=>!V.leadsWithInterj(s)),'正常开场零误伤（'+good.length+' 条）');
    ok(!V.leadsWithInterj(null) && !V.leadsWithInterj(undefined),'空输入不抛错、不误判');
    ok(V.chatLeadBad(['欸你说','嗯嗯']) && V.chatLeadBad(['跑通了','欸你闻见没']),'对白 A/B 两侧第一句都查');
    ok(!V.chatLeadBad(['跑通了','窗台上的灰又厚了']),'对白双方均正常开场则放行');
    const ag=w.agents[1];
    for(const hook of ['chat','diary']){
      const pool=(hook==='diary')?V.DIARY_OPEN_KINDS:V.OPEN_KINDS;
      ag.lastOpenKind=pool[0];
      const k=V.reOpenKind(ag,hook);
      ok(pool.indexOf(k)>=0 && k!==pool[0],hook+' 重生成由代码改派另一类：'+pool[0]+' → '+k);
    }
    ag.lastOpenKind='不在池里的类';
    ok(V.OPEN_KINDS.indexOf(V.reOpenKind(ag,'chat'))>=0,'lastOpenKind 不在池内时仍派出合法类目');
    ok(V.redoLead('沈小满','直接说事').indexOf('沈小满')===0,'重生成指令点名到人');
  }
  // 第 19 单追加二：「哈」这条缝 —— 判据只看「哈」后面跟的是标点还是汉字，不看后面接的哪个词
  {
    // 决策者实证的两条原文（v29 线上，沈小满回信），必须拦下
    const real=['哈？买房？…你谁啊，老给我发短信，是认识我吗？还是发错了？',
                '哈，这话说得跟我妈似的…你谁啊，老发这种没头没尾的，别是发错人了吧？'];
    ok(real.every(s=>V.leadsWithInterj(s)),'决策者实证的两条「哈」起手回信全数拦下');
    // 拦：哈＋标点 / 哈＋空白 / 全句一个哈 / 哈哈 / 哈喽 / 被引号包住
    const hit=['哈？买房？','哈，这话说得','哈！真的假的','哈。行吧','哈 你说呢','哈',
               '哈哈，笑死','哈哈哈，绝了','哈喽，在吗','「哈？」','（哈，那算了）','"哈！"'];
    // 放行：哈＋汉字＝实词（任务书点名的三个）＋哈在句中＋正常开场
    const pass=['哈尔滨的雪下得比这儿大','哈欠打了三个，眼泪都出来了','哈密瓜切了半个放冰箱',
                '今天被她一句话逗得哈哈大笑','说完他哈了一口气','跑通了，收工。',
                '哈尔滨、哈欠、哈密瓜，三个词都不该被拦'];
    const missA=hit.filter(s=>!V.leadsWithInterj(s));
    const missB=pass.filter(s=>V.leadsWithInterj(s));
    ok(missA.length===0,'「哈」起手全数拦下（'+hit.length+' 条）'+(missA.length?('：漏 '+missA.join('｜')):''));
    ok(missB.length===0,'「哈」实词零误伤（'+pass.length+' 条）'+(missB.length?('：误伤 '+missB.join('｜')):''));
    // 结构判据的底：拦不是因为出现了「哈」，而是因为「哈」后面是标点或句末
    ok(V.leadsWithInterj('哈？') && !V.leadsWithInterj('哈尔滨'),'同一个字，后跟标点则拦、后跟汉字则放行');
    ok(!V.leadsWithInterj('买房？哈，你说呢'),'「哈」在句中不拦（人味留着）');
    ok(V.redoLead('沈小满','直接说事').indexOf('哈')>=0,'重生成指令已把「哈」列进不许用的起手字');
    // 歧义表本身的形态：只收真有实词冲突的字；无冲突的字应留在主表用单字判
    ok(Array.isArray(V.LEAD_INTERJ_AMB) && V.LEAD_INTERJ_AMB.length>0,'歧义单字表已登记（'+V.LEAD_INTERJ_AMB.join('／')+'）');
    ok(V.LEAD_INTERJ_AMB.every(c=>V.LEAD_INTERJ.indexOf(c)<0),'歧义字不得同时留在主表（否则单字直判、结构闸失效）');
    ok(V.LEAD_INTERJ.every(s=>s.length>=1 && V.LEAD_INTERJ_AMB.every(c=>s!==c)),'主表条目与歧义表零重叠');
  }
  // 病症四：日记挂点与对白挂点分家
  {
    ok(V.DIARY_OPEN_KINDS.length===4 && V.OPEN_KINDS.length===4,'两池均为 4 类（styleAssign 措辞写死「四类」）');
    ok(V.DIARY_OPEN_KINDS.every(k=>k.indexOf('对方')<0),'日记池零对话类目：'+V.DIARY_OPEN_KINDS.join('／'));
    ok(V.DIARY_OPEN_KINDS.indexOf('直接问对方')<0 && V.DIARY_OPEN_KINDS.indexOf('接对方上次的话往下聊')<0,'日记池已剔除「直接问对方」「接对方上次的话往下聊」');
    ok(V.OPEN_KINDS.indexOf('直接问对方')>=0 && V.OPEN_KINDS.indexOf('接对方上次的话往下聊')>=0,'对白池四类零改动（回归）');
    let dBadKind=0, dZhao=0, cKinds=new Set(), cZhao=0;
    for(let n=0;n<40;n++) for(const ag of w.agents){
      const d=V.styleAssign(ag,'diary');
      if(d.indexOf('直接问对方')>=0 || d.indexOf('接对方上次的话往下聊')>=0) dBadKind++;
      if(d.indexOf('轮到你用招牌起手式了')>=0 || d.indexOf('本次允许用一次你的招牌起手式')>=0) dZhao++;
      const c=V.styleAssign(ag,'chat');
      V.OPEN_KINDS.forEach(k=>{ if(c.indexOf('【'+k+'】')>=0) cKinds.add(k); });
      if(c.indexOf('轮到你用招牌起手式了')>=0) cZhao++;
    }
    ok(dBadKind===0,'日记挂点 160 次派活零对话类目（越界 '+dBadKind+' 次）');
    ok(dZhao===0,'日记挂点零招牌许可（发出 '+dZhao+' 次）');
    ok(cKinds.size===4,'对白挂点仍走满四类（'+cKinds.size+' 类，回归）');
    ok(cZhao>0,'对白挂点招牌配额仍在发放（'+cZhao+' 次，回归）');
    const card=V.agentCard(w.agents[0],'diary');
    ok(card.indexOf('日记是写给自己的')>=0,'日记卡写明招牌不适用的理由');
  }
  // 病症四：日记提示词五条铁律（逐字取生产 runReflection 表达式求值）
  {
    const tpl=grab(/'都市生活模拟《云港小事》第'\+day\+'天深夜[\s\S]*?"a4":"\.\.\."\}'/,'日记提示词');
    const p=new Function('day','cards','return '+tpl)(1,'CARDS');
    const musts=['只写给自己看','不得出现第二人称','不得提问','不得复述别人说过的话','不得出现对白结构'];
    const miss=musts.filter(s=>p.indexOf(s)<0);
    ok(miss.length===0,'日记提示词五条铁律齐备'+(miss.length?('：缺 '+miss.join('、')):''));
    ok(p.indexOf('今日片段')>=0 && p.indexOf('那些全是你自己心里的话')>=0,'日记提示词点破「今日片段是自己的心里话」');
  }
  // 病症三：对白提示词注入派定话题（逐字取生产 enhanceChat 表达式求值）
  {
    const tpl=grab(/'都市生活模拟：两位合租室友在'\+\(loc\?loc\.label:'路上'\)[\s\S]*?"b_mem":"\.\.\."\}'/,'对白提示词');
    const build=new Function('loc','e','agentCard','a','b','return '+tpl);
    const A=w.agents[0], B=w.agents[1], card=(x,h)=>V.agentCard(x,h);
    const withT=build({label:'客厅'}, {topic:'阳台与晾晒'}, card, A, B);
    ok(withT.indexOf('本次话题由系统指定：【阳台与晾晒】')>=0,'对白提示词写入代码派定的话题');
    ok(withT.indexOf('不许跑到别的类去')>=0,'对白提示词把话题定为硬边界');
    const noT=build({label:'客厅'}, {}, card, A, B);
    ok(noT.indexOf('本次话题由系统指定')<0,'旧档条目无 topic → 整句省略，回落 v28 行为');
  }
}
// --- 时间戳全站排查（第 19 单追加一）：按时间排列的列表一律不得只印 HH:MM ---
{
  const fs=require('fs'), path=require('path');
  const src=fs.readFileSync(path.resolve(__dirname,'city-life-framework.html'),'utf8');
  // 四处按时间排列的列表渲染点：日志墙/侧栏/短信往来记录（共用 logLine）、画布浮层、角色页最近记录
  const sites=[
    [/li\.innerHTML='<span class="lt num">'\+PURE\.fmtStamp\(e\.t\)/, 'logLine（日志墙＋侧栏＋短信往来记录三处共用）'],
    [/mini\.textContent=PURE\.fmtStamp\(e\.t\)/, '画布浮层最近两条'],
    [/'<li><span class="lt num">'\+PURE\.fmtStamp\(e\.t\)/, '角色页弹窗·最近记录'],
    [/'已存 · '\+PURE\.fmtStamp\(lastSaveInfo\.t\)/, '存档信息行（既有先例，已并入同一格式函数）'],
  ];
  for(const [re,name] of sites) ok(re.test(src), '时间戳已打日期：'+name);
  // 反向：全站不得再有「列表条目只印 HH:MM」。顶栏时钟是当前时刻、非列表，且旁边 #tb-day 已印 D 号，故豁免。
  const bare=(src.match(/PURE\.fmtTime\(/g)||[]).length;
  const inStamp=(src.match(/fmtStamp\(t\)\{ return 'D'\+PURE\.dayOf\(t\)\+' '\+PURE\.fmtTime\(t\); \}/g)||[]).length;
  const clock=(src.match(/\$\('#tb-clock'\)\.textContent=PURE\.fmtTime\(w\.t\);/g)||[]).length;
  ok(bare===inStamp+clock, '裸 PURE.fmtTime 仅剩 fmtStamp 内部与顶栏时钟两处（实测 '+bare+' 处 = '+inStamp+' + '+clock+'）');
}
// --- 同锚错开落位表（第 19 单）：DOM 层源码抽取求值，被验的是生产源码原文 ---
{
  const fs=require('fs'), path=require('path');
  const src=fs.readFileSync(path.resolve(__dirname,'city-life-framework.html'),'utf8');
  const grab=(re,name)=>{ const m=src.match(re); if(!m){ ok(false,'源码抽取失败:'+name); return ''; } return m[0]; };
  const vcState={world:null};
  const R=new Function('Sim','state','return (function(){'
    +grab(/const APT=\{[^}]*\};/,'APT')+'\n'
    +grab(/const PIX_SOLID=new Set\(\[[^\]]*\]\);/,'PIX_SOLID')+'\n'
    +grab(/function pixStandPos\(v\)\{[\s\S]*?\n\}/,'pixStandPos')+'\n'
    +grab(/const STAND_SPOTS=\{[\s\S]*?\nfunction standSpot\(ag\)\{[\s\S]*?\n\}/,'STAND_SPOTS')+'\n'
    +grab(/const PLAZA=\{[^}]*\};/,'PLAZA')+'\n'
    +grab(/const PLAZA_WAY=\{[^}]*\};/,'PLAZA_WAY')+'\n'
    +grab(/const SHORE_Y=\d+;/,'SHORE_Y')+'\n'
    +'return {STAND_SPOTS, standSpot, pixStandPos, PIX_SOLID, PLAZA, PLAZA_WAY, SHORE_Y};})()');
  const V=R(Sim, vcState);
  const w=Sim.makeWorld(90210);
  vcState.world=w;
  const N=w.agents.length;
  const ROOM={}; for(const r of Sim.ROOMS) ROOM[r.id]=r;

  // 理论最大同占 ≥2 的锚点 ＝ 多人可同时被派去的功能位（口径见交付件第三章普查表）
  const MULTI=['home_table','home_tv','kitchen','store_counter','park_bench','river_walk','market'];
  const SOLO=['home_desk','bed1','bed2','bed3','bed4','desk1','desk2','store_shelf'];
  const miss=MULTI.filter(k=>!Array.isArray(V.STAND_SPOTS[k]));
  ok(miss.length===0,'多人锚全部登记站位表'+(miss.length?('：缺 '+miss.join('、')):'（'+MULTI.length+' 处）'));
  ok(Object.keys(V.STAND_SPOTS).every(k=>!!Sim.ANCHORS[k]),'站位表零幽灵锚（键全部见于 ANCHORS）');
  ok(SOLO.every(k=>!V.STAND_SPOTS[k]),'单人锚不登记站位（床/工位/写作角/货架）');
  const wrongN=MULTI.filter(k=>(V.STAND_SPOTS[k]||[]).length!==N);
  ok(wrongN.length===0,'每张站位表恰 '+N+' 位＝住户人数'+(wrongN.length?('：'+wrongN.join('、')):''));

  // 站位几何：钳制空操作 + 精灵包围盒落在所属房间内
  const pts=[];
  let solidHit=0, outRoom=0;
  for(const k of MULTI){
    const a=Sim.ANCHORS[k];
    (V.STAND_SPOTS[k]||[]).forEach((d,i)=>{
      const x=a.x+0.5+d[0], y=a.y+0.5+d[1];
      const q=V.pixStandPos({x,y});
      if(q.x!==x||q.y!==y) solidHit++;                       // 钳制一旦生效即可能把两人重新并到一处
      const r=ROOM[a.room];
      if(r){ if(!((x-0.5)>=r.x && (x+0.5)<=r.x+r.w && (y-1.5)>=r.y && (y+0.5)<=r.y+r.h)) outRoom++; }
      pts.push({k,i,x,y,room:a.room});
    });
  }
  ok(solidHit===0,'每个站位的脚底格均非实体格（钳制恒为空操作，'+solidHit+' 处命中）');
  ok(outRoom===0,'精灵包围盒（横 1 格纵 2 格）全落所属房间内（越界 '+outRoom+' 处）');

  // market：全部站位留在《云港城市总规》T 竖净道，且零触岸线行 23（总规五.2 判例）
  {
    const a=Sim.ANCHORS.market; let bad=0, shore=0;
    for(const d of V.STAND_SPOTS.market){
      const x=a.x+0.5+d[0], y=a.y+0.5+d[1];
      if(!((x-0.5)>=V.PLAZA_WAY.x && (x+0.5)<=V.PLAZA_WAY.x+V.PLAZA_WAY.w)) bad++;
      if(!((y-1.5)>=V.PLAZA.y && (y+0.5)<=V.PLAZA.y+V.PLAZA.h)) bad++;
      if((y+0.5)>V.SHORE_Y) shore++;
    }
    ok(bad===0,'街市站位全落 T 竖净道（列 '+V.PLAZA_WAY.x+'–'+(V.PLAZA_WAY.x+V.PLAZA_WAY.w-1)+'）与广场行内（越界 '+bad+' 处）');
    ok(shore===0,'街市站位零触岸线行 '+V.SHORE_Y+'（总规五.2 判例，'+shore+' 处）');
  }

  // 两两间距：同房间内一切可同时在场的站位；同下标的不同锚＝同一个人，不可能同时在场，故豁免
  // 第二条判据＝名牌不得压人身：名牌画在精灵顶（脚底 y −2 格）。若两人几乎同列（|Δx|<1）
  // 且纵向错开不足 2.5 格，靠下者的名牌就正落在靠上者的身上——精灵虽已分开，观感仍是「叠着」。
  {
    let near=0, chip=0, worst=1e9, worstMsg='';
    const push=(A,B,m)=>{
      const dx=Math.abs(A.x-B.x), dy=Math.abs(A.y-B.y), d=Math.hypot(dx,dy);
      if(d<worst){worst=d;worstMsg=m;}
      if(d<1) near++;
      if(dx<1 && dy<2.5) chip++;
    };
    for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
      const A=pts[i],B=pts[j];
      if(A.room!==B.room) continue;
      if(A.i===B.i) continue;                                 // 同下标＝同一个人
      push(A,B,A.k+'#'+A.i+'↔'+B.k+'#'+B.i);
    }
    for(const s of SOLO){                                     // 单人锚显示点亦不得与站位撞车
      const a=Sim.ANCHORS[s], X={x:a.x+0.5,y:a.y+0.5};
      for(const p of pts){ if(p.room!==a.room) continue; push(X,p,s+'↔'+p.k+'#'+p.i); }
    }
    ok(near===0,'同房间可同时在场的落点两两 ≥1 格（最近一对 '+worst.toFixed(2)+' 格：'+worstMsg+'）');
    ok(chip===0,'零「名牌压人身」组合（近同列且纵错<2.5 格的 '+chip+' 对）');
  }

  // 派活：四人同锚必得四个互不相同的站位；未登记锚零偏移；篡改档陌生住户不抛错
  {
    let dup=0;
    for(const k of MULTI){
      const seen=new Set();
      for(const ag of w.agents){ ag.anchor=k; const s=V.standSpot(ag); const key=s[0]+','+s[1]; if(seen.has(key)) dup++; seen.add(key); }
    }
    ok(dup===0,'四人同处一锚必得四个互不相同的站位（重复 '+dup+' 处）');
    let zero=0;
    for(const s of SOLO){ for(const ag of w.agents){ ag.anchor=s; const p=V.standSpot(ag); if(p[0]!==0||p[1]!==0) zero++; } }
    ok(zero===0,'未登记锚（单人锚）一律零偏移，显示落点与本单前逐字一致（越界 '+zero+' 处）');
    const ghost={id:'zzz', anchor:'home_table'};              // 不在 agents 数组里（篡改档/旧档）
    const g=V.standSpot(ghost);
    ok(Array.isArray(g)&&g.length===2,'陌生住户取站位不抛错，落回首位');
    ok(V.standSpot({anchor:'不存在的锚'})[0]===0,'陌生锚零偏移');
    ok(V.standSpot(null)[0]===0,'空住户零偏移');
  }
  for(const ag of w.agents) ag.anchor=ag.bed;                 // 复原，免污染后续（本块已是文末）
}
// --- 每日剪辑·选材层（第 21 单） ---
{
  const fs=require('fs'), path=require('path');
  const src=fs.readFileSync(path.resolve(__dirname,'city-life-framework.html'),'utf8');
  const clipRaw=(src.match(/\/\*CLIP-START\*\/[\s\S]*?\/\*CLIP-END\*\//)||[''])[0];
  ok(clipRaw.length>2000,'CLIP 段可抽取（'+clipRaw.length+' 字）');
  // 断言的是**代码**不是注释：本段注释里成段写着「零 rng」「不写 w.stats」，
  // 不剥注释的话这几条断言会被自己的说明文字命中（首次编写时实测踩中）。
  const clipSrc=clipRaw.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"])\/\/.*$/gm,'$1');
  ok(/function clipTick\(w\)\{/.test(clipSrc) && /function clipClose\(w,sh\)\{/.test(clipSrc),
     '剥注释后代码仍完整（剥过头会让下面几条断言变成空转）');

  // 硬口径 3 · 只许读、不许摇：判据立在源码原文上（照走位规矩三先例——行为断言挡不住下一单再写一次）
  ok(!/\brng\b/.test(clipSrc),'剪辑层代码零 rng 引用（含 w.rng／pick／pickV 一概不得出现）');
  ok(!/\bpickV?\s*\(/.test(clipSrc),'剪辑层代码零抽词调用');
  ok(!/w\.stats/.test(clipSrc),'剪辑层代码零 w.stats 触碰（指纹里 stats 逐字节参与哈希）');
  ok(!/\bag\.[A-Za-z]+\s*=[^=]/.test(clipSrc),'剪辑层代码零住户字段写入（只读住户，账挂世界）');

  // 硬口径 3 · 运行期隔离实验：同种子两个世界推到日切前一拍，只让 A 结算、B 不结算，
  // 比较那一拍各自摇了几次 rng。相等即证明「结算」这件事本身零消耗。
  {
    const S=4242, A=Sim.makeWorld(S), B=Sim.makeWorld(S);
    let guard=0;
    while(PURE.minuteOfDay(A.t+10)!==Sim.CLIP_CUT && guard++<3000){ Sim.step(A,10); Sim.step(B,10); }
    ok(guard<3000,'推到日切前一拍');
    B.clipDay.d=Sim.clipDayOf(B.t+10);                 // 对照组：日表已是新一窗，那一拍不会触发结算
    const nA=A.clips.length, nB=B.clips.length;
    let ca=0, cb=0;
    const ra=A.rng, rb=B.rng;
    A.rng=function(){ ca++; return ra(); };
    B.rng=function(){ cb++; return rb(); };
    Sim.step(A,10); Sim.step(B,10);
    ok(A.clips.length===nA+1 && B.clips.length===nB,'实验成立：实验组结算了 1 条、对照组 0 条');
    ok(ca===cb,'日切结算那一拍零额外 rng 消耗（实验组 '+ca+' 次 vs 对照组 '+cb+' 次）');
    ok(A.rngState===B.rngState,'那一拍过后随机源状态逐位相同（rng 流零位移）');
  }

  // 日切口径：4 点必须落在「全城最晚就寝」与「最早起床」之间，否则谁的夜里会被切成两半
  {
    const w=Sim.makeWorld(20260803);
    const prev={}, onset={}, wake={};
    for(const a of w.agents) prev[a.id]=a.activity.type;
    for(let i=0;i<30*144;i++){
      Sim.step(w,10);
      const cd=Sim.clipDayOf(w.t);
      for(const a of w.agents){
        const s=a.activity.type==='sleep', p=prev[a.id]==='sleep';
        if(s&&!p) onset[a.id+'|'+cd]=(onset[a.id+'|'+cd]||0)+1;
        if(!s&&p)  wake[a.id+'|'+cd]=(wake[a.id+'|'+cd]||0)+1;
        prev[a.id]=a.activity.type;
      }
    }
    const oBad=Object.keys(onset).filter(k=>onset[k]!==1), wBad=Object.keys(wake).filter(k=>wake[k]!==1);
    ok(oBad.length===0,'每个剪辑窗每人恰好一次入睡（日切没把谁的夜里切成两半，'+Object.keys(onset).length+' 个人天）');
    ok(wBad.length===0,'每个剪辑窗每人恰好一次醒来（'+Object.keys(wake).length+' 个人天）');
  }

  // 权重口径：任务书硬约束「有戏的偏离权重显著高于纯行为频次偏离」
  {
    const ids=Object.keys(Sim.CLIP_W);
    const aW=ids.filter(k=>Sim.clipTier(k)==='a').map(k=>Sim.CLIP_W[k]);
    const aMin=Math.min.apply(null,aW), aMax=Math.max.apply(null,aW), fw=Sim.CLIP_W.freq;
    ok(Sim.clipTier('freq')==='c','纯行为频次登记为丙级');
    ok(aMin>=fw*3,'甲级最低权重 '+aMin+' ≥ 丙级单条 '+fw+' 的 3 倍（实为 '+(aMin/fw).toFixed(1)+' 倍）');
    ok(aMin>Sim.CLIP_FREQ_CAP*2,'甲级最低权重 '+aMin+' > 丙级当日封顶 '+Sim.CLIP_FREQ_CAP+' 的 2 倍（实为 '+(aMin/Sim.CLIP_FREQ_CAP).toFixed(1)+' 倍）');
    ok(aMax/Sim.CLIP_FREQ_CAP>=5,'甲级最高权重 '+aMax+' ≥ 丙级封顶的 5 倍（实为 '+(aMax/Sim.CLIP_FREQ_CAP).toFixed(1)+' 倍）');
    ok(ids.every(k=>Sim.clipWeight(k)===Sim.CLIP_W[k]),'权重取值函数与登记表一致');
    // 每个登记的偏离项都要有固定模板文案，且一个字不带旁白口吻
    let blank=0;
    for(const k of ids){
      const t=Sim.clipItemText({id:(k==='freq'?'freq:eat':k), v:{from:'X',tx:'Y',n:1,k:1,lo:0,d:1,m:1,s:'D1 00:00',at:'D1 00:00',h:1,e:1,names:'甲'}});
      if(!t) blank++;
    }
    ok(blank===0,'登记表里每个偏离项都有固定模板文案（缺 '+blank+' 条）');
  }

  // 30 天双种子跑一遍，验结构口径
  for(const seed of [20260803,424242]){
    const w=Sim.makeWorld(seed);
    for(let i=0;i<31*144;i++) Sim.step(w,10);
    const cs=w.clips;
    ok(cs.length===31,'['+seed+'] 31 窗产出 31 条剪辑（实测 '+cs.length+'）');
    ok(cs.every((c,i)=>i===0||c.d===cs[i-1].d+1),'['+seed+'] 剪辑逐日连续无缺日（页面倒序渲染的前提）');
    ok(cs[0].full===0 && cs.slice(1).every(c=>c.full===1),'['+seed+'] 仅开局首日标记窗口不完整');
    // 丙级封顶
    let capBad=0, onlyFreq=0, noA=0;
    for(const c of cs){
      const f=c.items.filter(it=>Sim.clipTier(it.id)==='c').reduce((s,it)=>s+it.k,0);
      if(f>Sim.CLIP_FREQ_CAP+1e-9) capBad++;
      if(c.items.length && c.items.every(it=>Sim.clipTier(it.id)==='c')) onlyFreq++;
      if(c.items.length && !c.items.some(it=>Sim.clipTier(it.id)==='a')) noA++;
    }
    ok(capBad===0,'['+seed+'] 丙级当日合计从不越过封顶 '+Sim.CLIP_FREQ_CAP+'（越界 '+capBad+' 天）');
    ok(onlyFreq===0,'['+seed+'] 没有一天是靠纯行为频次入选的（'+onlyFreq+' 天）——权重口径的行为侧证据');
    // 共性折减确实在动，且折减后权重＝原权重×系数
    let cut=0, cutBad=0;
    for(const c of cs) for(const it of c.items){ if(it.c){ cut++; if(Math.abs(it.k-Sim.clipWeight(it.id)*Sim.CLIP_COMMON_MUL)>1e-6) cutBad++; } }
    ok(cut>0,'['+seed+'] 共性折减实际发生过（'+cut+' 次）');
    ok(cutBad===0,'['+seed+'] 折减后权重＝原权重×'+Sim.CLIP_COMMON_MUL+'（偏差 '+cutBad+' 处）');
    // 引用的必须是当窗、且确实是日志原文（逐字比对城市日志里同 t 同名的条目）
    let qOut=0, qEmpty=0;
    for(const c of cs){
      const t0=Sim.clipT0(c.d);
      for(const q of c.q){ if(!(q.t>=t0 && q.t<t0+1440)) qOut++; if(!q.text) qEmpty++; }
      if(c.name && !c.q.length) qEmpty++;
    }
    ok(qOut===0,'['+seed+'] 引用的日志条目全部落在当天窗口内（越界 '+qOut+' 条）');
    ok(qEmpty===0,'['+seed+'] 每条剪辑都引到了原文、且无空正文（异常 '+qEmpty+' 处）');
    // 单窗日志量必须远小于 w.log 容量，否则结算时当窗条目会被裁掉、引不全
    const per={};
    for(const e of w.log) per[Sim.clipDayOf(e.t)]=(per[Sim.clipDayOf(e.t)]||0)+1;
    const peak=Math.max.apply(null,Object.keys(per).map(k=>per[k]));
    ok(peak<400*0.5,'['+seed+'] 单窗日志峰值 '+peak+' 条 < 日志墙容量 400 的一半（引用取材不会被裁掉）');
    // 霸榜看门：任务书口径「某一人长期霸榜即判据偏了」
    const by={};
    for(const c of cs) if(c.name) by[c.name]=(by[c.name]||0)+1;
    const top=Math.max.apply(null,Object.keys(by).map(k=>by[k]));
    ok(Object.keys(by).length===w.agents.length,'['+seed+'] 四人都被挑中过：'+JSON.stringify(by));
    ok(top<=cs.length*0.5,'['+seed+'] 无人霸榜（最多一人 '+top+'/'+cs.length+' 天 ≤ 五成）');
    // 剪辑层零住户字段：账全挂在世界上
    ok(w.agents.every(a=>!Object.keys(a).some(k=>k.indexOf('clip')===0)),'['+seed+'] 剪辑层零住户字段');
    // 日志分类覆盖率：30 天里每条 act 条目都得归到某一类（谁改了 logText，这条即红）
    let unc=0;
    for(const e of w.log) if(e.type==='act' && !Sim.clipCat(e)) unc++;
    ok(unc===0,'['+seed+'] 日志分类表覆盖全部 act 条目（未归类 '+unc+' 条）');
  }

  // 基线口径：今天从不参与评自己（结算在前、并账在后）
  {
    const w=Sim.makeWorld(777);
    for(let i=0;i<10*144;i++) Sim.step(w,10);
    const b=w.clipBase[w.agents[0].id]||{};
    const days=(b.days||{}).n||0;
    const closed=w.clips.length;
    ok(days===closed-1,'基线天数 '+days+' ＝ 已结算 '+closed+' 条 − 首日不完整窗 1（今天不评自己、半截窗不入基线）');
    ok(w.clips.every(c=>!c.name||c.base<=c.d-1),'每条剪辑用的基线天数都少于当天天号（结算时今天还没并账）');
  }

  // 存档：随存档序列化、旧档缺省兼容、篡改档不抛错（照 chatTopics／sit 先例）
  {
    const w=Sim.makeWorld(555);
    for(let i=0;i<6*144;i++) Sim.step(w,10);
    const d=JSON.parse(Sim.serialize(w,null));
    ok(Array.isArray(d.world.clips) && d.world.clips.length>0,'clips 随存档序列化（'+d.world.clips.length+' 条）');
    ok(!!d.world.clipDay && !!d.world.clipBase,'clipDay／clipBase 随存档序列化');
    const r0=Sim.hydrate(Sim.serialize(w,null));
    for(let i=0;i<3*144;i++) Sim.step(r0.world,10);
    ok(r0.world.clips.length>w.clips.length,'存档续跑照常出剪辑');
    // 旧档：三个字段全无
    const old=JSON.parse(Sim.serialize(w,null));
    delete old.world.clips; delete old.world.clipDay; delete old.world.clipBase;
    const r1=Sim.hydrate(JSON.stringify(old));
    ok(!!r1,'旧档（无 clips/clipDay/clipBase）可反序列化');
    for(let i=0;i<3*144;i++) Sim.step(r1.world,10);
    ok(Array.isArray(r1.world.clips) && isFinite(r1.world.t),'旧档续跑 3 天自动补建、无异常');
    ok(r1.world.clips.length>0 && r1.world.clips[0].full===0,'旧档接上的那一窗标记为不完整（不计入基线）');
    // 篡改档：三个字段全是畸形值
    const bad=JSON.parse(Sim.serialize(w,null));
    bad.world.clips='x'; bad.world.clipDay=5; bad.world.clipBase=[];
    const r2=Sim.hydrate(JSON.stringify(bad));
    for(let i=0;i<2*144;i++) Sim.step(r2.world,10);
    ok(Array.isArray(r2.world.clips),'篡改档 clips 非数组 → 就地重建，不抛错');
    ok(!!r2.world.clipDay && typeof r2.world.clipDay==='object' && !!r2.world.clipDay.a,'篡改档 clipDay 非对象 → 就地重建');
    ok(!Array.isArray(r2.world.clipBase) && typeof r2.world.clipBase==='object','篡改档 clipBase 为数组 → 就地重建');
    // 篡改档：日表里塞进畸形住户行、住户名单被改
    const bad2=JSON.parse(Sim.serialize(w,null));
    bad2.world.clipDay.a={a1:'x', zzz:{}};
    const r3=Sim.hydrate(JSON.stringify(bad2));
    for(let i=0;i<144;i++) Sim.step(r3.world,10);
    ok(isFinite(r3.world.t) && r3.world.agents.every(a=>isFinite(a.hunger)),'篡改档畸形日表行 → 补建，续跑无异常');
    // 存档体积看门：剪辑最多留 CLIP_KEEP 天
    const big=Sim.makeWorld(556);
    for(let i=0;i<(Sim.CLIP_KEEP+6)*144;i++) Sim.step(big,10);
    ok(big.clips.length===Sim.CLIP_KEEP,'剪辑最多留 '+Sim.CLIP_KEEP+' 天（实测 '+big.clips.length+'）');
  }

  // 常态化折除：判据是「最不像平常的自己」，长期状态不算落差。
  // 判据须按**结算当时的那本账**算（clipHabitual 读的就是它），不能拿终局命中率去判早期的卡——
  // 命中率不是单调的（第 22 单实测：陆知秋 social_all 一路在 0.5 上下走、终局恰为 0.500，
  // 而 D25/D31 结算当时尚在 0.5 以下，按口径本就该计分），拿终局去判会误报。
  // 改法只收紧不放宽：逐日结算前抄一份账，只要那一刻已判为常态、当天的卡上就一条都不许有。
  {
    const w=Sim.makeWorld(20260803);
    const IDS=['money_broke','social_all','sit_bad','hunger_peak','worn_out'];
    let habitual=0, leaked=0, checked=0;
    const everHab={};
    for(let d=0; d<31; d++){
      const pre={};
      for(const ag of w.agents){
        const b=(w.clipBase&&w.clipBase[ag.id])||{};      // 开城首拍前 clipBase 尚未建起
        for(const id of IDS){
          const r=b['hit:'+id];
          const h=!!(r && r.n>=Sim.CLIP_BASE_MIN && r.s/r.n>=0.5);   // 0.5＝CLIP_HABIT（该常量未导出，照原断言用字面量）
          pre[ag.id+'|'+id]=h;
          if(h && !everHab[ag.id+'|'+id]){ everHab[ag.id+'|'+id]=1; habitual++; }
        }
      }
      const n0=(w.clips||[]).length;                   // 开城首拍前 clips 尚未建起
      for(let i=0;i<144;i++) Sim.step(w,10);           // 每 144 拍恰好跨一次日切＝恰好结算一天
      for(const c of w.clips.slice(n0)){
        if(!c.id) continue;
        for(const it of c.items){
          if(IDS.indexOf(it.id)<0) continue;
          checked++;
          if(pre[c.id+'|'+it.id]) leaked++;
        }
      }
    }
    ok(habitual>0,'实测存在「平常就这样」的绝对判据（'+habitual+' 项人×判据）');
    ok(checked>0,'实验成立：入选卡上确有受折除管辖的绝对判据（'+checked+' 条参与核对）');
    ok(leaked===0,'常态化的绝对判据不再计入落差（按结算当时的账核对，漏算 '+leaked+' 处）');
  }

  // 反向自查：上面三条源码断言不是摆设——把病态写法复演一遍，断言它们确实判违规
  // （照走位三铁律「闸立完必须反向自查」的先例：一条恒绿的闸等于没立）
  {
    const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"])\/\/.*$/gm,'$1');
    const sick1=strip("/* 本段零 rng 消耗 */\nfunction clipSample(w,sh){ const x=w.rng(); }");
    const sick2=strip("/* 不写 w.stats */\nfunction clipClose(w,sh){ w.stats.rain++; }");
    const sick3=strip("/* 只读住户 */\nfunction clipSample(w,sh){ for(const ag of w.agents) ag.money=0; }");
    const well =strip("/* 零 rng、不写 w.stats、零住户字段写入 */\nfunction clipSample(w,sh){ const r=sh.a[ag.id]; r.m1=ag.money; }");
    ok(/\brng\b/.test(sick1),'反向：CLIP 段真写了 w.rng() 会被判违规');
    ok(/w\.stats/.test(sick2),'反向：CLIP 段真碰了 w.stats 会被判违规');
    ok(/\bag\.[A-Za-z]+\s*=[^=]/.test(sick3),'反向：CLIP 段真写了住户字段会被判违规');
    ok(!/\brng\b/.test(well) && !/w\.stats/.test(well) && !/\bag\.[A-Za-z]+\s*=[^=]/.test(well),
       '反向不误伤：只在注释里提到这几个词的合规写法一律放行（三条断言各自空过）');
  }

  // 页面：新页与既有五页并排，切页环也带上
  {
    ok(/data-tab="clip"/.test(src) && /id="scr-clip"/.test(src),'剪辑页的页签与页面都已就位');
    const m=src.match(/const TAB_ORDER=\[([^\]]*)\]/);
    ok(!!m && m[1].indexOf("'clip'")>=0,'TAB_ORDER 含 clip（Q/E 与 LB/RB 切页可达）');
    const order=(src.match(/<button class="tab" data-tab="(\w+)"/g)||[]).map(s=>s.match(/data-tab="(\w+)"/)[1]);
    ok(JSON.stringify(order)===JSON.stringify(['live','roles','log','clip','phone','settings']),
       '页签排列＝现场／角色／日志／剪辑／短信／设置（实测 '+order.join('／')+'）');
    ok(/if\(id==='clip'\) renderClips\(\);/.test(src),'切到剪辑页会渲染');
    // 本页零 AI：渲染层不得碰任何 LLM 挂点
    const uiSrc=(src.match(/function clipRows\(\)[\s\S]*?\nfunction traitChips/)||[''])[0];
    ok(uiSrc.length>1000,'剪辑渲染层可抽取（'+uiSrc.length+' 字）');
    ok(!/callClaude|enhance|runReflection|llm\.on/.test(uiSrc),'剪辑渲染层零 LLM 挂点（本单一个字都不过 AI）');
    ok(/PURE\.fmtStamp/.test(uiSrc),'剪辑引用条目走 fmtStamp 打日期戳（第 19 单追加一口径）');
  }
}

/* ===================== 第 22 单 · 作息人格 ===================== */
{
  const src=require('fs').readFileSync('city-life-framework.html','utf8');
  const A=['a1','a2','a3','a4'];
  const w0=Sim.makeWorld(20260803);
  const NM={}; for(const a of w0.agents) NM[a.id]=a.name;

  // —— 口径① 差异落在人格上：逐人参数只能是「基准 ＋ 本人每条特质那一行」的和 ——
  {
    const keys=Object.keys(Sim.RHY_BASE);
    let mismatch=0;
    for(const ag of w0.agents){
      const got=Sim.rhyOf(ag), want={};
      for(const k of keys) want[k]=Sim.RHY_BASE[k];
      for(const t of ag.traits){ const d=Sim.RHY_TRAIT[t]||{}; for(const k in d) if(k in want) want[k]+=d[k]; }
      // 与实现同款钳位（钳位本身也是口径的一部分）
      want.bed=PURE.clamp(want.bed,Sim.RHY_BED_MIN,Sim.RHY_BED_MAX);
      want.dur=PURE.clamp(want.dur,Sim.RHY_DUR_MIN,Sim.RHY_DUR_MAX);
      want.reg=PURE.clamp(want.reg,0,1); want.lie=Math.max(0,want.lie); want.grit=Math.max(0,want.grit);
      for(const k of keys) if(Math.abs(got[k]-want[k])>1e-9) mismatch++;
    }
    ok(mismatch===0,'逐人作息参数＝RHY_BASE ＋ 本人特质逐行相加（表外无第二处赋值，错 '+mismatch+' 格）');
    // 四人的每一条特质都必须在表里登记（漏一条＝那个人的作息里有一段说不出理由的差异）
    let unreg=[];
    for(const ag of w0.agents) for(const t of ag.traits) if(!Sim.RHY_TRAIT[t]) unreg.push(ag.name+'·'+t);
    ok(unreg.length===0,'四人全部 8 条特质都在 RHY_TRAIT 里登记（未登记：'+(unreg.join('／')||'无')+'）');
    // 钱的特质不进作息（登记在表里是为了证明没漏，不是为了留空位）
    let moneyLeak=0;
    for(const t of ['节俭','大方']){ const d=Sim.RHY_TRAIT[t]||{}; for(const k in d) if(d[k]) moneyLeak++; }
    ok(moneyLeak===0,'钱的特质（节俭／大方）对作息零贡献（'+moneyLeak+' 格非零）');
    // 陌生特质／缺 traits：一律回落基准，绝不抛错
    const fake=Sim.rhyOf({traits:['莫须有','夜猫子']}), owl=Sim.rhyOf({traits:['夜猫子']});
    ok(JSON.stringify(fake)===JSON.stringify(owl),'陌生特质自动跳过（篡改档不抛错、不改数）');
    ok(JSON.stringify(Sim.rhyOf({}))===JSON.stringify(Sim.rhyOf({traits:[]})),'缺 traits 回落 RHY_BASE');
  }

  // —— 口径① 规律性是人格的一格：四人基准钟点两两不同，且 reg 排序与人设一致 ——
  {
    const R={}; for(const ag of w0.agents) R[ag.id]=Sim.rhyOf(ag);
    const wake={}; for(const id of A) wake[id]=(R[id].bed+R[id].dur)%1440;
    let close=0;
    for(let i=0;i<A.length;i++) for(let j=i+1;j<A.length;j++){
      if(Math.abs(wake[A[i]]-wake[A[j]])<25) close++;
      if(Math.abs((R[A[i]].bed%1440)-(R[A[j]].bed%1440))<20) close++;
    }
    ok(close===0,'四人基准起床两两相差 ≥25 分、基准就寝两两相差 ≥20 分（改前沈小满与陆知秋逐分钟相同，'+close+' 对过近）');
    const show=k=>A.map(i=>NM[i]+' '+R[i][k]).join('／');
    ok(R.a3.reg<R.a4.reg && R.a4.reg<R.a2.reg && R.a2.reg<R.a1.reg,
       '规律性排序＝陆知秋(工作狂)最铁打 < 白一鸣 < 沈小满 < 顾云帆(夜猫子·摸鱼)最松散：'+A.map(i=>NM[i]+' '+R[i].reg.toFixed(2)).join('／'));
    ok(R.a3.lie===0 && R.a1.lie>=R.a2.lie && R.a2.lie>R.a4.lie,'周末赖床＝工作狂 0 分、夜猫子最多：'+show('lie'));
    ok(R.a3.grit===Math.max.apply(null,A.map(i=>R[i].grit)),'硬扛系数以工作狂最高：'+show('grit'));
  }

  // —— 口径② 波动有成因：本段零 rng（源码原文，剥注释后判——本段注释里成段写着「零 w.rng()」）——
  {
    const raw=(src.match(/\/\*RHY-START\*\/[\s\S]*?\/\*RHY-END\*\//)||[''])[0];
    ok(raw.length>2000,'RHY 段可抽取（'+raw.length+' 字）');
    const code=raw.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"])\/\/.*$/gm,'$1');
    ok(/function rhyOf\(ag\)\{/.test(code) && /function rhyDur\(w,ag,R,rest\)\{/.test(code),
       '剥注释后代码仍完整（剥过头会让下面几条断言变成空转）');
    ok(!/\brng\b/.test(code),'作息层代码零 rng 引用（波动全部来自世界状态，不是掷骰子）');
    ok(!/\bpickV?\s*\(/.test(code),'作息层代码零抽词调用');
    // 反向自查：真写了才判违规／只在注释里写不判违规（一条恒绿的闸等于没立）
    const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"])\/\/.*$/gm,'$1');
    ok(/\brng\b/.test(strip('/* 本段零 w.rng() */\nfunction rhyDur(w){ return w.rng()*10; }')),
       '反向：作息层真摇了 rng 会被判违规');
    ok(!/\brng\b/.test(strip('/* 本段零 w.rng() 调用，一次骰子都不掷 */\nfunction rhyDur(w,ag,R,rest){ return R.dur; }')),
       '反向不误伤：只在注释里提到 rng 的合规写法放行');
  }

  // —— 口径② 成因链可追：同一世界、同一时刻，只改「挂着什么处境」，作息就该跟着变；
  //     而把 reg 归零（＝铁打的作息）则一动不动。这条把「有成因」与「成因经由 reg 落地」一起钉住。
  {
    // 探针立在**排期函数**上而不是涌现出来的入睡时刻：实际躺下＝max(排期, 手上活儿干完)，
    // 若那天他忙到比三档都晚，三档会落在同一拍上，比出来的是活动时长不是成因（首版实测踩中）。
    // 故固定同一个世界、同一个时刻、同一份体力与小憩记账，只换 ag.sit 一个变量。
    const at=(traits)=>{
      const w=Sim.makeWorld(31337);
      for(let i=0;i<12*144;i++) Sim.step(w,10);
      const ag=w.agents[0];                               // a1 顾云帆（reg 最高）
      if(traits) ag.traits=traits;
      const R=Sim.rhyOf(ag), rest=Sim.rhyRest(ag);
      const one=k=>{ ag.sit = k ? {k:k, from:'组长', text:'x', i:0, until:w.t+3000} : null;
                     return {bed:Sim.rhyBedClock(w,ag,R,rest), dur:Sim.rhyDur(w,ag,R,rest)}; };
      return {bad:one('bad'), good:one('good'), none:one('')};
    };
    const P=at(null);
    ok(P.bad.bed>P.none.bed && P.none.bed>P.good.bed,
       '挂着逆境就睡得比平常晚、挂着顺境比平常早（逆 '+P.bad.bed+' ／平 '+P.none.bed+' ／顺 '+P.good.bed+' 分）');
    ok(P.bad.dur>P.none.dur && P.none.dur>P.good.dur,
       '夜猫子挂着逆境还睡得更沉（时长 逆 '+P.bad.dur+' ／平 '+P.none.dur+' ／顺 '+P.good.dur+' 分）');
    ok(P.bad.bed+P.bad.dur>P.none.bed+P.none.dur,'两段合起来＝起床跟着一起往后挪');
    // 方向逐人不同：早起的白一鸣挂着逆境反而提前收工、少睡（owl／keep 为负）
    const Q=at(['内向','早起']);
    ok(Q.bad.bed<Q.none.bed && Q.bad.dur<Q.none.dur,
       '同一件坏事在不同人格上方向相反：早起者提前收工且少睡（就寝 '+Q.bad.bed+'<'+Q.none.bed+'，时长 '+Q.bad.dur+'<'+Q.none.dur+'）');
    // 反向：把 reg 压到 0 的人（铁打的作息），同样的成因一分钟都推不动他
    const FLAT=['工作狂','工作狂','工作狂'];              // reg 相加后被钳到 0
    ok(Sim.rhyOf({traits:FLAT}).reg===0,'反向自查的构造成立：reg 被钳到 0');
    const F=at(FLAT);
    ok(F.bad.bed===F.good.bed && F.bad.dur===F.good.dur,
       '反向：reg＝0 的人，逆境顺境一分钟也推不动（就寝 '+F.bad.bed+' vs '+F.good.bed+'，时长 '+F.bad.dur+' vs '+F.good.dur+'）');
  }

  // —— 口径③ 生存红线：30 天双种子逐拍体检 ——
  {
    for(const seed of [20260803,424242]){
      const w=Sim.makeWorld(seed);
      const prev={}; for(const a of w.agents) prev[a.id]=a.activity.type;
      const wake={}, bed={}, dur={}; for(const id of A){ wake[id]=[]; bed[id]=[]; dur[id]=[]; }
      const lastBed={};
      let runH=0,maxRunH=0, runE=0,maxRunE=0, minE=101, maxH=-1, oob=0, moneyLo=1e9;
      let bedOffMax=-1, wakeOffMin=1e9;
      for(let i=0;i<30*144;i++){
        Sim.step(w,10);
        const t0=(Sim.clipDayOf(w.t)-1)*1440+Sim.CLIP_CUT;
        for(const a of w.agents){
          const s=a.activity.type==='sleep', p=prev[a.id]==='sleep';
          if(s&&!p){ bed[a.id].push(w.t-t0); if(w.t-t0>bedOffMax) bedOffMax=w.t-t0; lastBed[a.id]=w.t; }
          if(!s&&p){ wake[a.id].push(w.t-t0); if(w.t-t0<wakeOffMin) wakeOffMin=w.t-t0;
                     if(lastBed[a.id]!==undefined) dur[a.id].push(w.t-lastBed[a.id]); }
          if(!s){
            if(a.energy<minE) minE=a.energy; if(a.hunger>maxH) maxH=a.hunger;
            runH=a.hunger>=Sim.CLIP_STARVE?runH+1:0; if(runH>maxRunH) maxRunH=runH;
            runE=a.energy<=Sim.CLIP_DRAINED?runE+1:0; if(runE>maxRunE) maxRunE=runE;
          } else { runH=0; runE=0; }
          if(!isFinite(a.hunger)||!isFinite(a.energy)||!isFinite(a.money)) oob++;
          if(a.hunger<0||a.hunger>100||a.energy<0||a.energy>100) oob++;
          if(a.money<moneyLo) moneyLo=a.money;
          prev[a.id]=a.activity.type;
        }
      }
      ok(oob===0,'['+seed+'] 30 天零 NaN 零越界（'+oob+' 处）');
      ok(minE>0,'['+seed+'] 清醒体力从不见零（谷值 '+minE.toFixed(1)+'，绝对线 '+Sim.CLIP_DRAINED+'）');
      // 「偶尔饿着」可以，「长期饿着」不行——连续高位不得超过一小时量级
      ok(maxRunH*10<=120,'['+seed+'] 饥饿越过 '+Sim.CLIP_STARVE+' 最长连续 '+(maxRunH*10)+' 分钟 ≤120（偶尔可以，长期不行）');
      ok(maxRunE*10<=120,'['+seed+'] 体力跌破 '+Sim.CLIP_DRAINED+' 最长连续 '+(maxRunE*10)+' 分钟 ≤120');
      ok(moneyLo>=-123,'['+seed+'] 负债不穿 sim30 底线 ¥-123（谷底 ¥'+Math.round(moneyLo)+'，余量 '+Math.round(moneyLo+123)+'）');
      // 睡眠时长：钳位之内，且不得短到体力回不满
      let durBad=0, durMin=1e9;
      for(const id of A) for(const v of dur[id]){ if(v<Sim.RHY_DUR_MIN-10||v>Sim.RHY_DUR_MAX+10) durBad++; if(v<durMin) durMin=v; }
      ok(durBad===0,'['+seed+'] 每一觉都落在时长钳位内（越界 '+durBad+' 次，最短 '+(durMin/60).toFixed(2)+' 小时）');
      // 日切两端余量：由钳位保证，不靠运气
      ok(bedOffMax<1440-60,'['+seed+'] 最晚就寝距窗尾还有 '+(1440-bedOffMax)+' 分钟（>60）');
      ok(wakeOffMin>60-1,'['+seed+'] 最早起床距窗首还有 '+wakeOffMin+' 分钟（≥60）');
      // 本单的正题：起床时刻不再零方差，而且方差本身逐人不同
      const sd=arr=>{ const m=arr.reduce((s,v)=>s+v,0)/arr.length; return Math.sqrt(arr.reduce((s,v)=>s+(v-m)*(v-m),0)/arr.length); };
      const S={}; for(const id of A) S[id]=sd(wake[id]);
      ok(A.every(id=>S[id]>0),'['+seed+'] 四人起床时刻都不再是零方差（改前四人全为 0）：'+A.map(i=>NM[i]+' '+S[i].toFixed(0)).join('／'));
      ok(S.a3===Math.min.apply(null,A.map(i=>S[i])) && S.a1>3*S.a3,
         '['+seed+'] 规律性做出来了：陆知秋最稳（sd '+S.a3.toFixed(0)+' 分），顾云帆散度是他的 '+(S.a1/S.a3).toFixed(1)+' 倍（>3）');
    }
  }

  // —— 口径③／存档：新字段随存档、旧档缺省、篡改档不抛错 ——
  {
    const w=Sim.makeWorld(4242);
    for(let i=0;i<3*144;i++) Sim.step(w,10);
    const s=Sim.serialize(w,null);
    ok(/"rest":/.test(s),'rest 随存档序列化');
    const r=Sim.hydrate(s);
    ok(!!r && r.world.agents.every(a=>a.rest && isFinite(a.rest.wake)),'存档往返后 rest 完好');
    // 旧档：整个 rest 字段不存在
    const old=Sim.hydrate(s.replace(/"rest":\{[^}]*\},?/g,''));
    ok(!!old && old.world.agents.every(a=>!a.rest),'构造成立：旧档确实没有 rest 字段');
    for(let i=0;i<3*144;i++) Sim.step(old.world,10);
    ok(old.world.agents.every(a=>isFinite(a.hunger)&&isFinite(a.energy)&&a.rest&&isFinite(a.rest.wake)),
       '旧档缺 rest → 就地建账、续跑无异常');
    // 篡改档：rest 是字符串／数组／全是坏数
    for(const bad of ['"rest":"zzz"','"rest":[1,2,3]','"rest":{"bed":"x","wake":null,"dur":{},"nap":[]}']){
      const t=Sim.hydrate(s.replace(/"rest":\{[^}]*\}/g, bad));
      ok(!!t,'篡改档 '+bad.slice(0,18)+'… 仍能 hydrate');
      for(let i=0;i<2*144;i++) Sim.step(t.world,10);
      ok(t.world.agents.every(a=>isFinite(a.hunger)&&isFinite(a.energy)&&a.hunger>=0&&a.hunger<=100),
         '篡改档 '+bad.slice(0,18)+'… 就地重建、续跑不抛错不越界');
    }
    // 篡改档：metab 被改成畸形值，也不许把「饿了就吃」整个关掉
    const mw=Sim.makeWorld(7); const ma=mw.agents[0];
    ma.metab={hungerRate:1, energyRate:1, eatAt:NaN, napAt:'x'};
    ok(Sim.rhyEatAt(mw,ma,Sim.rhyOf(ma))<=Sim.RHY_HUNGER_FLOOR && isFinite(Sim.rhyEatAt(mw,ma,Sim.rhyOf(ma))),
       '篡改档畸形 eatAt → 收进有限区间（实测 '+Sim.rhyEatAt(mw,ma,Sim.rhyOf(ma)).toFixed(0)+'）');
    ok(Sim.rhyNapAt(mw,ma,Sim.rhyOf(ma))>=Sim.RHY_ENERGY_FLOOR,'篡改档畸形 napAt → 不低于生存红线');
    for(let i=0;i<2*144;i++) Sim.step(mw,10);
    ok(mw.agents.every(a=>isFinite(a.hunger)&&a.hunger<=100),'篡改 metab 后续跑无异常');
  }

  // —— 饭点逐人化：四人的饭点那一小时互不重叠 ——
  {
    const base={a1:9*60, a2:10*60, a3:9*60-30, a4:9.5*60};
    const lu={}; for(const k in base) lu[k]=base[k]+Sim.RHY_LUNCH_AFTER;
    let overlap=0;
    for(let i=0;i<A.length;i++) for(let j=i+1;j<A.length;j++) if(Math.abs(lu[A[i]]-lu[A[j]])<30) overlap++;
    ok(overlap===0,'四人饭点两两相差 ≥30 分（'+A.map(i=>NM[i]+' '+PURE.fmtTime(lu[i])).join('／')+'）');
    ok(Sim.RHY_LUNCH_AFTER>0 && Sim.RHY_LUNCH_AFTER<8*60,'饭点偏移取值合理（'+Sim.RHY_LUNCH_AFTER+' 分）');
  }
}

// ═══ 第 26 单·离线追帧一期 ═══════════════════════════════════════════════
// 三条硬红线逐条立断言：①补算不许破生存不变量（sim30 已把「从存档补算 30 天」纳入门禁，
// 与「从零跑 30 天」同等对待，此处不重复）②补算不许花钱：零 AI，可计数 ③补算期间零渲染层动作
// （帧级由 walkgate.js「⑧ 离线追帧补算」把关，此处只立源码结构断言）。
{
  const fs=require('fs'), path=require('path');
  const src=fs.readFileSync(path.resolve(__dirname,'city-life-framework.html'),'utf8');
  const grab=(re,name)=>{ const m=src.match(re); if(!m){ ok(false,'源码抽取失败:'+name); return ''; } return m[0]; };

  // —— 口径①：换算与封顶的算术（边界一律向「少补」倒）——
  {
    const mk=speed=>({speed:speed===undefined?1:speed});
    const M=60000, cap=Sim.CATCHUP_MAX_DAYS*144;
    ok(Sim.CATCHUP_MIN_PER_MIN===1,'换算口径＝1 真实分钟 ⇒ 1 模拟分钟（实测 '+Sim.CATCHUP_MIN_PER_MIN+'）');
    ok(Sim.catchUpPlan(mk(),9*M).ticks===0,'离开 9 分钟 → 0 拍（不足一拍不补，一拍＝10 模拟分钟）');
    ok(Sim.catchUpPlan(mk(),10*M).ticks===1,'离开 10 分钟 → 恰 1 拍');
    ok(Sim.catchUpPlan(mk(),8*60*M).ticks===48,'离开一晚 8 小时 → 48 拍（＝8 模拟小时）');
    const three=Sim.catchUpPlan(mk(),3*24*60*M);
    ok(three.ticks===cap && !three.capped,'离开 3 天 → 恰好 '+cap+' 拍且未触封顶（＝决策者原话「关三天看到这三天」）');
    const week=Sim.catchUpPlan(mk(),7*24*60*M);
    ok(week.ticks===cap && week.capped && week.skipTicks===(7-Sim.CATCHUP_MAX_DAYS)*144,
       '离开 7 天 → 封顶 '+cap+' 拍、跳过 '+week.skipTicks+' 拍（'+(7-Sim.CATCHUP_MAX_DAYS)+' 天），且 capped 标记为真');
    ok(Sim.catchUpPlan(mk(0),3*24*60*M).ticks===0 && Sim.catchUpPlan(mk(0),3*24*60*M).paused,
       '暂停中离开（speed=0）→ 0 拍：补算不替玩家松手');
    ok(Sim.catchUpPlan(mk(),-99*M).ticks===0,'时钟倒流（负差值）→ 0 拍，绝不倒着推');
    ok(Sim.catchUpPlan(mk(),NaN).ticks===0 && Sim.catchUpPlan(mk(),undefined).ticks===0,
       '坏 meta（NaN／缺 at）→ 0 拍，绝不判坏档');
    ok(Sim.catchUpPlan({},10*M).ticks===0,'存档缺 speed 字段 → 按暂停处理，0 拍');
  }

  // —— 口径②：补算的可计数零 AI（真计数器，不是声明）——
  {
    let net=0;
    const bak={fetch:global.fetch, xhr:global.XMLHttpRequest, ws:global.WebSocket};
    const trap=name=>function(){ net++; throw new Error('补算期间出网：'+name); };
    global.fetch=trap('fetch'); global.XMLHttpRequest=trap('XMLHttpRequest'); global.WebSocket=trap('WebSocket');
    const w=Sim.makeWorld(31415);
    let err='';
    try{ Sim.catchUp(w, 30*144, 0); }catch(e){ err=String((e&&e.message)||e); }
    global.fetch=bak.fetch; global.XMLHttpRequest=bak.xhr; global.WebSocket=bak.ws;
    ok(net===0 && !err,'补算 30 天（4320 拍）全程出网 '+net+' 次'+(err?('，异常：'+err):'')+' —— 可计数硬断言');
    // 源码侧：SIM 块整块没有出网符号，故上面那个 0 是结构保证不是运气。
    // 照第 21 单先例先剥注释再判——本段注释里成句写着 runReflection／enhanceMessage 的名字，
    // 不剥的话断言会被自己的说明文字命中（首次编写时实测踩中）。
    const strip=x=>x.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"])\/\/.*$/gm,'$1');
    const sim=strip(grab(/\/\*SIM-START\*\/[\s\S]*?\/\*SIM-END\*\//,'SIM 块'));
    ok(/function catchUp\(w, ticks, lastReflectDay\)\{/.test(sim),'剥注释后 SIM 块代码仍完整（剥过头会让下面两条变成空转）');
    ok(!/\bfetch\s*\(|XMLHttpRequest|callClaude|enhanceChat|enhanceMessage|runReflection/.test(sim),
       'SIM 块（补算的全部实现所在）零 AI／零出网符号');
    const cu=strip(grab(/\/\*CATCHUP-START\*\/[\s\S]*?\/\*CATCHUP-END\*\//,'CATCHUP 段'));
    ok(!/document|window|requestAnimationFrame|\$\(/.test(cu),'CATCHUP 段零 DOM 符号（node 可直接跑，故门禁跑的就是生产原文）');
    // 反向自查：这两条闸不是恒绿——把出网／DOM 塞进同形状的代码里必须当场判违规
    ok(/\bfetch\s*\(|callClaude/.test(strip('/* 本段零 AI */\nfunction catchUp(w){ return callClaude(x); }')),
       '反向：补算里真调了 AI 会被判违规');
    ok(!/\bfetch\s*\(|callClaude/.test(strip('/* 与 runReflection 同文，不调 callClaude */\nfunction catchUp(w){ step(w,10); }')),
       '反向不误伤：只在注释里提到 callClaude 的合规写法放行');
  }

  // —— 口径②续：回来后也不补生成（drainLog 的水位线）——
  {
    const dl=grab(/function drainLog\(\)\{[\s\S]*?\n\}/,'drainLog');
    ok(/if\(state\.llm\.on && e\.lid>aiFloorLid && !e\.llm && !e\.llmPending\)/.test(dl),
       'drainLog 的 AI 闸上有 aiFloorLid 水位线（读档旧条目与补算产物一律不送 AI）');
    ok(/const aiFloorLid=state\.world\.lidSeq;/.test(src),'水位线取的是补算完成那一刻的 lidSeq');
    const raw=grab(/async function rawCallClaude\(prompt, batch\)\{[\s\S]*?\n  L\.calls\+\+;/,'rawCallClaude 头部');
    ok(/if\(catchupActive\)\{ catchupAiHits\+\+; return null; \}/.test(raw),
       'rawCallClaude 首句即补算窗口闸，且命中计数（catchupAiHits）');
    ok(raw.indexOf('catchupActive')<raw.indexOf('L.calls++'),'该闸排在计数与发请求之前（顺序对了才拦得住）');
  }

  // —— 口径③：补算期间零渲染层动作（源码结构断言；帧级见 walkgate ⑧）——
  {
    const boot=src.slice(src.indexOf('/* ---------- 离线追帧（第 26 单）'), src.indexOf('for(const ag of state.world.agents){'));
    ok(boot.length>200,'取到开机补算段（'+boot.length+' 字节）');
    ok(!/drainLog\(|renderClips\(|renderTopbar\(|draw\(|stepAllDisplays\(|updateWalkers\(|logLine\(/.test(boot),
       '开机补算段内零渲染层调用（drainLog／renderX／draw／走位推进一个都没有）');
    ok(!/callClaude|enhanceChat|enhanceMessage|runReflection|await /.test(boot),
       '开机补算段内零 AI 调用、零 await（整块同步 ⇒ llm 队列一次都轮不到）');
    const iBoot=src.indexOf('Sim.catchUp(state.world'), iVis=src.indexOf('state.vis[ag.id]={x:a.x+0.5');
    ok(iBoot>0 && iVis>iBoot,'补算的调用点排在 state.vis 建表之前 ⇒ 补算期间连显示位都还不存在，一帧也画不出来');
    const loop=grab(/function loop\(now\)\{[\s\S]*?\n\}/,'loop()');
    ok(!/catchUp\(/.test(loop),'主循环 loop() 内零补算调用（补算只在开机时发生一次）');
  }

  // —— 口径④：逐拍调用 ≡ 一次调用（sim30 的补算模式要按拍观测，靠的就是这条）——
  {
    const one=Sim.hydrate(Sim.serialize(Sim.makeWorld(2718),null)).world;
    const many=Sim.hydrate(Sim.serialize(Sim.makeWorld(2718),null)).world;
    const r1=Sim.catchUp(one, 7*144, 0);
    let rd=0, nights=0;
    for(let i=0;i<7*144;i++){ const c=Sim.catchUp(many,1,rd); rd=c.lastReflectDay; nights+=c.nights; }
    const full=x=>JSON.stringify({t:x.t,rngState:x.rngState,stats:x.stats,lidSeq:x.lidSeq,
      log:x.log.map(e=>[e.lid,e.t,e.type,e.name,e.text,e.thought||'']),
      agents:x.agents.map(a=>[a.id,a.money,a.anchor,a.hunger,a.energy,a.busyUntil,JSON.stringify(a.activity)]),
      clips:x.clips,saidDay:x.saidDay,chatTopics:x.chatTopics,weather:x.weather});
    ok(full(one)===full(many),'补算 7 天：逐拍调用与一次调用逐字节相同');
    ok(r1.nights===nights && r1.nights===7,'两种调法「夜深了」轮数一致且＝天数（'+r1.nights+' ／ '+nights+'）');
    ok(r1.lastReflectDay===rd,'lastReflectDay 进出口径一致（'+r1.lastReflectDay+'）');
  }

  // —— 补算产出的形状：模板日记、已读不回、剪辑、存档 ——
  {
    const w=Sim.hydrate(Sim.serialize(Sim.makeWorld(9001),null)).world;
    const clips0=(w.clips||[]).length;
    const r=Sim.catchUp(w, 3*144, 0);
    ok(r.ticks===432 && r.mins===4320 && r.t1-r.t0===4320,'补算 3 天：432 拍 ＝ 4320 模拟分钟');
    const diary=w.log.filter(e=>e.type==='diary');
    ok(diary.length===r.nights*w.agents.length,'每个「夜深了」落满四人日记（'+r.nights+' 夜 × '+w.agents.length+' 人 = '+diary.length+' 条）');
    ok(diary.every(e=>e.thought===Sim.DIARY_FALLBACK),'补算期间的日记逐条走模板兜底（AI 挂掉时那条路），无一条打 ✨');
    ok(diary.every(e=>!e.llm && !e.llmPending),'补算日记不留 llmPending ⇒ 回来后 drainLog 也不会去补生成');
    ok(w.log.some(e=>e.type==='sys' && e.text.indexOf('夜深了')>=0),'「🌙 夜深了」那条系统日志照落（回来推剪辑页的判据即由它计数）');
    ok((w.clips||[]).length>clips0,'补算期间剪辑照常结算（'+clips0+' → '+(w.clips||[]).length+' 条）');
    const s2=Sim.serialize(w,{selected:'a1',lastReflectDay:r.lastReflectDay,at:1});
    ok(!!Sim.hydrate(s2),'补算后的世界仍可序列化／反序列化');
  }
  // 临走前发的那条短信：补算期间被读掉 ⇒ 必须补一条「已读不回」，不许石沉大海
  {
    const w=Sim.makeWorld(1234);
    ok(Sim.sendMessage(w,'a1','eat'),'临走前发出一条短信');
    const before=w.log.filter(e=>e.sms==='noreply').length;
    Sim.catchUp(w, 6*144, 0);
    const read=w.log.filter(e=>e.type==='player' && e.sms==='read').length;
    const nore=w.log.filter(e=>e.type==='player' && e.sms==='noreply').length;
    ok(read>=1,'补算期间那条短信被读到了（read 条目 '+read+' 条）');
    ok(nore-before===read,'每条被读到的短信都补了一条「已读不回」（'+(nore-before)+' ／ '+read+' 条）');
    ok(w.log.filter(e=>e.sms==='noreply').every(e=>e.text===Sim.SMS_NOREPLY),'补的那条逐字沿用既有兜底文案');
  }
  // —— 正向审计带出来的一处：关页把在途 AI 调用带走的那些条目，重开时照「AI 挂掉那条路」收尾 ——
  {
    const fn=grab(/function settleOrphanLLM\(w\)\{[\s\S]*?\n\}/,'settleOrphanLLM');
    const S=new Function('DIARY_FALLBACK','SMS_NOREPLY','pushLog','return '+fn)(
      Sim.DIARY_FALLBACK, Sim.SMS_NOREPLY, (w,e)=>{ e.t=w.t; e.lid=++w.lidSeq; w.log.push(e); });
    const w=Sim.makeWorld(555);
    // 造一份「关页时正好三条在途」的世界：对白／日记／短信各一条，形态与生产落盘时逐字相同
    w.log.push({type:'chat',agent:'a1',name:'甲',with:'a2',text:'和乙聊了几句',
                thought:'（聊得正起劲⋯）',fb:'「模板上句」「模板下句」',llmPending:true,lid:++w.lidSeq});
    w.log.push({type:'diary',agent:'a2',name:'乙',text:'睡前日记',thought:'（在台灯下写着⋯）',llmPending:true,lid:++w.lidSeq});
    w.log.push({type:'player',sms:'read',agent:'a3',name:'丙',msg:'eat',msgLabel:'记得吃饭',
                text:'读到了你的短信「记得吃饭」',thought:'（对着屏幕想了想⋯）',fb:'（看了眼短信）好好好，这就去解决一顿。',llmPending:true,lid:++w.lidSeq});
    const n=S(w);
    ok(n===3,'三条在途条目全部收尾（实测 '+n+' 条）');
    ok(w.log.every(e=>!e.llmPending),'收尾后全场零「在途」标 ⇒ 占位符不会永远挂在墙上');
    ok(w.log.find(e=>e.type==='chat').thought==='「模板上句」「模板下句」','对白回落到自己的模板兜底 e.fb');
    ok(w.log.find(e=>e.type==='diary').thought===Sim.DIARY_FALLBACK,'日记回落到 DIARY_FALLBACK（它没有 e.fb，故单独一条分支）');
    ok(w.log.find(e=>e.sms==='read').thought.indexOf('好好好')>=0,'短信内心独白回落到 e.fb');
    const nr=w.log.filter(e=>e.sms==='noreply');
    ok(nr.length===1 && nr[0].text===Sim.SMS_NOREPLY && nr[0].agent==='a3',
       '被读掉却没等到回信的短信补了一条「已读不回」，落款在同一个人身上');
    ok(w.log.every(e=>e.thought!=='（聊得正起劲⋯）' && e.thought!=='（在台灯下写着⋯）' && e.thought!=='（对着屏幕想了想⋯）'),
       '三种占位符一个不剩');
    ok(S(w)===0,'再收一次为 0 条（幂等，重开多少次都不会重复补「已读不回」）');
    // 位置：必须排在补算与水位线之前，否则补出来的条目会被当成「在途」或漏进 AI
    const iOrph=src.indexOf('if(bootWorld) settleOrphanLLM(state.world);'),
          iCatch=src.indexOf('Sim.catchUp(state.world'), iFloor=src.indexOf('const aiFloorLid=');
    ok(iOrph>0 && iOrph<iCatch && iCatch<iFloor,'收尾 → 补算 → 落水位线，三步顺序写死在源码里');
  }

  // 两条兜底文案在全站只有一处定义（改一处即两条路一起改，不会再分叉）
  {
    ok((src.match(/（写了两行，没写下去，合上了本子。）/g)||[]).length===1,'日记兜底文案全站只有一处字面量');
    ok((src.match(/看了你的短信，没有回。/g)||[]).length===1,'短信兜底文案全站只有一处字面量');
    ok((src.match(/1310/g)||[]).length===1 && /const REFLECT_MIN=1310;/.test(src),
       '「夜深了」节点 21:50 已集中为 REFLECT_MIN，主循环与补算两处同引，全站无第二个裸 1310');
  }
  // 回来第一眼：跨过夜才推剪辑页，没跨过就不打扰
  {
    const ui=src.slice(src.indexOf('/* ---------- 启动 ---------- */'));
    ok(/if\(catchup && catchup\.nights>0\)\{[\s\S]*?setScreen\('clip'\);/.test(ui),
       '跨过至少一个「夜深了」⇒ 直接把剪辑页推到玩家面前');
    ok(/\}else\{\n  setScreen\('live'\);/.test(ui),'没跨过夜 ⇒ 照旧进现场页，不打扰');
    ok(/catchup\.nights\+' 个夜晚/.test(ui) && /fmtAgo\(catchup\.mins\*60000\)/.test(ui),
       '横幅逐字标明覆盖了多久、跨了几个夜晚');
    ok(/catchup\.capped \?/.test(ui) && /没有补算，那段日子没有发生/.test(ui),
       '触封顶时如实告知玩家「跳过了多少、那段日子没有发生」');
  }
}

console.log(fails? ('\n'+fails+' FAILURES') : '\nALL PASS');
process.exit(fails?1:0);
