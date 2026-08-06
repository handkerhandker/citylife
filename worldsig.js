// 世界指纹（第 24 单立，决策者裁定一）
//
// 项目从第 1 单起只有一个「指纹」＝`node sim30.js | md5sum`，它是**门禁自己那些输出行的 md5**，
// 于是「世界变了」和「门禁多打印了一行字」混成同一个数——第 23 单换雨的量尺时第一次撞上：
// 游戏代码 diff 为空、世界行为逐字节未变，指纹却必然要变。故裁定拆成两个数分别记账：
//
//   ① **世界指纹**＝本文件输出（只反映世界行为，**不含任何门禁打印文字**）。
//      只在 SIM 行为或 rng 流真的动了时才变。历次交付件想证明「世界没动」，证的就是这个数。
//   ② **门禁指纹**＝`node sim30.js | md5sum`（现行口径不变）。连门禁措辞都算在内，改门禁必变。
//
// 采集口径（写死，改动等于换指纹，须按宪法第 10 条重新入档）：
//   取双种子（与 sim30 同一组）各推 30 天，逐颗算一次**世界状态签名** sig(w)，
//   按种子先后**直接首尾相接（不加分隔符）**，对整串取 md5。
//   sig(w) 逐字沿用 sim30.js 里那一个（它本来就是「同种子 30 天确定性」那条断言用的判据，
//   自三件套首版起未变）：`JSON.stringify(w.stats)` ＋ 四人的 id/money/anchor/hunger/energy。
//   「不加分隔符」这一条是为**接住第 23 单实测的 d19035af7477984608b376115cb04e24**：
//   裁定一直接引用了那个数，换分隔符会让它对不上，故照原样固定下来。
//
// 覆盖不到的地方，照实写明（复报时别把这个数当成「什么都没变」的万能证明）：
//   sig(w) 只取 w.stats 与四人的四个字段，**不含**日志原文、活动标签、busyUntil、
//   处境 sit、作息 rest、flags、剪辑 clips、rngState。
//   故**只改 SIM 里的文案**（例如换一句日志措辞）时，世界指纹可能不变。
//   那一类单请另附「SIM 块源码 md5」——该做法第 20 单已有先例（交接说明「SIM 块 md5 逐字节一致」）：
//     python3 -c "import re,hashlib;s=open('city-life-framework.html').read();print(hashlib.md5(re.search(r'/\*SIM-START\*/([\s\S]*?)/\*SIM-END\*/',s).group(1).encode()).hexdigest())"
//
// 本文件是**诊断工具，不是门禁**：不进 .github/workflows/gate.yml，不判红，只印一个数。
// 用法：先按门禁第 1 步生成 app.js，再 `node worldsig.js`

const crypto = require('crypto');
const {Sim} = require('./app.js');
const SEEDS=[20260803, 424242];       // 与 sim30.js 同一组种子（两边须一致）
const DAYS=30;

function sig(w){ return JSON.stringify(w.stats)+'|'+w.agents.map(a=>a.id+':'+a.money+':'+a.anchor+':'+a.hunger+':'+a.energy).join('|'); }

let all='';
for(const seed of SEEDS){
  const w=Sim.makeWorld(seed);
  for(let i=0;i<DAYS*144;i++) Sim.step(w,10);
  all+=sig(w);
}
console.log(crypto.createHash('md5').update(all).digest('hex'));
