// 第 27 单·兜底文案扩池 —— 日志墙全文实录（诊断工具，不是门禁：不进 gate.yml、不判红、只印原文）
//
// 复现「玩家离开三天再回来」那一段：世界落盘 → 补算 3 模拟日 → 把这段日子里
// 玩家在日志墙上真正看得见的两类条目**逐字**印出来（睡前日记 12 条 ＋ 全部闲聊）。
// 本单的唯一验收主证据就是这份实录——要读的是那段日子本身，不是统计数字。
//
// 用法（仓库根目录，须先按门禁第 1 步抽出 app.js）：
//   python3 -c "import re;m=re.search(r'<script>([\s\S]*)</script>',open('city-life-framework.html').read());open('app.js','w').write(m.group(1))"
//   node tools/fallback-pool/wall.cjs
//
// 本脚本只读：不改仓库任何文件，不写档，不出网。
const path=require('path');
const ROOT=path.resolve(__dirname,'..','..');
const {PURE, Sim}=require(path.join(ROOT,'app.js'));
const SEEDS=[20260803, 424242];        // 与 sim30.js／worldsig.js 同一组种子（全站一致）
const DAYS=3;                          // 离线天数＝ CATCHUP_MAX_DAYS 上沿

function away(seed){
  // 落盘再读回来，走的是玩家真实那条路（hydrate 后补算），不是内存里直接推
  const w0=Sim.makeWorld(seed);
  const w=Sim.hydrate(Sim.serialize(w0,{selected:'a1',lastReflectDay:0,at:1})).world;
  const r=Sim.catchUp(w, DAYS*144, 0);
  return {w, r};
}
const stamp=e=>PURE.fmtStamp(e.t);

for(const seed of SEEDS){
  const {w,r}=away(seed);
  console.log('\n'+'═'.repeat(78));
  console.log('种子 '+seed+' ｜ 离线 '+DAYS+' 天（'+r.ticks+' 拍 ＝ '+r.mins+' 模拟分钟）｜ 跨过「夜深了」'+r.nights+' 次');
  console.log('═'.repeat(78));

  const diary=w.log.filter(e=>e.type==='diary');
  const chat=w.log.filter(e=>e.type==='chat');

  // 逐字照 logLine 的形态印：时间戳 · 名字 · e.text · 「— 」e.thought（AI 写的会多一个 ✨，兜底没有）
  const wall=e=>'  '+stamp(e)+'  '+e.name+'  '+e.text+(e.thought?' — '+e.thought:'');

  console.log('\n── 睡前日记（'+diary.length+' 条）───────────────────────────────────────');
  for(const e of diary) console.log(wall(e));

  console.log('\n── 闲聊（'+chat.length+' 场）─────────────────────────────────────────');
  for(const e of chat) console.log(wall(e));

  // 重样读数：日记逐条比对全文；闲聊比对渲染出来的整句（两句拼在一起就是玩家看见的那一行）
  const dTexts=diary.map(e=>e.thought), cTexts=chat.map(e=>e.thought);
  const uniq=a=>new Set(a).size;
  const top=a=>{const m={};for(const s of a)m[s]=(m[s]||0)+1;let k='',n=0;for(const s in m)if(m[s]>n){n=m[s];k=s;}return {n,k};};
  console.log('\n── 重样读数 ────────────────────────────────────────────────');
  console.log('  日记：'+dTexts.length+' 条 ／ 不同 '+uniq(dTexts)+' 条'
    +(dTexts.length?'（最高频一条出现 '+top(dTexts).n+' 次，占 '+(top(dTexts).n*100/dTexts.length).toFixed(0)+'%）':''));
  console.log('  闲聊：'+cTexts.length+' 场 ／ 不同 '+uniq(cTexts)+' 种'
    +(cTexts.length?'（最高频一种出现 '+top(cTexts).n+' 次，占 '+(top(cTexts).n*100/cTexts.length).toFixed(0)+'%）':''));
}
