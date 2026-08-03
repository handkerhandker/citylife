// 30 天退化检查：六项。阈值集中于下方常量区（保守初值，可调；放宽须走任务书②C条款）。
const {PURE, Sim} = require('./app.js');
const SEEDS=[20260803, 424242];       // 可调：抽查种子（两颗都须过第 1–5 项）
const DAYS=30;                        // 可调：模拟天数
const ENTROPY_MIN=1.0;                // 可调：每人动作熵下限（比特）
const GINI_MAX=0.75;                  // 可调：财富基尼上限
const CHAT_MIN=20;                    // 可调：闲聊总数下限
const PAIR_MIN=3;                     // 可调：不同闲聊对数下限
const RAIN_MIN=1;                     // 可调：雨次数下限
const RAIN_MAX=59;                    // 可调：雨次数上限
const PAY_MIN=4;                      // 可调：发薪次数下限
const RENT_EXACT=1;                   // 口径：30 天窗口恰逢一次交租日
const MARKET_MIN=4;                   // 可调：街市到访人次下限
const GAP_MAX=1080;                   // 可调：最长"无戏"间隔（分钟，含夜间）
const MONEY_FLOOR=-123;               // 可调：负债下限
let fails=0;
const ok=(c,m)=>{ if(!c){fails++; console.log('FAIL:',m);} else console.log(' ok :',m); };
function run(seed){
  const w=Sim.makeWorld(seed);
  for(let i=0;i<DAYS*144;i++){
    Sim.step(w,10);
    for(const a of w.agents){
      if(!isFinite(a.money)||!isFinite(a.hunger)||!isFinite(a.energy)){ ok(false,'NaN@'+seed+':'+a.name); return null; }
      if(a.hunger<0||a.hunger>100||a.energy<0||a.energy>100){ ok(false,'范围越界@'+seed+':'+a.name); return null; }
      if(a.money<MONEY_FLOOR){ ok(false,'负债穿底@'+seed+':'+a.name+' ¥'+Math.round(a.money)); return null; }
    }
  }
  return w;
}
function sig(w){ return JSON.stringify(w.stats)+'|'+w.agents.map(a=>a.id+':'+a.money+':'+a.anchor+':'+a.hunger+':'+a.energy).join('|'); }
for(const seed of SEEDS){
  const w=run(seed);
  if(!w) continue;
  ok(true,'['+seed+'] 30 天生存不变量');
  const ent=w.agents.map(a=>PURE.entropy((w.stats.act||{})[a.id]||{}));
  ok(ent.every(e=>e>=ENTROPY_MIN),'['+seed+'] 动作熵每人≥'+ENTROPY_MIN+'：'+ent.map(e=>e.toFixed(2)).join('/'));
  const g=PURE.gini(w.agents.map(a=>a.money));
  ok(g<=GINI_MAX,'['+seed+'] 财富基尼≤'+GINI_MAX+'：'+g.toFixed(2));
  const pairs=Object.keys(w.stats.pair||{});
  const chats=pairs.reduce((s,k)=>s+w.stats.pair[k],0);
  ok(chats>=CHAT_MIN && pairs.length>=PAIR_MIN,'['+seed+'] 社交：'+chats+' 次 · '+pairs.length+' 对');
  ok(w.stats.rain>=RAIN_MIN && w.stats.rain<=RAIN_MAX,'['+seed+'] 雨次数 '+w.stats.rain);
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
