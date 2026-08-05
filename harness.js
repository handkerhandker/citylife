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
  // 工作时段外沿（含 工作狂 −30 与 短信「别迟到」earlyWork −30 两档提前量），午休 12:00–13:00 挖空
  const WIN={a1:[8.5*60,18*60], a2:[9.5*60,19*60], a3:[8*60,18*60], a4:[9*60,17*60]};
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
        if(!win || mod<win[0] || mod>=win[1] || (mod>=12*60 && mod<13*60)) outOfWindow++;
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
    +'\nreturn {agentCard, styleAssign, SIT_MOOD, OPEN_KINDS, DIARY_OPEN_KINDS, leadsWithInterj, chatLeadBad, reOpenKind, redoLead};})()');
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
console.log(fails? ('\n'+fails+' FAILURES') : '\nALL PASS');
process.exit(fails?1:0);
