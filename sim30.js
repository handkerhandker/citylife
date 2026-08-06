// 30 天退化检查：六项。阈值集中于下方常量区（保守初值，可调；放宽须走任务书②C条款）。
const {PURE, Sim} = require('./app.js');
const SEEDS=[20260803, 424242];       // 可调：抽查种子（两颗都须过第 1–5 项）
const DAYS=30;                        // 可调：模拟天数
const ENTROPY_MIN=1.0;                // 可调：每人动作熵下限（比特）
const GINI_MAX=0.75;                  // 可调：财富基尼上限
const CHAT_MIN=20;                    // 可调：闲聊总数下限
const PAIR_MIN=3;                     // 可调：不同闲聊对数下限
// 雨这一项的量尺，第 23 单由「次数」换成「雨占全时长比例」：雨不改变任何住户的行为（decide() 全程不读
// w.weather），在玩家那头的唯一去处就是雨幕与两条日志，故体感＝雨幕挂着的时长占比；而次数只数边沿，
// 一场雨下多久它全盲——把时长加倍，次数反而由 52/57 掉到 37/42，闸更绿而城市更湿。
// （雨另写 w.lastSpark，故它对第六项「最长无戏间隔」有影响；那是那条闸的事，与本项量尺无关。）
// 余量口径（本单立）：阈值＝大样本实测「均值 ±5 个标准差」，再向外取整到整数百分点。锚在均值与标准差上
// 而不是实测最大值——最大值随样本量长（3000 颗时 16.25%、5 万颗时 16.74%），拿它当锚每重算一次就换个答案。
// 5 万颗种子×30 天实测：均值 13.8934%、sd 0.6807pp、min 11.04%、max 16.74% ⇒ 10.49%／17.30% ⇒ 取 10%／18%。
// 取整后实到 −5.72σ／+6.03σ，5 万颗零越界；同口径下旧的次数闸 1–59 是 +2.76σ，5 万颗里击穿 40 颗。
// 立法本意、量尺对比与反向自查见 docs/交付/第23单-雨密度余量复核.md。
const RAIN_FRAC_MIN=0.10;             // 可调：雨占全时长比例下限
const RAIN_FRAC_MAX=0.18;             // 可调：雨占全时长比例上限
const PAY_MIN=4;                      // 可调：发薪次数下限
const RENT_EXACT=1;                   // 口径：30 天窗口恰逢一次交租日
const MARKET_MIN=4;                   // 可调：街市到访人次下限
const GAP_MAX=1080;                   // 可调：最长"无戏"间隔（分钟，含夜间）
const MONEY_FLOOR=-123;               // 可调：负债下限
let fails=0;
const ok=(c,m)=>{ if(!c){fails++; console.log('FAIL:',m);} else console.log(' ok :',m); };
function run(seed){
  const w=Sim.makeWorld(seed);
  let rainTicks=0;
  for(let i=0;i<DAYS*144;i++){
    Sim.step(w,10);
    rainTicks+=w.weather.rain?1:0;      // 纯观测：一拍恰 10 分钟，故下雨拍数×10＝下雨分钟数。只读 w.weather，不写 w.stats，世界状态零触碰
    for(const a of w.agents){
      if(!isFinite(a.money)||!isFinite(a.hunger)||!isFinite(a.energy)){ ok(false,'NaN@'+seed+':'+a.name); return null; }
      if(a.hunger<0||a.hunger>100||a.energy<0||a.energy>100){ ok(false,'范围越界@'+seed+':'+a.name); return null; }
      if(a.money<MONEY_FLOOR){ ok(false,'负债穿底@'+seed+':'+a.name+' ¥'+Math.round(a.money)); return null; }
    }
  }
  return {w, rainMin:rainTicks*10};
}
function sig(w){ return JSON.stringify(w.stats)+'|'+w.agents.map(a=>a.id+':'+a.money+':'+a.anchor+':'+a.hunger+':'+a.energy).join('|'); }
for(const seed of SEEDS){
  const r=run(seed);
  if(!r) continue;
  const w=r.w;
  ok(true,'['+seed+'] 30 天生存不变量');
  const ent=w.agents.map(a=>PURE.entropy((w.stats.act||{})[a.id]||{}));
  ok(ent.every(e=>e>=ENTROPY_MIN),'['+seed+'] 动作熵每人≥'+ENTROPY_MIN+'：'+ent.map(e=>e.toFixed(2)).join('/'));
  const g=PURE.gini(w.agents.map(a=>a.money));
  ok(g<=GINI_MAX,'['+seed+'] 财富基尼≤'+GINI_MAX+'：'+g.toFixed(2));
  const pairs=Object.keys(w.stats.pair||{});
  const chats=pairs.reduce((s,k)=>s+w.stats.pair[k],0);
  ok(chats>=CHAT_MIN && pairs.length>=PAIR_MIN,'['+seed+'] 社交：'+chats+' 次 · '+pairs.length+' 对');
  const rf=r.rainMin/(DAYS*1440);
  ok(rf>=RAIN_FRAC_MIN && rf<=RAIN_FRAC_MAX,'['+seed+'] 雨占全时长 '+(rf*100).toFixed(2)+'%（'+r.rainMin+' 分钟 · '
     +w.stats.rain+' 场 · 场均 '+(w.stats.rain?Math.round(r.rainMin/w.stats.rain):0)+' 分钟）');
  ok(w.stats.pay>=PAY_MIN,'['+seed+'] 发薪 '+w.stats.pay+' 次');
  ok(w.stats.rentPaid===RENT_EXACT,'['+seed+'] 交租 '+w.stats.rentPaid+' 次');
  ok(w.stats.market>=MARKET_MIN,'['+seed+'] 街市到访 '+w.stats.market+' 人次');
  ok(w.stats.maxGap<=GAP_MAX,'['+seed+'] 最长无戏间隔 '+w.stats.maxGap+' 分钟');
}
{
  const A=Sim.makeWorld(SEEDS[0]), B=Sim.makeWorld(SEEDS[0]);
  for(let i=0;i<DAYS*144;i++){ Sim.step(A,10); Sim.step(B,10); }
  ok(sig(A)===sig(B),'同种子 30 天确定性');
}
console.log(fails?('\n'+fails+' FAILURES'):'\n30D ALL PASS');
process.exit(fails?1:0);
