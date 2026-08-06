// 30 天退化检查：六项。阈值集中于下方常量区（保守初值，可调；放宽须走任务书②C条款）。
const {PURE, Sim} = require('./app.js');
const SEEDS=[20260803, 424242];       // 可调：抽查种子（两颗都须过第 1–5 项）
const DAYS=30;                        // 可调：模拟天数

// ─────────────────────────────────────────────────────────────────────────────
// 余量口径（第 23 单立，第 24 单全面施行到六项）
//   **阈值 ＝ 大样本实测「均值 ± 5 个标准差」，再向外取整到该量的自然刻度。**
//   锚下在均值与标准差上，**不许下在实测最大值上**——最大值随样本量长（雨占比 3000 颗时 16.25%、
//   5 万颗时 16.74%），拿它当锚每重算一次就换个答案，口径不可复现。
//
// 第 24 单补一条**适用边界**（本单实测撞出来的）：
//   **这条口径只对「和式量」成立，对「极值量」不成立。**
//   旧的第六项 `GAP_MAX` 量的是 4320 拍里的**最大值**，尾巴按极值分布走而不是正态——
//   5 万颗实测最大值落在 **+7.93σ**，照口径算出来的上限 1050 反而击穿 29 颗，比现行的 1080（击穿 11 颗）**更红**。
//   故遇到极值量，治法是**换成和式量（时长占比）**，不是给口径开例外。
//
// 量尺判别法（第 23 单立，第 24 单三处照此换尺）：
//   **看这个量在玩家那头对应的是状态还是事件；状态量时长占比，事件才量次数。**
//   量错了的通病是**与体感反相关**——本单三处实证，逐条记在下面各自的注释里。
//
// 全部读数、σ 距离、反向自查见 docs/交付/第24单-sim30六项阈值全面复核.md
// ─────────────────────────────────────────────────────────────────────────────

// ① 生存不变量 · 负债下限
// 量尺对：钱包余额是状态里的一个水平值，闸问的是「有没有谁跌破过红线」，红线按定义就是最坏情形。
// 5 万颗实测：均值 −79.12、sd 4.4491、最小 −102（−5.14σ）⇒ −101.37 ⇒ 向外取整到 ¥10 ⇒ −110（−6.94σ，零击穿）。
// 旧值 −123 是「−102×1.2」（PR #4 原文），与旧 RAIN_MAX=59 同一个坏配方，本单按分布重定。
const MONEY_FLOOR=-110;               // 可调：负债下限（¥）

// ② 动作熵（每人取最低那一位）
// **量尺换了（第 24 单）：次数口径 → 时长口径。**
// 「这个人今天都在干嘛」在玩家那头是**状态**（他正做着这件事，做了多久），而 w.stats.act 数的是
// decide() 派活的**次数**，两头都会骗人，各有一条实测：
//   · 把睡眠拉到 14 小时（一件事吞掉大半天）→ 时长熵 2.079→1.956（真的更单调），
//     **次数熵反而 2.096→2.195，闸更绿**；
//   · 把「在家待着」由 30 分切成 10 分（同一件事拆成三段）→ 次数熵 2.096→2.053（假装更单调），
//     时长熵 2.079→2.107 纹丝不动。
// 时长口径为纯观测：每拍逐人读一次 a.activity.type 记账，不读也不写 w.stats.act。
// 5 万颗实测（时长口径）：均值 2.0793、sd 0.0131、最小 2.0217 ⇒ 2.0138 ⇒ 向外取整到 0.1 比特 ⇒ 2.0（−6.03σ，零击穿）。
// 旧闸 ≥1.0 是 −50.2σ，**34 种人为改动里一种都没判红——一条恒绿的闸等于没立**。
const ENTROPY_MIN=2.0;                // 可调：每人动作熵下限（比特，按时长口径）

// ③ 财富基尼
// 量尺对：基尼是四人钱包这个状态的截面统计，不是次数。
// 5 万颗实测：均值 0.4521、sd 0.0088、最大 0.4864 ⇒ 0.4961 ⇒ 向外取整到 0.01 ⇒ 0.50（+5.47σ，零击穿）。
// 旧闸 ≤0.75 是 +34.0σ，34 种改动只判红 2 种；新闸判红 7 种（交易员工资 ×3.3 这种，旧闸完全看不见）。
const GINI_MAX=0.50;                  // 可调：财富基尼上限

// ④ 社交
// 量尺对，而且是**由构造保证**的对：一场闲聊的时长在代码里写死 20 分钟（html:1067–1068 两人各 +20），
// 故「时长」＝「次数×40 人·分钟」，两者是仿射等价，结构上不可能出现雨那种反相关。
// 闲聊总数 5 万颗实测：均值 173.11、sd 9.7113、最小 133 ⇒ 124.55 ⇒ 向外取整到 10 次 ⇒ 120（−5.47σ，零击穿）。
// 闲聊对数恒为 6（＝C(4,2)，5 万颗零方差）。sd＝0 时「±5σ」这条带塌缩到常数本身，故取 6；
// 取 ≥ 而不取 ＝，是为了将来住户增员时仍成立。旧闸 ≥3 对「内向的人彻底不社交」（对数 6→3）判红 0%，新闸 100%。
const CHAT_MIN=120;                   // 可调：闲聊总数下限
const PAIR_MIN=6;                     // 可调：不同闲聊对数下限

// ⑤ 雨（第 23 单换的量尺，第 24 单 5 万颗复核，一字未动）
// 雨这一项的量尺，第 23 单由「次数」换成「雨占全时长比例」：雨不改变任何住户的行为（decide() 全程不读
// w.weather），在玩家那头的唯一去处就是雨幕与两条日志，故体感＝雨幕挂着的时长占比；而次数只数边沿，
// 一场雨下多久它全盲——把时长加倍，次数反而由 52/57 掉到 37/42，闸更绿而城市更湿。
// 5 万颗种子×30 天实测：均值 13.8934%、sd 0.6807pp、min 11.04%、max 16.74% ⇒ 10.49%／17.30% ⇒ 取 10%／18%。
// 取整后实到 −5.72σ／+6.03σ，5 万颗零越界；同口径下旧的次数闸 1–59 是 +2.76σ，5 万颗里击穿 40 颗。
// 第 24 单独立复跑 5 万颗，四个数逐位复现（13.8934% / 0.6807pp / 11.0417% / 16.7361%），本项**零改动**。
const RAIN_FRAC_MIN=0.10;             // 可调：雨占全时长比例下限
const RAIN_FRAC_MAX=0.18;             // 可调：雨占全时长比例上限

// ⑥ 导演与时间锚点
// 发薪／交租：量尺对，且 5 万颗零方差（恒为 4 与 1）——sd＝0，口径给出的答案就是常数本身，
// 故两条**一字未改**。反向自查：发薪改隔周（→2）判红 100%，交租改每 15 天（→2）判红 100%。
const PAY_MIN=4;                      // 可调：发薪次数下限
const RENT_EXACT=1;                   // 口径：30 天窗口恰逢一次交租日

// 街市 **量尺换了（第 24 单）：到访人次 → 滞留人·分钟。**
// 「街市上有人」在玩家那头是**状态**（人站在广场上逛，一趟 30–50 分钟），而 w.stats.market 在
// setActivity 里每派一趟活加一，数的是**趟数**。这就是雨那条一模一样的病：
//   · 把每趟停留时长 ×3（广场上的人多一倍有余，人·分钟 755→1570）→ **到访人次反而 14.9→13.7**，
//     即街市越热闹，这条下限闸读数越低、离红越近。反相关，写在数字里。
// 采集为纯观测：每拍逐人数一次 a.anchor==='market'，×10 得人·分钟；不读也不写 w.stats.market。
// 5 万颗实测：均值 753.38、sd 129.93、最小 260 ⇒ 103.7 ⇒ 向外取整到 100 人·分钟 ⇒ 100（−5.03σ，零击穿）。
// 照实说明：换量尺买到的是**准头**（方向不再反），不是检出率——两把尺子的响应噪声比几乎相等
// （人次 2.53σ、人·分钟 2.43σ），「周日逛街市概率砍到 0.02」这一档两把尺子都拦不住，已登记接受项。
const MARKET_MIN_MIN=100;             // 可调：街市滞留人·分钟下限

// 最长无戏间隔 **量尺换了（第 24 单）：max(距上次有戏) → 「静默超过 SILENT_K 分钟」的时长占比。**
// 旧闸 `GAP_MAX=1080` 已被击穿 11/50000（最大 1210，种子 47351）。查清右尾成因后，三条毛病都不是世界的错：
//   ①**它是极值量**——4320 拍取最大，尾巴按极值分布走（+7.93σ），照余量口径算出来的 1050 反而更红（击穿 29 颗）。
//   ②**它把发生过的戏漏掉了**——html:1557 判的是**日志墙尾条**是不是 chat/player，不是「这段时间里有没有发生闲聊」。
//     实测最长那颗（47351，1210 分钟）：那 1220 分钟里城市推了 31 条日志、**其中有一场真的闲聊**，
//     只因为紧接着有人做饭的日志把它顶掉，计时器就当它没发生过。
//   ③**雨一直在替它兜底**——雨每次起停都重置 w.lastSpark；把雨的起停不算成戏，同一批 5 万颗的
//     最长无戏间隔由 均值 771／最大 1210 涨到 **均值 1393／最大 3560**，接近翻倍。
// 新量尺：「无戏」在玩家那头是**状态**（屏幕半天不动），故量时长占比——
//   逐拍看本拍有没有新的 chat/player/sys 日志条目（＝代码注释 html:1556「有社交/系统事件即视为"有戏"」
//   的原口径，只把「看尾条」改成「按发生记账」），连着 SILENT_K 分钟一条都没有的那些拍，其时长计入分子。
// SILENT_K=200 **不是新数**，是导演层自己写死的「太平淡」门槛（html:1545 `(w.t-w.lastSpark)>200`）。
// 5 万颗实测：均值 23.070%、sd 0.666pp、最小 20.694%、最大 25.810% ⇒ 26.400% ⇒ 向外取整到整数百分点
//   ⇒ 27%（+5.90σ，零击穿）。
// 旧闸在 34 种人为改动里只判红 1 种（雨整个关掉），而那一种雨闸已经 100% 抓住——**它没有独立检出能力，
// 自己却已经红了**；新闸判红 8 种，其中「每天那条『新的一天』不落墙」是六项里**没有任何别的闸看得见**的一种。
const SILENT_K=200;                   // 口径：沿用导演层「太平淡」门槛，不是新立的数
const SILENT_FRAC_MAX=0.27;           // 可调：静默超过 SILENT_K 分钟的时长占比上限

let fails=0;
const ok=(c,m)=>{ if(!c){fails++; console.log('FAIL:',m);} else console.log(' ok :',m); };
function run(seed){
  const w=Sim.makeWorld(seed);
  // ↓↓ 以下全部为门禁侧**纯观测**：只读 w 的字段，不写 w.stats、不碰 rng、不改世界状态。
  //    （第 23 单立的先例：门禁要量的东西若不在 w.stats 里，就在门禁侧逐拍观测，不给世界加字段。）
  let rainTicks=0;                    // 一拍恰 10 分钟，故下雨拍数×10＝下雨分钟数
  let marketTicks=0;                  // 人·拍，×10 得人·分钟
  let silentRun=0, silentMin=0;       // 当前已静默多久（分钟）／累计「静默超过 SILENT_K」的分钟数
  let lastLid=0;                      // w.log 是 400 条环形缓冲（html:882–884），按 lid 增量扫描才不漏条
  const durAct=w.agents.map(()=>Object.create(null));   // 逐人「活动类型 → 拍数」
  for(let i=0;i<DAYS*144;i++){
    Sim.step(w,10);
    rainTicks+=w.weather.rain?1:0;
    // 本拍有没有「戏」：新增条目里有没有 chat／player／sys（口径同 html:1556 注释，只是按发生记账）
    let spark=0;
    const added=w.lidSeq-lastLid;
    if(added>0){
      for(let j=Math.max(0,w.log.length-added);j<w.log.length;j++){
        const ty=w.log[j].type;
        if(ty==='chat'||ty==='player'||ty==='sys'){ spark=1; break; }
      }
      lastLid=w.lidSeq;
    }
    silentRun = spark ? 0 : silentRun+10;
    if(silentRun>SILENT_K) silentMin+=10;
    for(let k=0;k<w.agents.length;k++){
      const a=w.agents[k];
      if(!isFinite(a.money)||!isFinite(a.hunger)||!isFinite(a.energy)){ ok(false,'NaN@'+seed+':'+a.name); return null; }
      if(a.hunger<0||a.hunger>100||a.energy<0||a.energy>100){ ok(false,'范围越界@'+seed+':'+a.name); return null; }
      if(a.money<MONEY_FLOOR){ ok(false,'负债穿底@'+seed+':'+a.name+' ¥'+Math.round(a.money)); return null; }
      if(a.anchor==='market') marketTicks++;
      const ty=a.activity&&a.activity.type;
      if(ty) durAct[k][ty]=(durAct[k][ty]||0)+1;
    }
  }
  return {w, rainMin:rainTicks*10, marketMin:marketTicks*10, silentMin, durAct};
}
function sig(w){ return JSON.stringify(w.stats)+'|'+w.agents.map(a=>a.id+':'+a.money+':'+a.anchor+':'+a.hunger+':'+a.energy).join('|'); }
for(const seed of SEEDS){
  const r=run(seed);
  if(!r) continue;
  const w=r.w;
  ok(true,'['+seed+'] 30 天生存不变量');
  const ent=r.durAct.map(d=>PURE.entropy(d));
  const entCnt=w.agents.map(a=>PURE.entropy((w.stats.act||{})[a.id]||{}));
  ok(ent.every(e=>e>=ENTROPY_MIN),'['+seed+'] 动作熵（时长口径）每人≥'+ENTROPY_MIN+'：'+ent.map(e=>e.toFixed(2)).join('/')
     +'（旧的次数口径 '+entCnt.map(e=>e.toFixed(2)).join('/')+'）');
  const g=PURE.gini(w.agents.map(a=>a.money));
  ok(g<=GINI_MAX,'['+seed+'] 财富基尼≤'+GINI_MAX+'：'+g.toFixed(3));
  const pairs=Object.keys(w.stats.pair||{});
  const chats=pairs.reduce((s,k)=>s+w.stats.pair[k],0);
  ok(chats>=CHAT_MIN && pairs.length>=PAIR_MIN,'['+seed+'] 社交：'+chats+' 次 · '+pairs.length+' 对');
  const rf=r.rainMin/(DAYS*1440);
  ok(rf>=RAIN_FRAC_MIN && rf<=RAIN_FRAC_MAX,'['+seed+'] 雨占全时长 '+(rf*100).toFixed(2)+'%（'+r.rainMin+' 分钟 · '
     +w.stats.rain+' 场 · 场均 '+(w.stats.rain?Math.round(r.rainMin/w.stats.rain):0)+' 分钟）');
  ok(w.stats.pay>=PAY_MIN,'['+seed+'] 发薪 '+w.stats.pay+' 次');
  ok(w.stats.rentPaid===RENT_EXACT,'['+seed+'] 交租 '+w.stats.rentPaid+' 次');
  ok(r.marketMin>=MARKET_MIN_MIN,'['+seed+'] 街市滞留 '+r.marketMin+' 人·分钟（'+w.stats.market+' 人次 · 趟均 '
     +(w.stats.market?Math.round(r.marketMin/w.stats.market):0)+' 分钟）');
  const sf=r.silentMin/(DAYS*1440);
  ok(sf<=SILENT_FRAC_MAX,'['+seed+'] 静默超过 '+SILENT_K+' 分钟的时长占 '+(sf*100).toFixed(2)+'%（'+r.silentMin
     +' 分钟 · 旧口径最长无戏间隔 '+w.stats.maxGap+' 分钟）');
}
{
  const A=Sim.makeWorld(SEEDS[0]), B=Sim.makeWorld(SEEDS[0]);
  for(let i=0;i<DAYS*144;i++){ Sim.step(A,10); Sim.step(B,10); }
  ok(sig(A)===sig(B),'同种子 30 天确定性');
}
console.log(fails?('\n'+fails+' FAILURES'):'\n30D ALL PASS');
process.exit(fails?1:0);
