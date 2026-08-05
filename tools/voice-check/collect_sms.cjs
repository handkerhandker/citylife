/* 单人通道（短信）补测：验证"四类轮换不达标"是否只是日记批量调用摊薄注意力所致。
 * 提示词同样逐字取自生产 enhanceMessage，不重写。 */
const fs=require('fs'), path=require('path');
const HTML=path.resolve(__dirname,'../../city-life-framework.html');
const SP=process.env.VC_OUT || path.resolve(__dirname,'.work');
if(!fs.existsSync(SP)) fs.mkdirSync(SP,{recursive:true});
const STATE=path.join(SP,'sms_state.json');
const src=fs.readFileSync(HTML,'utf8');
const APP=path.join(SP,'app_for_real.js');
fs.writeFileSync(APP, src.match(/<script>([\s\S]*)<\/script>/)[1]);
const {PURE, Sim}=require(APP);
function grab(re,n){ const m=src.match(re); if(!m) throw new Error('抽取失败:'+n); return m[0]; }
// 生产的 agentCard 读两个 DOM 层环境量：Sim（第 17 单起用 Sim.currentSit 取当天处境）与 state.world。
// 如实供给同名环境量，被求值的仍是生产源码原文（详见 collect_diary.cjs 同处注释）。
const vcState={world:null};
const mk=new Function('Sim','state','return (function(){'
  +grab(/const AI_VOICE=\{[\s\S]*?\n\};/,'voice')+'\n'
  +grab(/const SIT_MOOD=\{[\s\S]*?\};/,'mood')+'\n'                       // 第 18 单：agentCard 改由档位标签取词
  +grab(/function hungerWord\(h\)\{[^\n]*\}/,'hunger')+'\n'
  +grab(/const OPEN_KINDS=\[[\s\S]*?\nfunction styleAssign\(ag, hook\)\{[\s\S]*?\n\}/,'assign')+'\n'   // 含第 18 单 DIARY_OPEN_KINDS
  +grab(/function agentCard\(ag, hook\)\{[\s\S]*?\n\}/,'card')+'\nreturn {agentCard};})()');
const {agentCard}=mk(Sim, vcState);
// enhanceMessage 的提示词表达式原文（形参 ag / msgLabel）
const tpl=grab(/'你是都市生活模拟游戏里的角色，请完全入戏。[\s\S]*?"reply":"回的短信原文或空字符串"\}'/,'sms tpl');
const build=new Function('ag','msgLabel','agentCard','return '+tpl.replace(/\(e\.msgLabel\|\|\(m\?m\.label:''\)\)/,'msgLabel'));

const MSGS=['记得吃饭','别迟到！','加油！','早点睡','今天辛苦了','忙完早点休息'];
const ID='a4';
const cmd=process.argv[2];
if(cmd==='init'){
  const w=Sim.makeWorld(20260803);
  for(let i=0;i<80;i++) Sim.step(w,10);
  vcState.world=w;                       // agentCard 经 state.world 判定「当天」，取卡前先对齐世界
  const ag=w.agents.find(a=>a.id===ID);
  const prompt=build(ag, MSGS[0], function(a){return agentCard(a,'sms');});   // 先派活
  fs.writeFileSync(STATE, JSON.stringify({round:1, world:Sim.serialize(w,{}), gens:[]}));
  fs.writeFileSync(path.join(SP,'sms_prompt.txt'), prompt);
  console.log('短信第 1 轮提示词已写入 sms_prompt.txt');
} else if(cmd==='next'){
  const st=JSON.parse(fs.readFileSync(STATE,'utf8'));
  const w=Sim.hydrate(st.world).world;
  vcState.world=w;                       // 同上：续轮同样先对齐
  const ag=w.agents.find(a=>a.id===ID);
  const rep=JSON.parse(process.argv[3]);
  const said=(typeof rep.reply==='string'&&rep.reply.trim())?rep.reply.trim():String(rep.inner||'').trim();
  if(!said) throw new Error('回包空');
  st.gens.push(said);
  ag.lastUtterance=said.replace(/\s+/g,' ').trim().slice(0,80);   // 复刻 noteUtter
  st.round++;
  for(let i=0;i<30;i++) Sim.step(w,10);
  if(st.round>6){ st.world=Sim.serialize(w,{}); fs.writeFileSync(STATE, JSON.stringify(st));
    fs.writeFileSync(path.join(SP,'sms_gens.json'), JSON.stringify(st.gens,null,1)); console.log('六轮完成 → sms_gens.json'); process.exit(0); }
  const prompt=build(w.agents.find(a=>a.id===ID), MSGS[(st.round-1)%MSGS.length], function(a){return agentCard(a,'sms');});
  st.world=Sim.serialize(w,{});          // 先派活后存档，否则 aiTurn 记账丢失、每轮都从头派
  fs.writeFileSync(STATE, JSON.stringify(st));
  fs.writeFileSync(path.join(SP,'sms_prompt.txt'), prompt);
  console.log('短信第 '+st.round+' 轮提示词已写入 sms_prompt.txt');
}
