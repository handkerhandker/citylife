// 走位三铁律门禁（第 20 单立）。被验的是 city-life-framework.html 的渲染层原文，不是副本。
//
// 立这三条的缘由：瞬移是重复犯病（补充指令三、四、第 19 单各栽过一次），
// 每次都靠人眼看出来、靠交付件里写一句「已知接受项」放行，下一单照样复发。
// 故本单留机器可查的闸：位移看得见上限、走线穿不过实体、显示位只许有一个来源。
//
//   规矩一 · 逐帧位移上限   ——「跳变」这件事有了数值判据，不再靠目验
//   规矩二 · 全程不得穿实体 ——第 19 单只校验静止落位，本单扩到移动全程
//   规矩三 · 显示位置只有一个来源——反向断言：绘制期对站位表零引用
//
// 用法：node walkgate.js （须先由 gate.yml 抽出 app.js）
const fs=require('fs'), path=require('path');
const {Sim}=require('./app.js');

// ── 阈值集中区（可调；放宽须在交付件里说明理由） ──
const SEEDS=[20260803, 424242];   // 与 sim30 同两颗种子，便于对账
const DAYS=3;                     // 逐帧采样天数：3 天 ×144 拍 ×60 帧 ×2 速 ×2 种子 ≈ 62 万帧/人
const FPS=60;                     // 主采样帧率
const WALK=5.5;                   // 口径：updateWalkers 里的行走速率（格/秒），本闸的位移上限由它推出
const STEP_SLACK=1.05;            // 单帧位移阈值 = WALK×速度×dt×本系数（5% 浮点与实现余量）
const COARSE_DT=0.1;              // 压力档：主循环 dtFrame 的封顶值（掉帧到 10fps 的最坏情形），验上限随 dt 缩放而非只在 60fps 成立

let fails=0;
const ok=(c,m)=>{ if(!c){fails++; console.log('FAIL:',m);} else console.log(' ok :',m); };

// ── 从生产源码抽取渲染层原文 ──
const src=fs.readFileSync(path.resolve(__dirname,'city-life-framework.html'),'utf8');
const DOM=src.slice(src.indexOf('/*SIM-END*/'));
const grab=(re,name)=>{ const m=src.match(re); if(!m){ ok(false,'源码抽取失败:'+name); return ''; } return m[0]; };
const state={world:null, vis:{}, reduceMotion:false, selected:'a1'};
const V=new Function('Sim','state','return (function(){'
 +grab(/const APT=\{[^}]*\};/,'APT')+'\n'
 +grab(/const PIX_IDX=\{[^}]*\};/,'PIX_IDX')+'\n'
 +grab(/const PIX_FURN_TALL=\[[\s\S]*?\]\];/,'PIX_FURN_TALL')+'\n'
 +grab(/const PIX_SOLID=new Set\(\[[^\]]*\]\);/,'PIX_SOLID')+'\n'
 +grab(/function pixStandPos\(v\)\{[\s\S]*?\n\}/,'pixStandPos')+'\n'
 +grab(/const STAND_SPOTS=\{[\s\S]*?\nfunction standSpot\(ag\)\{[\s\S]*?\n\}/,'STAND_SPOTS')+'\n'
 +grab(/const BUILDING_OF=\{[^}]*\};/,'BUILDING_OF')+'\n'
 +grab(/const BUILDING_PLAN=\{[\s\S]*?\n\};/,'BUILDING_PLAN')+'\n'
 +grab(/const BUILDING_BODY=\(function\(\)\{[\s\S]*?\n\}\)\(\);/,'BUILDING_BODY')+'\n'
 +grab(/function buildingAt\(x,y,room\)\{[\s\S]*?\n\}/,'buildingAt')+'\n'
 +grab(/const SOLID_STEP=[\s\S]*?\nfunction buildPathRaw\(fromX,fromY,toAnchorId,spot\)\{[\s\S]*?\n\}\nfunction updateWalkers/,'走线段')
     .replace(/\nfunction updateWalkers$/,'')+'\n'
 +grab(/function updateWalkers\(dtSec\)\{[\s\S]*?\n\}\n\/\* -+ 第 20 单·规矩三/,'updateWalkers')
     .replace(/\n\/\* -+ 第 20 单·规矩三$/,'')+'\n'
 +grab(/function stepDisplay\(ag,dtSec,pixOn\)\{[\s\S]*?\n\}\nlet rainSeed/,'stepDisplay')
     .replace(/\nlet rainSeed$/,'')+'\n'
 +'return {APT,PIX_IDX,PIX_FURN_TALL,PIX_SOLID,pixStandPos,STAND_SPOTS,standSpot,'
 +'segHitsSolid,avoidSolids,buildPath,updateWalkers,stepDisplay};})()')(Sim,state);

const footCell=(x,y)=>Math.floor(x)+','+Math.floor(y+0.5);
const roomAt=(gx,gy)=>Sim.ROOMS.find(r=>gx>=r.x&&gx<r.x+r.w&&gy>=r.y&&gy<r.y+r.h);
// 该脚底格所在处的横向净宽（房内连续非实体格数）——用来量「有没有从窄缝里挤过去」
function aisleW(gx,gy){
  if(!roomAt(gx,gy)) return 99;
  let n=1,x=gx-1;
  while(!V.PIX_SOLID.has(x+','+gy)&&roomAt(x,gy)){n++;x--;}
  x=gx+1; while(!V.PIX_SOLID.has(x+','+gy)&&roomAt(x,gy)){n++;x++;}
  return n;
}
function boot(seed){
  const w=Sim.makeWorld(seed); state.world=w; state.vis={};
  for(const ag of w.agents){ const a=Sim.ANCHORS[ag.anchor];
    state.vis[ag.id]={x:a.x+0.5,y:a.y+0.5,path:[],anchor:ag.anchor,dir:3,moving:false}; }   // 与生产源码 state.vis 初值同文
  return w;
}
/* 第 26 单·离线追帧：开机时**先补算、再建 state.vis**（与生产源码同序，见 html「离线追帧」段）。
   这个先后顺序就是「补算期间零渲染层动作」的全部机理——补算跑完之前显示位压根不存在，
   一帧都画不出来，故既不必、也无从「切回时补一次直置」（第 25 单不新增直置通道的口径得以延续）。 */
function bootCatchUp(seed, ticks){
  const w=Sim.makeWorld(seed); state.world=w; state.vis={};
  Sim.catchUp(w, ticks, 0);                        // ← 补算：此刻 state.vis 是空的，stepDisplay 无从被调用
  for(const ag of w.agents){ const a=Sim.ANCHORS[ag.anchor];
    state.vis[ag.id]={x:a.x+0.5,y:a.y+0.5,path:[],anchor:ag.anchor,dir:3,moving:false}; }
  return w;
}

/* ═══ 规矩一 ＋ 规矩二：逐帧采样实测 ═══
   复演主循环 loop() 的调用序：累时→Sim.step→updateWalkers→stepDisplay，逐帧取显示坐标。 */
function sample(seed,speed,dt,days){
  const w=boot(seed); w.speed=speed; let acc=0;
  const r={maxStep:0,maxWho:'',maxAt:0,warps:0,warpFrames:[],solid:{},solidFrames:0,
           clampHits:0,badPath:0,badPathEg:'',frames:0,pathsBuilt:0,offRoom:{},narrow:{},minAisle:99};
  const prev={}, lastPath={};
  const nFrames=days*144*Math.round(1/dt*(10/10));                       // 1 真秒＝10 模拟分钟，1 拍＝10 分钟 → 1 拍/秒
  for(let f=0;f<nFrames;f++){
    acc+=dt*10*w.speed;
    if(acc>=10){ const c=Math.floor(acc/10)*10; Sim.step(w,c); acc-=c; }
    const before={};
    for(const ag of w.agents){ const v=state.vis[ag.id]; before[ag.id]={x:v.x,y:v.y}; }
    V.updateWalkers(dt);
    for(const ag of w.agents){
      const v=state.vis[ag.id];
      // 规矩二·其一：新铺的走线折线本身必须全程避开实体格（0.02 格采样，远细于单帧步长）
      if(v.path!==lastPath[ag.id]){
        lastPath[ag.id]=v.path; r.pathsBuilt++;
        let ax=before[ag.id].x, ay=before[ag.id].y;
        for(const p of v.path){
          if(V.segHitsSolid(ax,ay,p.x,p.y)){ r.badPath++; if(!r.badPathEg) r.badPathEg=ag.id+' @'+w.t+' ('+ax.toFixed(2)+','+ay.toFixed(2)+')→('+p.x+','+p.y+')'; }
          // 避实体改线造的航点恒为格心 (gx+0.5, gy)；门点/街心点是原文既有航点，y 非整数，不在本条管辖内。
          // 竖向墙体不在 PIX_SOLID 里（登记表只收墙带与家具占格），故改线若跑出房间就是穿墙——必须单独断言。
          if(Number.isInteger(p.y) && Math.abs(p.x-Math.floor(p.x)-0.5)<1e-9){
            const gx=Math.floor(p.x), gy=Math.floor(p.y+0.5);
            if(!roomAt(gx,gy)){ const k=gx+','+gy; r.offRoom[k]=(r.offRoom[k]||0)+1; }
          }
          ax=p.x; ay=p.y;
        }
      }
      const warped=(v.dspX===undefined)||!!v.warp;
      const tgt={x:v.x,y:v.y};
      V.stepDisplay(ag,dt,true);
      if(Math.abs(v.dspX-tgt.x)>1e-9 && !v.path.length && !v.moving){ /* 钳制或限速中，非错误 */ }
      // 规矩一：逐帧位移上限（豁免首帧落位与 reduceMotion 直置——两处均打 warp 标，本闸单独计数并核对上限）
      const p=prev[ag.id];
      if(warped){ r.warps++; r.warpFrames.push({id:ag.id,t:w.t,d:p?Math.hypot(v.dspX-p.x,v.dspY-p.y):0}); }
      else if(p){
        const d=Math.hypot(v.dspX-p.x, v.dspY-p.y);
        if(d>r.maxStep){ r.maxStep=d; r.maxWho=ag.id; r.maxAt=w.t; }
      }
      // 规矩二·其二：逐帧脚底格不得落在实体格（移动中与静止一视同仁）
      const cell=footCell(v.dspX,v.dspY);
      if(V.PIX_SOLID.has(cell)){ r.solid[cell]=(r.solid[cell]||0)+1; r.solidFrames++; }
      { const gx=Math.floor(v.dspX), gy=Math.floor(v.dspY+0.5), a=aisleW(gx,gy);
        if(a<r.minAisle) r.minAisle=a;
        if(a<2){ const k=gx+','+gy+'(净宽'+a+'格)'; r.narrow[k]=(r.narrow[k]||0)+1; } }
      // 兜底钳制应恒为空操作：走线已保证脚底非实体格
      if(!v.moving){ const q=V.pixStandPos({x:v.x,y:v.y}); if(q.x!==v.x||q.y!==v.y) r.clampHits++; }
      prev[ag.id]={x:v.dspX,y:v.dspY};
      r.frames++;
    }
  }
  return r;
}

console.log('── 规矩一 · 逐帧位移上限 ────────────────────────────────');
console.log('   判据：正常运行下相邻两帧显示位移 ≤ 行走速率×速度×dt×'+STEP_SLACK+'（豁免首帧落位与 reduceMotion 直置，两者打 warp 标）');
{
  let worstRatio=0, worstLine='', totalFrames=0, allSolid={}, solidFrames=0, clamp=0, badPath=0, badPathEg='', warpTotal=0, warpMax=0;
  const runs=[];
  for(const dt of [1/FPS, COARSE_DT]) for(const speed of [1,2]) for(const seed of SEEDS){
    const days=(dt===COARSE_DT)?DAYS:DAYS;
    const r=sample(seed,speed,dt,days);
    const cap=WALK*speed*dt*STEP_SLACK;
    const ratio=r.maxStep/cap;
    runs.push({dt,speed,seed,r,cap,ratio});
    if(ratio>worstRatio){ worstRatio=ratio; worstLine=`seed ${seed} ${speed}× dt=${dt.toFixed(4)}s`; }
    totalFrames+=r.frames; solidFrames+=r.solidFrames; clamp+=r.clampHits; badPath+=r.badPath;
    if(!badPathEg) badPathEg=r.badPathEg;
    for(const k in r.solid) allSolid[k]=(allSolid[k]||0)+r.solid[k];
    warpTotal+=r.warps; for(const x of r.warpFrames) warpMax=Math.max(warpMax,x.d);
  }
  for(const q of runs){
    console.log(`   seed ${q.seed} ${q.speed}× dt=${q.dt.toFixed(4)}s  实测最大单帧位移 ${q.r.maxStep.toFixed(5)} 格`
      +` / 阈值 ${q.cap.toFixed(5)} 格 → 用掉 ${(q.ratio*100).toFixed(1)}%，余量 ${((1-q.ratio)*100).toFixed(1)}%`
      +`   （warp 直置 ${q.r.warps} 次）`);
    ok(q.r.maxStep<=q.cap, `[seed ${q.seed} ${q.speed}× dt=${q.dt.toFixed(4)}] 单帧位移 ${q.r.maxStep.toFixed(5)} ≤ ${q.cap.toFixed(5)} 格`);
    // 豁免通道不得被滥用：正常运行下 warp 只许出现在每人首帧落位，共 ＝ 住户人数
    ok(q.r.warps===state.world.agents.length,
      `[seed ${q.seed} ${q.speed}× dt=${q.dt.toFixed(4)}] warp 直置恰 ${state.world.agents.length} 次＝每人首帧落位一次（实测 ${q.r.warps}）`);
  }
  // 绝对上限：主循环把 dtFrame 封顶在 COARSE_DT，速度档最高 2×，故任何情形下的单帧位移都不得超过这个数。
  // 这一条才是「瞬移」的正面判据 —— 本单前实测最坏 4.671 格，直接击穿；治后最坏 1.100 格。
  const ABS=WALK*2*COARSE_DT*STEP_SLACK;
  const absMax=Math.max(...runs.map(q=>q.r.maxStep));
  ok(absMax<=ABS, `绝对上限：任何速度档/任何 dt 下单帧位移 ≤ ${ABS.toFixed(3)} 格（实测最坏 ${absMax.toFixed(3)} 格，`
    +`余量 ${(ABS-absMax).toFixed(3)} 格＝${((1-absMax/ABS)*100).toFixed(1)}%；本单前同口径实测 4.671 格，已击穿）`);
  console.log(`   汇总：采样 ${totalFrames} 人帧，最紧一档 ${worstLine}，阈值用掉 ${(worstRatio*100).toFixed(1)}%`);
  console.log(`   读法：实测值恒等于「行走速率×速度×dt」本身 —— 限速器从未成为瓶颈，`
    +`显示位一步不多走。阈值贴着这条物理上限立，故余量只留 ${((STEP_SLACK-1)*100).toFixed(0)}% 浮点量。`);

  console.log('\n── 规矩二 · 全程不得穿实体 ──────────────────────────────');
  console.log('   判据：PIX_SOLID（＝ build_assets.py 的 GAME_SOLID_CELLS 登记表，墙带＋家具占格）；移动全程与静止落位一视同仁');
  ok(solidFrames===0, `逐帧脚底格零落入实体格（采样 ${totalFrames} 人帧，命中 ${solidFrames} 帧`
    +(solidFrames?` [${Object.entries(allSolid).sort((a,b)=>b[1]-a[1]).map(([k,n])=>k+'×'+n).join(' ')}]`:'')+'）');
  ok(badPath===0, `每条新铺走线的折线自身零穿实体（0.02 格采样，越界 ${badPath} 段`+(badPathEg?`，例：${badPathEg}`:'')+'）');
  ok(clamp===0, `兜底钳制 pixStandPos 恒为空操作（生效 ${clamp} 次；一旦生效即意味着走线放人踩进了实体格）`);

  // 竖向墙体不在 PIX_SOLID 内，故「不踩实体格」并不蕴含「不穿墙」，须单独立断言
  let off={}; for(const q of runs) for(const k in q.r.offRoom) off[k]=(off[k]||0)+q.r.offRoom[k];
  ok(Object.keys(off).length===0,
    `避实体改线造的航点全部落在房间内（零穿墙；越界 ${Object.keys(off).length} 处`
    +(Object.keys(off).length?` [${Object.keys(off).join(' ')}]`:'')+'）');

  // 净宽读数：不是断言而是读数 —— 房间与家具的放样属《云港建筑规范》管辖，本单不动放样，只如实报告走线用到的最窄处
  let nar={}, minA=99;
  for(const q of runs){ minA=Math.min(minA,q.r.minAisle); for(const k in q.r.narrow) nar[k]=(nar[k]||0)+q.r.narrow[k]; }
  const narFrames=Object.values(nar).reduce((a,b)=>a+b,0);
  ok(minA>=1, `走线途经的最窄净宽 ${minA} 格（≥1 格＝人宽下限；实测最窄处 `
    +(Object.keys(nar).length?`${Object.entries(nar).map(([k,n])=>k+'×'+n+'人帧').join(' ')}，占 ${(narFrames/totalFrames*100).toFixed(3)}%`:'无')+'）');
  if(Object.keys(nar).length) console.log('   注：净宽 <2 格处属既有放样（第 11 单甲案客厅），非本单引入；'
    +'《云港建筑规范》二.1 管的是「放样时不得按 1 格通道设计」，改放样超出本单渲染层范围，已入待办。');
}

/* ═══ 规矩三：显示位置只有一个来源 ═══
   反向断言：站位偏移在绘制阶段零引用；v.dspX/v.dspY 只有一处写入。 */
console.log('\n── 规矩三 · 显示位置只有一个来源 ────────────────────────');
console.log('   判据：绘制期对站位表零引用 ＋ v.dspX/v.dspY 只有一处写入 ＋ 站位只经 buildPath 进入走线');
{
  const drawSrc=grab(/function draw\(now\)\{[\s\S]*?\n\}\n\/\/ 画布：拖动/,'draw()').replace(/\n\/\/ 画布：拖动$/,'');
  const stepSrc=grab(/function stepDisplay\(ag,dtSec,pixOn\)\{[\s\S]*?\n\}\nlet rainSeed/,'stepDisplay').replace(/\nlet rainSeed$/,'');
  const hits=(s,re)=>(s.match(re)||[]).length;

  const inDraw=hits(drawSrc,/standSpot|STAND_SPOTS/g);
  ok(inDraw===0, `draw() 对 standSpot/STAND_SPOTS 零引用（实测 ${inDraw} 处）—— 这条断言就是「渲染期贴偏移」写法的门闩`);
  ok(hits(stepSrc,/standSpot|STAND_SPOTS/g)===0, 'stepDisplay 对站位表零引用（偏移只能从 v.x/v.y 一条链进来）');

  // v.dspX / v.dspY 的写入点普查：整个 DOM 层只许 stepDisplay 一处
  const WRITE=/\bv\.dsp[XY]\s*(?:=(?!=)|\+=|-=|\*=|\/=)/g;
  const domWrites=hits(DOM,WRITE), stepWrites=hits(stepSrc,WRITE);
  ok(domWrites===stepWrites && stepWrites>0,
    `v.dspX/v.dspY 的写入全部落在 stepDisplay 一处（全渲染层 ${domWrites} 处 = stepDisplay 内 ${stepWrites} 处）`);

  // standSpot 的调用点普查：定义 1 处 + updateWalkers 里取站位 1 处，别处一律不许再取
  const callSites=hits(DOM,/standSpot\(/g)-hits(DOM,/function standSpot\(/g);
  const uwSrc=grab(/function updateWalkers\(dtSec\)\{[\s\S]*?\n\}\n\/\* -+ 第 20 单·规矩三/,'updateWalkers');
  ok(callSites===1 && hits(uwSrc,/standSpot\(/g)===1,
    `standSpot 全渲染层仅 1 个调用点且在 updateWalkers 内（实测 ${callSites} 处）`);

  // 站位必须作为 buildPath 的终点参数进入，而不是事后叠加
  ok(/buildPath\(v\.x,v\.y,ag\.anchor,sp\)/.test(uwSrc),
    'buildPath 的终点参数直接收站位（起点 v.x/v.y ＝人当前实际所在处，终点＝站位本身）');
  ok(/const target=\{x:a\.x\+0\.5\+\(spot\?spot\[0\]:0\)/.test(DOM),
    'buildPathRaw 的 target 由「锚点显示点＋站位」算出，锚点中心不再是终点');
  // 距离式旁路必须已经拆掉：它正是 4.61 格偏移溜过平滑器的那道缝
  ok(!/Math\.hypot\(tx-v\.dspX,ty-v\.dspY\)>3/.test(DOM),
    '平滑器的「位移>3 格即直置」距离旁路已拆除（改为只认显式 warp 标）');
  ok(/if\(v\.dspX===undefined \|\| v\.warp\)/.test(stepSrc),
    '直置只认显式 warp 标（首帧落位 / reduceMotion 两处设置，别处不许设）');
  const warpSet=hits(DOM,/\bv\.warp\s*=\s*true/g);
  ok(warpSet===1, `v.warp 全渲染层仅 1 处置位（updateWalkers 的豁免分支，实测 ${warpSet} 处）`);
}

/* ═══ 病症一：站位精灵与高件家具的遮挡关系 ═══ */
console.log('\n── 病症一 · 站位不得被家具盖住 ──────────────────────────');
console.log('   判据：精灵包围盒（横 1 格纵 2 格）若与高件家具绘制矩形相交，则站位脚底 y 必须严格大于该家具脚底 y');
{
  const FURN=['sofa','shelf','desk','table','fridge','stove','counter'];
  const A=V.APT;
  const rects=V.PIX_FURN_TALL.map((f,i)=>({name:FURN[i]||('furn'+i),
    x0:A.x+f[0]/48, x1:A.x+(f[0]+f[2])/48, y0:A.y+f[1]/48, y1:A.y+(f[1]+f[3])/48, foot:f[4]}));
  let bad=0, worst=1e9, worstMsg='—', overlaps=0;
  for(const k of Object.keys(V.STAND_SPOTS)){
    const a=Sim.ANCHORS[k];
    V.STAND_SPOTS[k].forEach((d,i)=>{
      const x=a.x+0.5+d[0], y=a.y+0.5+d[1], foot=y+0.5;
      const sp={x0:x-0.5,x1:x+0.5,y0:foot-2,y1:foot};
      for(const r of rects){
        if(Math.min(sp.x1,r.x1)<=Math.max(sp.x0,r.x0)) continue;
        if(Math.min(sp.y1,r.y1)<=Math.max(sp.y0,r.y0)) continue;
        overlaps++;
        const margin=foot-r.foot;
        if(margin<=0){ bad++; console.log(`   ✗ ${k}#${i} 落点(${x},${y}) 脚底 ${foot} ≤ ${r.name} 脚底 ${r.foot} → 被盖住`); }
        if(margin<worst){ worst=margin; worstMsg=`${k}#${i} vs ${r.name}`; }
      }
    });
  }
  ok(bad===0, `与家具相交的 ${overlaps} 个站位全部画在家具之前（被盖住 ${bad} 处；最薄一处余量 ${worst.toFixed(3)} 格：${worstMsg}）`);
}

/* ═══ 反向自查：三条闸对「本单前的写法」必须真的拦得住 ═══
   一条恒绿的闸等于没立。故逐条复演病态写法，断言它确实被判违规。 */
console.log('\n── 反向自查 · 三条闸不是摆设 ────────────────────────────');
{
  // 规矩一：把偏移改回「绘制期贴／撤」＋「位移>3 即直置」的旧写法，复演同一段时间轴
  function sampleLegacy(seed,speed,dt,days){
    const w=boot(seed); w.speed=speed; let acc=0;
    let maxStep=0, warps=0, warpMax=0;
    const prev={};
    for(let f=0;f<days*144*Math.round(1/dt);f++){
      acc+=dt*10*w.speed;
      if(acc>=10){ const c=Math.floor(acc/10)*10; Sim.step(w,c); acc-=c; }
      V.updateWalkers(dt);
      for(const ag of w.agents){
        const v=state.vis[ag.id];
        let tx=v.x, ty=v.y;
        if(!v.path.length){ const sp=V.standSpot(ag); tx=v.x+sp[0]; ty=v.y+sp[1]; }   // ← 旧写法：绘制期叠加偏移
        let warped=false;
        if(v.dspX===undefined || Math.hypot(tx-v.dspX,ty-v.dspY)>3){                  // ← 旧写法：距离式旁路
          if(v.dspX!==undefined){ warped=true; warpMax=Math.max(warpMax,Math.hypot(tx-v.dspX,ty-v.dspY)); warps++; }
          v.dspX=tx; v.dspY=ty;
        } else {
          const dx=tx-v.dspX, dy=ty-v.dspY, len=Math.hypot(dx,dy), cap=(5.5*w.speed+6)*dt;
          if(len<=cap){ v.dspX=tx; v.dspY=ty; } else { v.dspX+=dx/len*cap; v.dspY+=dy/len*cap; }
        }
        const p=prev[ag.id];
        if(p){ const d=Math.hypot(v.dspX-p.x,v.dspY-p.y); if(d>maxStep) maxStep=d; }
        prev[ag.id]={x:v.dspX,y:v.dspY};
      }
    }
    return {maxStep,warps,warpMax};
  }
  const L=sampleLegacy(SEEDS[0],1,1/FPS,DAYS);
  const cap=WALK*1*(1/FPS)*STEP_SLACK;
  ok(L.warpMax>cap*3,
    `规矩一拦得住旧写法：绘制期贴偏移＋距离旁路，实测直置 ${L.warps} 次、最大 ${L.warpMax.toFixed(3)} 格`
    +`＝阈值 ${cap.toFixed(5)} 格的 ${(L.warpMax/cap).toFixed(0)} 倍（治后同口径 0 次）`);

  // 规矩二：本单前的「客厅门 → 餐桌左椅」那一根直线，必须被判为穿实体
  ok(V.segHitsSolid(6.5,11.5,2.5,9.5),
    '规矩二拦得住旧走线：「客厅门(6.5,11.5) → 餐桌左椅旧位(2.5,9.5)」直线被判穿实体（这正是病症三的那一根线）');
  ok(!V.segHitsSolid(6.5,11.5,6.5,9.5),
    '规矩二不误伤：同起点的一条不碰家具的直线判为合规（非「见线就报」）');

  // 规矩三：判据是源码正则，故须证明它对病态写法会命中
  const BAD='let tx=v.x; if(!v.path.length){ const sp=standSpot(ag); tx=v.x+sp[0]; }';
  ok(/standSpot|STAND_SPOTS/.test(BAD), '规矩三拦得住旧写法：绘制期叠加站位偏移的源码原文会被判据命中');
  ok(!/standSpot|STAND_SPOTS/.test('let tx=v.x, ty=v.y;'), '规矩三不误伤：单一来源的取位写法不命中');
}

/* ═══ 第 25 单 · 渲染停摆普查：铁律一二的采样范围扩张 ═══
   第 20 单立的三条铁律判据本身没错，错在**采样范围**：上面的 sample() 每一帧都紧跟着
   updateWalkers 调一次 stepDisplay，等于默认「显示推进从不停摆」。而生产代码里 stepDisplay
   原本长在 draw() 内，draw() 又挂在 `#scr-live.active` 判据下 —— 一切页，显示推进就停了，
   真实位却照走。这段落差不在任何单帧里体现为超限位移，而是攒成「真实位与显示位之差」，
   切回时被平滑器按直线一路补掉（实测差最大 36.35 格，补线扫穿家具最多 35 帧）。
   故第 25 单补两样：
     ① 判据加一条**真显差恒零**——落差本身就是病，不必等它变成超限位移才报；
     ② 采样范围覆盖七种「渲染停摆而 SIM 继续」的情形，每种都逐帧验规矩一与规矩二。

   本节不写死任何「已修好」的常数：DISP_IN_LOOP 是从生产源码读出来的。
   谁把显示推进挪回 draw()，它立刻翻成 false，切页情形的停摆模型随之改变，三条断言当场变红。 */
console.log('\n── 第 25 单 · 渲染停摆普查（铁律一二的采样范围扩张）────────');
const loopSrc=grab(/function loop\(now\)\{[\s\S]*?\n\}/,'loop()');
const drawAll=grab(/function draw\(now\)\{[\s\S]*?\n\}\n\/\/ 画布：拖动/,'draw()').replace(/\n\/\/ 画布：拖动$/,'');
// 判据：显示推进必须由**无条件执行的** loop() 驱动，且不得再挂在有条件的 draw() 里
const dispJudge=s=>({inLoop:/stepAllDisplays\(/.test(s.loop), inDraw:/stepDisplay\(/.test(s.draw)});
const J=dispJudge({loop:loopSrc,draw:drawAll});
const DISP_IN_LOOP = J.inLoop && !J.inDraw;
console.log(`   源码判读：loop() 调 stepAllDisplays ${J.inLoop?'是':'否'} · draw() 调 stepDisplay ${J.inDraw?'是':'否'}`
  +` ⇒ 显示推进${DISP_IN_LOOP?'不随':'随'}切页停摆`);

const AGN=4;                       // 住户人数（warp 白名单的计数基准，与第 20 单「恰好等于四人」同源）
const STALL_PERIOD=1800, STALL_LEN=600;   // 每 30 秒停摆 10 秒：一天内反复穿插，覆盖大量「离开→返回」交界
const inStall=f=>(f%STALL_PERIOD)>=(STALL_PERIOD-STALL_LEN);

/* 逐帧驱动器：driver(f) 说明这一帧主循环的哪几步跑、哪几步不跑。
   sim/walk/disp 三个开关分别对应 Sim.step、updateWalkers、显示推进；dt 与 speed 可逐帧变。
   位移只在**相邻两个真正出画的帧**之间量 —— 玩家看见的正是这个差，停摆期间没有画面，不构成一步。 */
function driveScenario(seed, frames, driver, mkBoot){
  const mk=mkBoot||boot;
  let w=mk(seed), acc=0;
  const prev={};
  const r={worstRatio:0,worstStep:0,worstCap:0,worstAt:-1,solidFrames:0,solidCells:{},
           maxGap:0,maxGapAt:-1,drawn:0,reboots:0,jumps:0,travel:0,kinds:{first:0,reduceMotion:0,other:0}};
  for(let f=0;f<frames;f++){
    const m=driver(f)||{};
    if(m.reboot){ w=mk(seed); acc=0; r.reboots++; for(const k of Object.keys(prev)) delete prev[k]; }
    if(m.jump){ Sim.catchUp(w, m.jump, 0); r.jumps++; }   // 病态复演专用：在 state.vis 已建表之后才补算
    if(m.speed!==undefined) w.speed=m.speed;
    state.reduceMotion=!!m.reduceMotion;
    const dt=(m.dt===undefined)?(1/FPS):m.dt;
    if(m.sim!==false && w.speed>0){
      acc+=dt*10*w.speed;
      if(acc>=10){ const c=Math.floor(acc/10)*10; Sim.step(w,c); acc-=c; }
    }
    if(m.walk!==false) V.updateWalkers(dt);
    if(m.disp===false) continue;                       // 这一帧显示推进不跑（＝ draw 被跳过且推进还长在 draw 里）
    for(const ag of w.agents){
      const v=state.vis[ag.id];
      const isFirst=(v.dspX===undefined), hadWarp=!!v.warp;
      V.stepDisplay(ag,dt,true);
      // ① 直置白名单普查（第 20 单先例的加强版）：直置只许出自「首帧落位」或「reduceMotion」，第三种一律违规
      if(isFirst) r.kinds.first++;
      else if(hadWarp){ if(state.reduceMotion) r.kinds.reduceMotion++; else r.kinds.other++; }
      // ② 真显差：本帧推进完毕后显示位必须已等于真实位（兜底钳制恒为空操作，故可取严格判据）
      const gap=Math.hypot(v.x-v.dspX, v.y-v.dspY);
      if(gap>r.maxGap){ r.maxGap=gap; r.maxGapAt=f; }
      // ③ 规矩一：相邻两画面之间的位移上限（直置帧按第 20 单口径豁免，已由 ① 单独把关）
      const p=prev[ag.id];
      if(!isFirst && !hadWarp && p){
        const cap=WALK*(w.speed||1)*dt*STEP_SLACK;
        const d=Math.hypot(v.dspX-p.x, v.dspY-p.y);
        r.travel+=d;                                   // 读数：显示位一共走了多少格（病态复演里用来量「凭空多走的路」）
        if(d/cap>r.worstRatio){ r.worstRatio=d/cap; r.worstStep=d; r.worstCap=cap; r.worstAt=f; }
      }
      // ④ 规矩二：逐帧脚底格不得落进实体格
      const cell=footCell(v.dspX,v.dspY);
      if(V.PIX_SOLID.has(cell)){ r.solidFrames++; r.solidCells[cell]=(r.solidCells[cell]||0)+1; }
      prev[ag.id]={x:v.dspX,y:v.dspY};
    }
    r.drawn++;
  }
  state.reduceMotion=false;
  return r;
}

const DAY=144*60;                   // 一天＝144 拍×60 帧
/* 七种情形，逐条写明「停摆的是哪一步」。前两问的取证结论是：
   除切页外，其余六种要么整条主循环一起停（真实位与显示位同步冻结），要么根本不停摆，
   故它们本来就不飞 —— 但仍逐条立断言，因为「本来不飞」这件事以后可能被别的改动打破。 */
const SCENARIOS=[
  {name:'① 切页（现场↔日志）', note:'draw 停；Sim.step 与 updateWalkers 照跑 —— 本单病症所在',
   driver:f=>({disp: DISP_IN_LOOP ? true : !inStall(f)})},
  {name:'② 标签页切走/最小化', note:'rAF 整条停摆；恢复首帧 dtFrame 被 Math.min(0.1,…) 封顶',
   driver:f=>inStall(f) ? {sim:false,walk:false,disp:false}
                        : {dt: (f%STALL_PERIOD===0 && f>0) ? COARSE_DT : 1/FPS}},
  {name:'③ 窗口失焦（rAF 被节流）', note:'最坏情形按 10fps 节流建模：三步照跑但 dt 拉大到封顶值',
   driver:f=>({dt: inStall(f) ? COARSE_DT : 1/FPS})},
  {name:'④ 存档载入', note:'location.reload ⇒ 整个世界重新 boot，state.vis 重建、首帧落位打 warp',
   driver:f=>({reboot: f===DAY>>1})},
  {name:'⑤ 暂停后恢复', note:'w.speed=0 ⇒ Sim.step 与 updateWalkers 双双冻结，draw 照跑',
   driver:f=>({speed: inStall(f) ? 0 : 1})},
  {name:'⑥ reduceMotion 开', note:'不停摆；锚变时走直置豁免（第 20 单白名单二），故本就不存在补间',
   driver:f=>({reduceMotion: inStall(f)})},
  {name:'⑦ 快进倍速切换', note:'不停摆；速度在 1×/2× 间来回切，限速上限随之变',
   driver:f=>({speed: inStall(f) ? 2 : 1})},
  {name:'⑧ 离线追帧补算（第 26 单）', note:'补算在 state.vis 建表之前跑完 ⇒ 整段零帧、显示位尚不存在；回来第一帧照旧走首帧落位',
   driver:f=>({reboot: f===DAY>>1}), boot:seed=>bootCatchUp(seed, Sim.CATCHUP_MAX_DAYS*144)},
];
{
  let allGap=0, allSolid=0, allOther=0, worst=0, worstName='';
  for(const sc of SCENARIOS){
    const r=driveScenario(SEEDS[0], DAY, sc.driver, sc.boot);
    allGap=Math.max(allGap,r.maxGap); allSolid+=r.solidFrames; allOther+=r.kinds.other;
    if(r.worstRatio>worst){ worst=r.worstRatio; worstName=sc.name; }
    console.log(`   ${sc.name}：出画 ${r.drawn} 帧 · 最大真显差 ${r.maxGap.toExponential(1)} 格 · `
      +`位移用掉阈值 ${(r.worstRatio*100).toFixed(1)}% · 实体格 ${r.solidFrames} 帧 · `
      +`直置[首帧 ${r.kinds.first}／reduceMotion ${r.kinds.reduceMotion}／其它 ${r.kinds.other}]`);
    console.log(`      停摆的是：${sc.note}`);
    ok(r.maxGap<=1e-9, `${sc.name} 真显差恒零（最大 ${r.maxGap.toExponential(2)} 格`
      +(r.maxGapAt>=0?`，最紧在第 ${r.maxGapAt} 帧`:'')+'）—— 显示位从不落后，故无从补间');
    ok(r.worstRatio<=1, `${sc.name} 相邻两画面位移 ≤ 行走速率×速度×dt×${STEP_SLACK}`
      +`（实测 ${r.worstStep.toFixed(5)} / 阈值 ${r.worstCap.toFixed(5)} 格）`);
    ok(r.solidFrames===0, `${sc.name} 逐帧脚底零落入实体格（命中 ${r.solidFrames} 帧`
      +(r.solidFrames?` [${Object.entries(r.solidCells).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,n])=>k+'×'+n).join(' ')}]`:'')+'）');
    ok(r.kinds.other===0, `${sc.name} 直置零出白名单（首帧落位 ${r.kinds.first} 次、reduceMotion ${r.kinds.reduceMotion} 次、`
      +`第三种 ${r.kinds.other} 次）—— 这条堵的是「打个标就能瞬移」的后门`);
    if(sc.name.startsWith('④') || sc.name.startsWith('⑧')) ok(r.kinds.first===AGN*2 && r.reboots===1,
      `${sc.name.slice(0,1)} 载入后首帧落位恰 ${AGN*2} 次＝开局 ${AGN} 人＋重载 ${AGN} 人（实测 ${r.kinds.first} 次／重载 ${r.reboots} 回）`);
    else if(!sc.name.startsWith('⑥')) ok(r.kinds.first===AGN,
      `${sc.name} 首帧落位恰 ${AGN} 次＝每人一次（实测 ${r.kinds.first} 次），全程未新增任何直置通道`);
  }
  console.log(`   汇总：${SCENARIOS.length} 种情形合计 真显差最大 ${allGap.toExponential(1)} 格 · 实体格 ${allSolid} 帧 · `
    +`白名单外直置 ${allOther} 次 · 最紧一档「${worstName}」用掉阈值 ${(worst*100).toFixed(1)}%`);
}

/* ═══ 反向自查 · 第 25 单新增的闸不是恒绿 ═══
   把病态写法（显示推进随 draw 一起停）原样复演一遍，三条新断言必须真的判它违规；
   再喂治后写法，必须不误伤。源码判据同样正反各喂一次。 */
console.log('\n── 反向自查 · 停摆闸拦得住病态写法 ──────────────────────');
{
  // 病态：显示推进随切页停摆（＝ 本单治前的生产写法，与 DISP_IN_LOOP 无关，此处强制复演）
  const bad=driveScenario(SEEDS[0], DAY, f=>({disp: !inStall(f)}));
  ok(bad.maxGap>3, `拦得住：显示推进随 draw 停摆时，真显差涨到 ${bad.maxGap.toFixed(2)} 格`
    +`（治后同口径 ≤1e-9 格）—— 「真显差恒零」这条判它违规`);
  ok(bad.worstRatio>1, `拦得住：切回那一段的相邻两画面位移 ${bad.worstStep.toFixed(5)} 格`
    +`＝阈值 ${bad.worstCap.toFixed(5)} 格的 ${bad.worstRatio.toFixed(2)} 倍 —— 规矩一判它违规`);
  ok(bad.solidFrames>0, `拦得住：那条补线扫穿实体格 ${bad.solidFrames} 帧`
    +` [${Object.entries(bad.solidCells).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,n])=>k+'×'+n).join(' ')}]`
    +` —— 规矩二判它违规（这就是决策者看见的「穿墙穿家具」）`);
  ok(bad.kinds.other===0, `读数（非断言）：病态写法里白名单外直置仍是 ${bad.kinds.other} 次`
    +' —— 证明这一类病根本不走 warp 豁免，参谋「落进豁免分支」的假说据此证伪');

  // 合规：显示推进不随停摆（＝ 本单治后写法）
  const good=driveScenario(SEEDS[0], DAY, ()=>({}));
  ok(good.maxGap<=1e-9 && good.worstRatio<=1 && good.solidFrames===0,
    `不误伤：显示推进每帧照跑时三条断言全绿（真显差 ${good.maxGap.toExponential(1)} 格 · `
    +`位移用掉 ${(good.worstRatio*100).toFixed(1)}% · 实体格 ${good.solidFrames} 帧）`);

  // 源码判据的正反两喂：换个写法就能绕过判据的话，这条闸等于没立
  const shapeBad ={loop:'updateWalkers(dtFrame);\n  updateCamera(dtFrame);', draw:'const v=stepDisplay(ag,dtFrame,pixOn);'};
  const shapeGood={loop:'updateWalkers(dtFrame);\n  stepAllDisplays(dtFrame);', draw:'const v=state.vis[ag.id];'};
  const jb=dispJudge(shapeBad), jg=dispJudge(shapeGood);
  ok(!(jb.inLoop&&!jb.inDraw), '源码判据拦得住旧写法：「loop 不推进＋draw 里 stepDisplay」被判为「随切页停摆」');
  ok(jg.inLoop&&!jg.inDraw,   '源码判据不误伤：「loop 里 stepAllDisplays＋draw 只取用」被判为合规');
  ok(DISP_IN_LOOP, '生产源码现处于合规形态（显示推进在 loop 内，draw 对 stepDisplay 零调用）');
}

/* ═══ 第 26 单 · 离线追帧：「补算期间零渲染层动作」的判据与反向自查 ═══
   这条红线的机理不在任何一条运行期判据里，而在**调用点的位置**：补算跑在 state.vis 建表之前、
   第一帧 rAF 之前，那时显示位压根不存在，故一帧都画不出来、也无从瞬移。
   位置这件事没法靠采样证明（不存在的帧采不到），故正面立源码结构判据；
   反面则把「补算挪到运行中（state.vis 已建表）」原样复演一遍，量出那样会看见什么。 */
console.log('\n── 第 26 单 · 离线追帧补算的位置判据与反向自查 ────────────');
{
  // 判据三条，全部从生产源码读出：不在 loop()／draw() 里、且排在 state.vis 建表之前
  const catchupJudge=s=>({
    inLoop:/catchUp\(/.test(s.loop||''), inDraw:/catchUp\(/.test(s.draw||''),
    beforeVis: s.iCall>=0 && s.iVis>s.iCall,
  });
  const P=catchupJudge({loop:loopSrc, draw:drawAll,
    iCall:src.indexOf('Sim.catchUp(state.world'), iVis:src.indexOf('state.vis[ag.id]={x:a.x+0.5')});
  console.log(`   源码判读：loop() 调 catchUp ${P.inLoop?'是':'否'} · draw() 调 catchUp ${P.inDraw?'是':'否'}`
    +` · 调用点在建 state.vis 之前 ${P.beforeVis?'是':'否'}`);
  ok(!P.inLoop && !P.inDraw && P.beforeVis,
    '生产源码合规：补算只在开机时跑一次，且排在 state.vis 建表之前 ⇒ 补算期间零帧可画');

  // 正反各喂一次，证明这条判据不是恒绿
  const shapeBad1={loop:"if(document.hidden) return; Sim.catchUp(w, n, rd);", draw:'', iCall:10, iVis:5};
  const shapeBad2={loop:'', draw:'', iCall:900, iVis:100};   // 补算排到了建表之后
  const shapeGood={loop:'Sim.step(w, chunk);', draw:'const v=state.vis[ag.id];', iCall:100, iVis:900};
  const b1=catchupJudge(shapeBad1), b2=catchupJudge(shapeBad2), g=catchupJudge(shapeGood);
  ok(b1.inLoop, '判据拦得住写法一：把补算挪进 loop()（＝运行中跳变）被判违规');
  ok(!b2.beforeVis, '判据拦得住写法二：补算排到 state.vis 建表之后被判违规');
  ok(!g.inLoop && !g.inDraw && g.beforeVis, '判据不误伤：开机段补算＋主循环只 step 的写法放行');

  // 病态复演：真把补算挪到运行中会看见什么（读数＋断言）
  const JUMP=Sim.CATCHUP_MAX_DAYS*144;
  const bad=driveScenario(SEEDS[0], DAY, f=>({jump: f===(DAY>>1) ? JUMP : 0}));
  const good=driveScenario(SEEDS[0], DAY, ()=>({}));
  console.log(`   病态复演（运行中补算 ${Sim.CATCHUP_MAX_DAYS} 天，state.vis 已建表）：`
    +`显示位全程走了 ${bad.travel.toFixed(1)} 格，同长度不补算的对照 ${good.travel.toFixed(1)} 格`
    +` ⇒ 凭空多走 ${(bad.travel-good.travel).toFixed(1)} 格 · 实体格 ${bad.solidFrames} 帧`);
  ok(bad.travel-good.travel>10,
    `拦得住：运行中补算会让玩家眼睁睁看着四个人凭空多走 ${(bad.travel-good.travel).toFixed(1)} 格`
    +'（三天份的行程一次性走给你看）—— 这正是「补算期间不许出现渲染层动作」要挡的东西');
  ok(bad.jumps===1 && good.jumps===0, `病态复演确实跳了 ${bad.jumps} 次、对照 ${good.jumps} 次（构造成立）`);
  ok(bad.maxGap<=1e-9 && bad.worstRatio<=1 && bad.solidFrames===0,
    '读数（非断言）：即便这样，第 25 单三条铁律仍全绿 —— 病不在瞬移而在「多走的那段路」，'
    +'故本单的判据只能立在调用点的位置上，立在帧上是抓不到的');
}

console.log(fails? ('\n'+fails+' FAILURES') : '\n走位三铁律 ALL PASS');
process.exit(fails?1:0);
