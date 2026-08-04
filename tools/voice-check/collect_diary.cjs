/* 真模型验证·提示词发生器
 * 不重写任何提示词：直接从 city-life-framework.html 抽取 DOM 层的 AI_VOICE / hungerWord / agentCard
 * 源码求值，并复用 runReflection 的日记提示词模板原文，配合真实 Sim 世界状态，
 * 产出与生产逐字节相同的提示词。日记路径一次覆盖四人，6 轮即得四人各 6 次生成。
 *
 * 用法：
 *   node real_prompt.cjs init                     # 建世界、推进到首个日记时刻，输出第 1 轮提示词
 *   node real_prompt.cjs next '<上一轮回包JSON>'   # 记入 lastUtterance、推进一天、输出下一轮提示词
 * 状态存于 STATE_FILE，逐轮累积。
 */
const fs=require('fs'), path=require('path');
const HTML=path.resolve(__dirname,'../../city-life-framework.html');
const SP=process.env.VC_OUT || path.resolve(__dirname,'.work');
if(!fs.existsSync(SP)) fs.mkdirSync(SP,{recursive:true});
const STATE=path.join(SP,'real_state.json');
const APP=path.join(SP,'app_for_real.js');

const src=fs.readFileSync(HTML,'utf8');
fs.writeFileSync(APP, src.match(/<script>([\s\S]*)<\/script>/)[1]);
const {PURE, Sim}=require(APP);

/* —— 抽取生产源码求值（零重写）—— */
function grab(re,name){ const m=src.match(re); if(!m) throw new Error('抽取失败:'+name); return m[0]; }
const codeVoice=grab(/const AI_VOICE=\{[\s\S]*?\n\};/,'AI_VOICE');
const codeHunger=grab(/function hungerWord\(h\)\{[^\n]*\}/,'hungerWord');
const codeCard=grab(/function agentCard\(ag, hook\)\{[\s\S]*?\n\}/,'agentCard');
const codeAssign=grab(/const OPEN_KINDS=\[[\s\S]*?\nfunction styleAssign\(ag, hook\)\{[\s\S]*?\n\}/,'styleAssign');
const mk=new Function('return (function(){'+codeVoice+'\n'+codeHunger+'\n'+codeAssign+'\n'+codeCard+'\nreturn {agentCard, AI_VOICE};})()');
const {agentCard, AI_VOICE}=mk();

/* —— 日记提示词模板：逐字取自 runReflection —— */
// 日记提示词表达式原文（含 +cards+ 拼接），直接以 day/cards 为形参求值 → 与生产逐字节相同
const tpl=grab(/'都市生活模拟《云港小事》第'\+day\+'天深夜[\s\S]*?"a4":"\.\.\."\}'/,'diary tpl');
const buildPrompt=new Function('day','cards','return '+tpl);
function diaryPrompt(w, day){
  const cards=w.agents.map(ag=>{
    const today=ag.personalLog.slice(-4).map(e=>e.text+(e.thought?'（'+e.thought+'）':'')).join('；');
    return ag.id+' = '+agentCard(ag,'diary')+'｜今日片段:'+(today||'平平无奇的一天');
  }).join('\n');
  return buildPrompt(day, cards);
}

function saveW(w){ return Sim.serialize(w,{}); }
function loadW(s){ return Sim.hydrate(s).world; }
function stepToDiary(w){                       // 推进到当日 21:50（日记触发点）
  let guard=0;
  while(guard++<4000){
    Sim.step(w,10);
    if(PURE.minuteOfDay(w.t)>=1310) return;
  }
  throw new Error('未到日记时刻');
}

const cmd=process.argv[2];
if(cmd==='init'){
  const w=Sim.makeWorld(20260803);
  stepToDiary(w);
  const day=PURE.dayOf(w.t);
  const prompt=diaryPrompt(w, day);                       // 先派活（styleAssign 递增 aiTurn）
  const st={round:1, world:saveW(w), gens:{a1:[],a2:[],a3:[],a4:[]}};   // 再存档，派活记账才不丢
  fs.writeFileSync(STATE, JSON.stringify(st));
  fs.writeFileSync(path.join(SP,'round_prompt.txt'), prompt);
  console.log('第 1 轮提示词已写入 round_prompt.txt（'+diaryPrompt(w,day).length+' 字）');
} else if(cmd==='next'){
  const st=JSON.parse(fs.readFileSync(STATE,'utf8'));
  const w=loadW(st.world);
  const reply=JSON.parse(process.argv[3]);
  // 复刻生产 runReflection 的记账：写入日记＋noteUtter（截 80 字）
  for(const ag of w.agents){
    const txt=(typeof reply[ag.id]==='string')?reply[ag.id].trim():'';
    if(!txt) throw new Error('回包缺 '+ag.id);
    st.gens[ag.id].push(txt);
    ag.lastUtterance=String(txt).replace(/\s+/g,' ').trim().slice(0,80);
    ag.personalLog.push({t:w.t, text:'睡前日记', thought:txt});
    if(ag.personalLog.length>30) ag.personalLog.shift();
  }
  st.round++;
  if(st.round>6){
    fs.writeFileSync(STATE, JSON.stringify(Object.assign(st,{world:saveW(w)})));
    fs.writeFileSync(path.join(SP,'real_gens.json'), JSON.stringify(st.gens,null,1));
    console.log('六轮采集完成，已写入 real_gens.json');
    process.exit(0);
  }
  stepToDiary(w);
  const prompt=diaryPrompt(w, PURE.dayOf(w.t));           // 先派活，后存档
  st.world=saveW(w);
  fs.writeFileSync(STATE, JSON.stringify(st));
  fs.writeFileSync(path.join(SP,'round_prompt.txt'), prompt);
  console.log('第 '+st.round+' 轮提示词已写入 round_prompt.txt');
} else if(cmd==='show'){
  console.log(fs.readFileSync(path.join(SP,'round_prompt.txt'),'utf8'));
} else { console.log('用法: init | next <json> | show'); }
