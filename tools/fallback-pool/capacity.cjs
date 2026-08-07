// 第 27 单·兜底文案扩池 —— 池容量实测（诊断工具，不是门禁：不进 gate.yml、不判红、只印读数）
//
// 回答两个问题，两个都用实测曲线回答，不许拍脑袋定一个数：
//   ① 多大的池，能让「离线 3 天」那 12 条日记不重样？
//   ② 多大的池，能让那 15–25 场闲聊不重样？
// 外加一份定容量真正依据的底数：**玩家一眼能看见多少条**（日志墙 400 条封顶下的单人日记条数峰值）
// 与**单日抽取峰值**（第 13 单既有口径「上墙池容量须 ≥ 全城单日抽取峰值」）。
//
// 关键性质（让下面这条曲线是干净的）：`pickV` 与 `pickFresh` **无论池多大都恰好消耗 1 次 rng**，
// 故把池截短再跑，世界演化逐字节不变——同样那 12 个日记时刻、同样那些场闲聊，
// 变的只有抽中的是哪一条字。曲线因此量的是纯粹的「池容量 → 重样」关系，不掺别的变量。
//
// 用法（仓库根目录，须先按门禁第 1 步抽出 app.js）：
//   python3 -c "import re;m=re.search(r'<script>([\s\S]*)</script>',open('city-life-framework.html').read());open('app.js','w').write(m.group(1))"
//   node tools/fallback-pool/capacity.cjs [窗口/峰值那一节的种子数，默认 300]
//
// 本脚本只读仓库文件：不改任何文件，不写档，不出网。
const path=require('path');
const ROOT=path.resolve(__dirname,'..','..');
const {PURE, Sim}=require(path.join(ROOT,'app.js'));
const SEEDS=[20260803, 424242];        // 与 sim30.js／worldsig.js 同一组
const DAYS=3;                          // 离线天数＝ CATCHUP_MAX_DAYS 上沿
const KINDS=['work','clerk','trade','write'];
const NAMES={work:'顾云帆', clerk:'沈小满', trade:'陆知秋', write:'白一鸣'};
const hr=t=>console.log('\n═══ '+t+' '+'═'.repeat(Math.max(0,60-t.length*2)));

// 池截短／还原：就地改数组内容（闭包持的是同一个引用，故生产代码立刻看得见）
function snapshot(tbl){ const o={}; for(const k of KINDS) o[k]=tbl[k].slice(); return o; }
function truncate(tbl, full, n){ for(const k of KINDS){ const a=tbl[k]; a.length=0; for(let i=0;i<Math.min(n,full[k].length);i++) a.push(full[k][i]); } }
function restore(tbl, full){ for(const k of KINDS){ const a=tbl[k]; a.length=0; for(const s of full[k]) a.push(s); } }
const DFULL=snapshot(Sim.DIARY_FB), OFULL=snapshot(Sim.CHAT_FB_OPEN), RFULL=snapshot(Sim.CHAT_FB_REPLY);
const minLen=o=>Math.min(...KINDS.map(k=>o[k].length));

function away(seed){
  const w=Sim.hydrate(Sim.serialize(Sim.makeWorld(seed),{selected:'a1',lastReflectDay:0,at:1})).world;
  const r=Sim.catchUp(w, DAYS*144, 0);
  return {
    nights:r.nights,
    diary:w.log.filter(e=>e.type==='diary').map(e=>e.thought),
    chat:w.log.filter(e=>e.type==='chat'&&e.with).map(e=>e.thought),
  };
}
const uniq=a=>new Set(a).size;
const topShare=a=>{ if(!a.length) return 0; const m={}; let n=0; for(const s of a){ m[s]=(m[s]||0)+1; if(m[s]>n) n=m[s]; } return n/a.length; };

/* ── 曲线① 日记：多大的池，12 条不重样 ─────────────────────────── */
hr('曲线① 日记池容量 → 离线 3 天那 12 条重不重样');
console.log('  抽法＝生产用的 pickFresh（最近 '+Sim.DIARY_FB_RECENT+' 条不再抽）。逐人同时截到 N 条。');
console.log('  N ＝逐人池容量；「不同」＝12 条里有几条互不相同（12 即全不重样）。\n');
console.log('    N   '+SEEDS.map(s=>('种子'+s).padStart(14)).join('  ')+'   判读');
for(let n=1;n<=minLen(DFULL);n++){
  truncate(Sim.DIARY_FB, DFULL, n);
  const cells=[], oks=[];
  for(const seed of SEEDS){ const a=away(seed); cells.push((uniq(a.diary)+' / 12').padStart(14)); oks.push(uniq(a.diary)===12); }
  console.log('   '+String(n).padStart(2)+'   '+cells.join('  ')+'   '+(oks.every(Boolean)?'✔ 全不重样':'✘ 有重样'));
}
restore(Sim.DIARY_FB, DFULL);

/* ── 对照：同一批次数改走 pickV（当日去重）会怎样 ────────────────── */
hr('对照 · 若日记改走 pickV（当日去重）');
console.log('  日记一天只落一轮、每人只抽一次，`pickV` 的当日去重对它**恒为空转**（跨天即清账）。');
console.log('  下面按日记的真实节奏（每人每天抽一次，连抽 3 天）跑 4000 颗种子，量「12 条全不重样」的比例：\n');
console.log('    N   pickV 全不重样比例    pickFresh 全不重样比例');
{
  const T=4000;
  for(const n of [3,5,8,10,12,15]){
    const pool=[]; for(let i=0;i<n;i++) pool.push('L'+i);
    let hitV=0, hitF=0;
    for(let s=0;s<T;s++){
      const wv=Sim.makeWorld(70000+s*31), wf=Sim.makeWorld(70000+s*31);
      const gv=[], gf=[];
      for(let d=0;d<DAYS;d++){
        wv.t=d*1440+21*60+50; wf.t=d*1440+21*60+50;
        for(const k of KINDS){ gv.push(k+Sim.pickV(wv,pool,null,'d:'+k)); gf.push(k+Sim.pickFresh(wf,pool,'d:'+k,Sim.DIARY_FB_RECENT)); }
      }
      if(uniq(gv)===12) hitV++;
      if(uniq(gf)===12) hitF++;
    }
    console.log('   '+String(n).padStart(2)+'   '+(100*hitV/T).toFixed(1).padStart(16)+'%   '+(100*hitF/T).toFixed(1).padStart(18)+'%');
  }
  console.log('\n  判读：pickV 那一列**在任何容量上都到不了 100%**——它拦的是同一天内的重复，');
  console.log('        而这 12 条分属 3 个不同的天。pickFresh 一到「容量 ≥ 连抽条数」就由构造保证 100%。');
  console.log('        故日记这一处不能照抄 pickV，须换「最近 N 条不再抽」。');
}

/* ── 曲线② 闲聊：多大的池，那些场不重样 ─────────────────────────── */
hr('曲线② 闲聊池容量 → 离线 3 天那些场重不重样');
console.log('  抽法＝生产用的 pickV（当日去重）。开口池与接话池同时截到 N 条。');
console.log('  玩家看见的是「上句」「下句」拼成的整行，故「不同」按整行比对。\n');
console.log('    N   '+SEEDS.map(s=>('种子'+s).padStart(20)).join('  ')+'   判读');
for(let n=1;n<=Math.min(minLen(OFULL),minLen(RFULL));n++){
  truncate(Sim.CHAT_FB_OPEN, OFULL, n); truncate(Sim.CHAT_FB_REPLY, RFULL, n);
  const cells=[], oks=[];
  for(const seed of SEEDS){
    const a=away(seed);
    cells.push((uniq(a.chat)+' / '+a.chat.length+'（顶格占 '+(100*topShare(a.chat)).toFixed(0)+'%）').padStart(20));
    oks.push(uniq(a.chat)===a.chat.length);
  }
  console.log('   '+String(n).padStart(2)+'   '+cells.join('  ')+'   '+(oks.every(Boolean)?'✔ 全不重样':'✘ 有重样'));
}
restore(Sim.CHAT_FB_OPEN, OFULL); restore(Sim.CHAT_FB_REPLY, RFULL);

/* ── 定容量真正依据的两个底数 ───────────────────────────────────── */
hr('定容量的两个底数（曲线只证「够不够 3 天」，容量按这两个数定）');
{
  const N=Number(process.argv[2]||300), D=30;
  const dPeak=[], oPeak=[], rPeak=[];
  for(let s=0;s<N;s++){
    const w=Sim.hydrate(Sim.serialize(Sim.makeWorld(1000000+s*7919),null)).world;
    let dPk=0,oPk=0,rPk=0, rd=0, curDay=PURE.dayOf(w.t);
    const dayO={}, dayR={};
    for(let i=0;i<D*144;i++){
      const lid0=w.lidSeq;
      const c=Sim.catchUp(w,1,rd); rd=c.lastReflectDay;
      const added=w.lidSeq-lid0;
      for(let j=Math.max(0,w.log.length-added);j<w.log.length;j++){
        const e=w.log[j];
        if(!e || e.type!=='chat' || !e.with) continue;
        const d=PURE.dayOf(e.t);
        if(d!==curDay){ curDay=d; for(const k in dayO) delete dayO[k]; for(const k in dayR) delete dayR[k]; }
        const ka=(w.agents.find(a=>a.id===e.agent)||{}).workKind, kb=(w.agents.find(a=>a.id===e.with)||{}).workKind;
        dayO[ka]=(dayO[ka]||0)+1; dayR[kb]=(dayR[kb]||0)+1;
        if(dayO[ka]>oPk) oPk=dayO[ka];
        if(dayR[kb]>rPk) rPk=dayR[kb];
      }
      if(c.nights){
        const cnt={}; for(const e of w.log) if(e && e.type==='diary' && e.agent) cnt[e.agent]=(cnt[e.agent]||0)+1;
        for(const k in cnt) if(cnt[k]>dPk) dPk=cnt[k];
      }
    }
    dPeak.push(dPk); oPeak.push(oPk); rPeak.push(rPk);
  }
  const st=(a,label,unit)=>{
    const n=a.length, mu=a.reduce((x,y)=>x+y,0)/n;
    const sd=Math.sqrt(a.reduce((x,y)=>x+(y-mu)*(y-mu),0)/n);
    const h={}; for(const v of a) h[v]=(h[v]||0)+1;
    console.log('  '+label);
    console.log('    均值 '+mu.toFixed(3)+' · sd '+sd.toFixed(4)+' · 最小 '+Math.min(...a)+' · **最大 '+Math.max(...a)+'** · 均值+5σ='+(mu+5*sd).toFixed(2));
    console.log('    分布：'+Object.keys(h).sort((x,y)=>x-y).map(k=>k+'→'+h[k]).join('  ')+'   （'+unit+'）');
  };
  console.log('  样本 '+N+' 颗种子 × '+D+' 天，补算模式（＝AI 缺席时那条路）\n');
  st(dPeak,'① 日志墙（w.log 封 400 条）上同时挂得住的**单人日记条数**峰值 ⇒ 定 DIARY_FB_RECENT','玩家一眼能看见几条');
  st(oPeak,'② 同一人**单日开口**次数峰值 ⇒ 定 CHAT_FB_OPEN 容量（第 13 单口径：池容量 ≥ 单日抽取峰值）','次/人/日');
  st(rPeak,'③ 同一人**单日接话**次数峰值 ⇒ 定 CHAT_FB_REPLY 容量（同上）','次/人/日');
  console.log('\n  现行取值：DIARY_FB_RECENT='+Sim.DIARY_FB_RECENT
    +' ／ 日记池 '+KINDS.map(k=>Sim.DIARY_FB[k].length).join('/')
    +' ／ 开口池 '+KINDS.map(k=>Sim.CHAT_FB_OPEN[k].length).join('/')
    +' ／ 接话池 '+KINDS.map(k=>Sim.CHAT_FB_REPLY[k].length).join('/')+'（'+KINDS.map(k=>NAMES[k]).join('/')+'）');
}
