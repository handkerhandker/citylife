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

console.log(fails? ('\n'+fails+' FAILURES') : '\n走位三铁律 ALL PASS');
process.exit(fails?1:0);
