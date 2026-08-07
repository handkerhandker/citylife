// 第 26 单·离线追帧一期 —— 机理取证脚本（诊断工具，不是门禁：不进 gate.yml、不判红、只印读数）
//
// 五问逐条取证。用法（仓库根目录，须先按门禁第 1 步抽出 app.js）：
//   python3 -c "import re;m=re.search(r'<script>([\s\S]*)</script>',open('city-life-framework.html').read());open('app.js','w').write(m.group(1))"
//   node tools/offline-catchup/probe.cjs
//
// 本脚本只读：不改仓库任何文件，不写档，不出网。
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..','..');
const {PURE, Sim}=require(path.join(ROOT,'app.js'));
const SRC=fs.readFileSync(path.join(ROOT,'city-life-framework.html'),'utf8');
const SEEDS=[20260803, 424242];
const line=s=>console.log(s);
const hr=t=>console.log('\n═══ '+t+' '+'═'.repeat(Math.max(0,58-t.length)));

/* ── 问 1：世界推进的驱动链（源码判读，不是猜） ───────────────────── */
hr('问 1 · 关掉页面／切走标签页，世界推进停不停');
{
  const loop=(SRC.match(/function loop\(now\)\{[\s\S]*?\n\}/)||[''])[0];
  const stepSites=(SRC.match(/Sim\.step\(/g)||[]).length;
  const rafSites=(SRC.match(/requestAnimationFrame\(/g)||[]).length;
  line('  Sim.step( 在整份源码里出现 '+stepSites+' 处；requestAnimationFrame( 出现 '+rafSites+' 处');
  line('  loop() 里调 Sim.step：'+(/Sim\.step\(/.test(loop)?'是':'否')
      +' ｜ loop() 结尾自续 rAF：'+(/requestAnimationFrame\(loop\)/.test(loop)?'是':'否'));
  const dtCap=(SRC.match(/dtFrame=Math\.min\(([\d.]+),/)||[])[1];
  line('  单帧时间步封顶 dtFrame=Math.min('+dtCap+', …) 秒 ⇒ 一帧至多折算 '
      +(Number(dtCap)*10)+' 模拟分钟 × 速度');
  line('  ⇒ 结论：Sim.step 的唯一驱动是 rAF；rAF 停 ⇒ 世界停。');
  line('    即便浏览器在恢复时补发一记大 dt，也被 Math.min('+dtCap+',…) 削成 '+(Number(dtCap)*10)+' 分钟，追不回来。');
  const hide=(SRC.match(/addEventListener\('pagehide'[^\n]*/)||[''])[0].trim();
  const vis=(SRC.match(/document\.addEventListener\('visibilitychange'[^\n]*/)||[''])[0].trim();
  line('  离场落盘钩子：'+(hide||'（无）'));
  line('                '+(vis||'（无）'));
}

/* ── 问 2：存档里存的是什么 ───────────────────────────────────────── */
hr('问 2 · 存档口径（serialize / hydrate 逐字）');
{
  const w=Sim.makeWorld(SEEDS[0]);
  for(let i=0;i<3*144;i++) Sim.step(w,10);
  const meta={selected:'a1', lastReflectDay:PURE.dayOf(w.t)-1, at:1754496000000};
  const s=Sim.serialize(w, meta);
  const d=JSON.parse(s);
  line('  存档顶层键：'+Object.keys(d).join(' / ')+'   （sv='+d.sv+'）');
  line('  meta 键：'+Object.keys(d.meta).join(' / ')+'   ← at 即「上次落盘的真实时刻」，第 6 单起就在存');
  const wk=Object.keys(d.world);
  line('  world 键（'+wk.length+' 个）：'+wk.join(' / '));
  line('  w.t 随档落盘：'+(('t' in d.world)?('是（'+d.world.t+' 分 ＝ D'+PURE.dayOf(d.world.t)+' '+PURE.fmtTime(d.world.t)+'）'):'否'));
  line('  w.rngState 随档落盘：'+(('rngState' in d.world)?('是（'+d.world.rngState+'）'):'否'));
  line('  w.rng 是否入档：'+(('rng' in d.world)?'是（异常！）':'否 —— serialize 逐键跳过 typeof==="function"，hydrate 侧按 rngState 重建闭包'));
  const r=Sim.hydrate(s);
  line('  hydrate 回来的 w.t：'+r.world.t+'  ⇒ 与落盘值'+(r.world.t===w.t?'逐字节相同（从存档时刻继续，不是从头）':'不同（异常！）'));
  line('  存档体积：'+s.length+' 字节（3 天）；日志环形缓冲上限 '+((SRC.match(/w\.log\.length>(\d+)/)||[])[1]||'?')+' 条');
  const w30=Sim.makeWorld(SEEDS[0]); for(let i=0;i<30*144;i++) Sim.step(w30,10);
  line('  存档体积：'+Sim.serialize(w30,meta).length+' 字节（30 天）');
}

/* ── 问 3：推进 N 拍的真实代价 ────────────────────────────────────── */
hr('问 3 · 纯世界逻辑推进 N 拍的耗时（零 AI、零渲染）');
{
  line('  运行环境：node '+process.version+' · '+process.platform+'/'+process.arch);
  const bench=(fn,reps)=>{ const a=[]; for(let k=0;k<reps;k++){ const t0=process.hrtime.bigint(); fn(); a.push(Number(process.hrtime.bigint()-t0)/1e6); } a.sort((x,y)=>x-y); return a; };
  line('  ① 从零开城推进：');
  for(const days of [1,3,7,30]){
    const per=SEEDS.map(seed=>{ const a=bench(()=>{ const w=Sim.makeWorld(seed); for(let i=0;i<days*144;i++) Sim.step(w,10); },7); return a; });
    line('     '+String(days).padStart(2)+' 天（'+String(days*144).padStart(4)+' 拍）：中位 '
      +per.map((a,i)=>SEEDS[i]+' '+a[3].toFixed(1)+'ms').join(' ／ ')
      +'   最坏 '+Math.max(...per.map(a=>a[6])).toFixed(1)+'ms');
  }
  line('  ② 从「已跑 30 天的存档」hydrate 后再推进（离线追帧的真实形态）：');
  const base=Sim.makeWorld(SEEDS[0]); for(let i=0;i<30*144;i++) Sim.step(base,10);
  const saved=Sim.serialize(base,null);
  for(const days of [1,3,7,30]){
    const a=bench(()=>{ const w=Sim.hydrate(saved).world; for(let i=0;i<days*144;i++) Sim.step(w,10); },7);
    line('     '+String(days).padStart(2)+' 天（'+String(days*144).padStart(4)+' 拍）：中位 '+a[3].toFixed(1)+'ms   最坏 '+a[6].toFixed(1)+'ms（含 hydrate）');
  }
  const a1=bench(()=>{ Sim.hydrate(saved); },7);
  line('     其中 hydrate 单独：中位 '+a1[3].toFixed(2)+'ms');
}

/* ── 问 4：AI 挂掉时的模板兜底路径 ────────────────────────────────── */
hr('问 4 · 模板兜底路径的形状（闲聊／日记／短信回信）');
{
  const grab=(re)=>{ const m=SRC.match(re); return m?m[0]:''; };
  // ⚠ 本节量的两处形态**已由第 27 单改掉**（闲聊 CHAT_LINES → 逐人开口/接话池＋pickV；
  //   日记单条常量 DIARY_FALLBACK → 逐人池 DIARY_FB＋pickFresh）。本脚本是第 26 单的取证记录，
  //   刻意保持当时的抽取口径不动（改了就等于把那一单的读数改成事后追认），故这两行现会印「未取到」。
  //   现行形态与新读数见 tools/fallback-pool/capacity.cjs 与 docs/交付/第27单-兜底文案扩池.md。
  const chatPool=grab(/const CHAT_LINES=\[[\s\S]*?\n\];/);
  const nChat=(chatPool.match(/\n  \[/g)||[]).length;
  line('  【闲聊】（第 26 单当时）SIM 落条目时就写死模板：decide() 第 5 分支 `pick(w,CHAT_LINES)`');
  line('    · 池容量：'+(chatPool?nChat+' 组对白（每组两句，A/B 各一句）':'（未取到 —— 已由第 27 单换成逐人开口/接话池）'));
  line('    · 抽法：`pick`（等概率），**不是 `pickV`** —— 故无「当日去重」，同一天可反复抽中同一组');
  line('    · AI 在线时由 DOM 层 enhanceChat 事后覆写 e.thought；AI 挂掉则这句模板留在墙上');
  const dfb=(grab(/e\.thought='（写了两行[^']*'/)||'').replace(/^e\.thought=/,'');
  line('  【日记】只由 DOM 层 runReflection() 产出（SIM 侧压根不写日记）');
  line('    · 兜底文案：'+(dfb||'（未取到 —— 已由第 27 单换成逐人池 DIARY_FB）')+'  ← **单条常量，没有池**');
  line('    · 触发：主循环 loop() 里 `d!==state.lastReflectDay && PURE.minuteOfDay(w.t)>=1310`（21:50）');
  const react=grab(/const REACT=\{[\s\S]*?\n\};/);
  line('  【短信】两段各有各的兜底：');
  line('    · 读到短信那一刻（SIM·decide 第 0 分支）：thought 取 REACT[m.id]||REACT.custom，'
      +(react.match(/\n  [a-z]+:/g)||[]).length+' 条写死文案，按短信类型一一对应，无池无随机');
  line('    · 回信（DOM·enhanceMessage）：AI 出不来 ⇒ 内心独白回落 e.fb（＝上面那条 REACT），'
      +'并落一条「'+((grab(/text:'看了你的短信，没有回。'/)||'').match(/'([^']*)'/)||[])[1]+'」');
  line('    · 注意：玩家不在场时发不出新短信，故本路径只在「临走前发了一条、随即关页」时才被触及');

  line('  —— 实测：连跑 3 天，模板句会不会全是同一句 ——');
  for(const seed of SEEDS){
    const w=Sim.makeWorld(seed);
    const t0=w.lidSeq; const seen={}; let nChatLog=0;
    for(let i=0;i<3*144;i++){
      const before=w.log.length, beforeLid=w.lidSeq;
      Sim.step(w,10);
      const added=w.lidSeq-beforeLid;
      for(let j=Math.max(0,w.log.length-added);j<w.log.length;j++){
        const e=w.log[j];
        if(e.type==='chat'){ nChatLog++; seen[e.thought]=(seen[e.thought]||0)+1; }
      }
    }
    const ks=Object.keys(seen).sort((a,b)=>seen[b]-seen[a]);
    line('    seed '+seed+'：3 天共 '+nChatLog+' 场闲聊，用到 '+ks.length+'/'+nChat+' 组模板；'
      +'最高频那组占 '+(nChatLog?Math.round(seen[ks[0]]/nChatLog*100):0)+'%');
    for(const k of ks) line('       ×'+String(seen[k]).padStart(2)+'  '+k);
  }
  line('    日记：一天一轮 × 4 人 ⇒ 3 天 12 条，**逐字全同**（兜底是单条常量）');
}

/* ── 问 5：从存档恢复后的可复现性 ─────────────────────────────────── */
hr('问 5 · rng 状态随档落盘 ⇒ 同档同拍数是否逐字节可复现');
{
  const full=w=>JSON.stringify({t:w.t, rngState:w.rngState, stats:w.stats, lidSeq:w.lidSeq,
    log:w.log.map(e=>[e.lid,e.t,e.type,e.name,e.text,e.thought||'']),
    agents:w.agents.map(a=>[a.id,a.money,a.anchor,a.hunger,a.energy,a.busyUntil,JSON.stringify(a.activity),JSON.stringify(a.rest||{}),JSON.stringify(a.flags)]),
    clips:w.clips, clipDay:w.clipDay, clipBase:w.clipBase, saidDay:w.saidDay, chatTopics:w.chatTopics, weather:w.weather});
  for(const seed of SEEDS){
    const w=Sim.makeWorld(seed); for(let i=0;i<7*144;i++) Sim.step(w,10);
    const s=Sim.serialize(w,null);
    const A=Sim.hydrate(s).world, B=Sim.hydrate(s).world;
    for(const days of [1,3,30]){
      const a=Sim.hydrate(s).world, b=Sim.hydrate(s).world;
      for(let i=0;i<days*144;i++){ Sim.step(a,10); Sim.step(b,10); }
      const same=full(a)===full(b);
      // 与「不落盘直接续跑」对照：存档往返不得改变命运
      const c=w; // c 已在 s 之后未再推进
      line('    seed '+seed+' · 同一份存档各推 '+String(days).padStart(2)+' 天：'
        +(same?'逐字节一致 ✓':'不一致 ✗')+'（比对面 '+full(a).length+' 字节）');
    }
    // 存档往返 vs 直接续跑
    const k=3*144;
    const x=Sim.hydrate(s).world; for(let i=0;i<k;i++) Sim.step(x,10);
    const y=w;                    for(let i=0;i<k;i++) Sim.step(y,10);
    line('    seed '+seed+' · 「存档往返再跑 3 天」对「原地直接跑 3 天」：'+(full(x)===full(y)?'逐字节一致 ✓':'不一致 ✗'));
    line('      rngState 落点：'+x.rngState+' ／ '+y.rngState);
  }
  const hy=(SRC.match(/if\(!isFinite\(w\.rngState\)\) w\.rngState=\(\(w\.seed>>>0\)\|\|1\);/)||[''])[0];
  line('  hydrate 对坏 rngState 的兜底：'+(hy?'有（'+hy.trim()+'）':'无'));
}

/* ── 附问：回来那一刻，现有 drainLog 会做什么（本单红线「零 AI」的真正对手） ── */
hr('附 · 读档回来时，现有 drainLog 对旧日志条目的处理');
{
  const gate=(SRC.match(/if\(state\.llm\.on && !e\.llm && !e\.llmPending\)\{[\s\S]*?\n    \}/)||[''])[0];
  line('  drainLog 里的 AI 触发闸（源码原文）：');
  for(const l of gate.split('\n')) line('    '+l.trim());
  const seen=(SRC.match(/logSeenLid:\s*-Infinity/)||[''])[0];
  line('  开局游标：state.'+ (seen||'（未取到）') + '  ⇒ 读档后 w.log 里**每一条**都算「没上过墙」，逐条过一遍上面那道闸');
  line('  —— 实测：一份存档里躺着多少条会被这道闸重新点着的条目 ——');
  for(const seed of SEEDS){
    for(const days of [3,30]){
      const w=Sim.makeWorld(seed);
      for(let i=0;i<days*144;i++) Sim.step(w,10);
      const r=Sim.hydrate(Sim.serialize(w,null)).world;
      let chat=0, sms=0;
      for(const e of r.log){
        if(e.llm) continue;
        if(e.type==='player' && e.msg) sms++;
        else if(e.type==='chat' && e.with) chat++;
      }
      line('    seed '+seed+' · 跑满 '+String(days).padStart(2)+' 天的存档：日志 '+String(r.log.length).padStart(3)
        +' 条，其中会触发 enhanceChat '+chat+' 条、enhanceMessage '+sms+' 条 ⇒ 一开页就是 '
        +((chat+sms)*1)+' 次调用起步（对白闸不合格还会各再追一次）');
    }
  }
  line('  ⇒ 这是既有行为，与本单是否补算无关；但「补算出来的新条目」会落进同一个桶，');
  line('    故红线「补算全程零 AI、回来也不补生成」必须在这道闸上加水位线，光靠不调 AI 是拦不住的。');
}

hr('取证完毕');
