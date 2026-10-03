// 第 48 单 · 接话池配对取证（**只读诊断**：不进 gate.yml、不判红、不改任何产品代码）
//
// 要量的东西：一场闲聊里，**接话句到底答不答得上开口句**。
// 机械判据（第 48 单立）：开口句 → 类别（`Sim.CHAT_OPEN_KIND`，从生产源码现读，不在本脚本里另抄一份），
// 接话句应当出自**同类**那一组。改前 32 条接话是「万能承接」、根本不分组，故改前这条只能量
// 「组内命中率」的反面：**接话句落在同类别组里的比例**（改前 0%，因为压根没有组）。
// 语义好不好只能人看，故本脚本同时印若干场**逐字实录**供目验。
//
// 另一件要量的事：**容量**。接话池分组后，每一组的长度必须 ≥ 该组单日被抽次数的峰值
// （第 13 单口径「上墙池容量须 ≥ 全城单日抽取峰值」按组重算），否则同一天里同一组会被抽空、
// 只能靠 `pickV` 的「池尽重置」兜底重复。本脚本就印这张逐 (人 × 类别) 的峰值表。
//
// 用法：先按门禁第 1 步生成 app.js，再 `node tools/chat-pair/probe.cjs [样本场数]`
const {PURE, Sim} = require('../../app.js');

const SEEDS = [20260803, 424242, 777];
const DAYS = 30;
const 样本上限 = Number(process.argv[2] || 14);
const THOUGHT = /^「(.*)」「(.*)」$/;          // pushLog 里闲聊那条 thought 的格式（它把两句并进同一条日志）
/* 第 82 单修：这张名字表原先只写到六类，第 65 单加 `bday`、第 72 单加 `talk` 之后，
   下面那行 `类别名[k].padEnd(5)` 直接**崩**（Cannot read properties of undefined）——
   工具自己另抄了一份类别表，生产加一类它就烂一次。治法两条：
     ① 名字**从生产那张 `Sim.CHAT_KINDS` 派生**，查不到就用键名兜底（**由构造保证不再崩**）；
     ② 归类那一段也照生产的第二、第三张开口池（生日问候／夜谈话题）补上（不然"归不了类"会虚高）。 */
const 类别名 = Object.fromEntries((Sim.CHAT_KINDS||[]).map(k => [k, ({
  eat:'问我吃', busy:'问我忙', invite:'说地点', vent:'吐苦水', view:'说看法', self:'说自己',
  bday:'过生日', talk:'聊话题',
})[k] || k]));
const 名 = k => 类别名[k] || String(k);

const 开口峰 = {}, 接话峰 = {}, 样本 = [];
let 总场数 = 0, 归类失败 = 0, 组内命中 = 0, 组内可判 = 0, 组间串门 = 0;
// 第 48 单·目验用：每句接话**实际接过哪些开口**（一句一行，供人判「答得上吗」；顺带看有多少句从没被抽到）
const 接过谁 = new Map();   // '人|类别|接话句' → Set('开口句｜开口人')

const 读组 = (workKind, kind) => {
  const g = Sim.CHAT_FB_REPLY[workKind];
  return (g && Array.isArray(g[kind])) ? g[kind] : null;   // 改前：CHAT_FB_REPLY 是平铺数组，没有组
};

for (const seed of SEEDS) {
  const w = Sim.makeWorld(seed);
  let 已读 = 0;
  const 日计 = {};                                        // 只按「天」清账：峰值＝单日最大抽取次数
  for (let i = 0; i < DAYS * 144; i++) {
    Sim.step(w, 10);
    for (const e of w.log) {
      if (e.lid <= 已读) continue;
      已读 = e.lid;
      if (e.type !== 'chat') continue;
      const m = THOUGHT.exec(e.thought || '');
      if (!m) continue;
      const 开口人 = w.agents.find(a => a.id === e.agent);
      const 接话人 = w.agents.find(a => a.id === e.with);
      if (!开口人 || !接话人) continue;
      const 表 = Sim.CHAT_OPEN_KIND[开口人.workKind] || [];
      const idx = Sim.CHAT_FB_OPEN[开口人.workKind].indexOf(m[1]);
      /* 第 82 单：开口池有三张了（平常那张按人挂；生日问候与夜谈话题各一张）——
         后两张要照**条目自己的日子**把模板展开再比（与门禁那支普查同一套口径）。 */
      const 题面 = Sim.talkTopicOnDay ? Sim.talkTopicOnDay(PURE.dayOf(e.t)) : '';
      const ti = (Sim.TALK_OPEN && Sim.TALK_OPEN[开口人.workKind] || [])
        .findIndex((s, i) => Sim.talkOpenLine(开口人.workKind, i, 题面) === m[1]);
      const bi = (Sim.CHAT_FB_OPEN_BDAY && Sim.CHAT_FB_OPEN_BDAY[开口人.workKind] || []).indexOf(m[1]);
      const kind = idx >= 0 ? 表[idx] : (bi >= 0 ? 'bday' : (ti >= 0 ? 'talk' : undefined));
      if (!kind) { 归类失败++; continue; }
      总场数++;
      const 日 = PURE.dayOf(w.t);
      const c = 日计[日] || (日计[日] = {});
      const ko = 开口人.workKind + '|' + kind, kr = 接话人.workKind + '|' + kind;
      const co = c['o' + ko] = (c['o' + ko] || 0) + 1;
      const cr = c['r' + kr] = (c['r' + kr] || 0) + 1;
      if (co > (开口峰[ko] || 0)) 开口峰[ko] = co;
      if (cr > (接话峰[kr] || 0)) 接话峰[kr] = cr;
      // 分配上的「答得上」：接话句是否落在**同类别**那一组里
      const 组 = 读组(接话人.workKind, kind);
      if (组) {
        组内可判++;
        if (组.indexOf(m[2]) >= 0) 组内命中++;
        else {
          const g = Sim.CHAT_FB_REPLY[接话人.workKind];
          if (Object.keys(g).some(k => Array.isArray(g[k]) && g[k].indexOf(m[2]) >= 0)) 组间串门++;
        }
      }
      {
        const kk = 接话人.workKind + '|' + kind + '|' + m[2];
        if (!接过谁.has(kk)) 接过谁.set(kk, new Set());
        接过谁.get(kk).add(m[1] + '｜' + 开口人.name);
      }
      if (样本.length < 样本上限) 样本.push({seed, 日, kind, 开口人: 开口人.name, 接话人: 接话人.name, said: m[1], back: m[2]});
    }
  }
}

const 四人 = [...new Set(Object.keys(Sim.CHAT_FB_OPEN))];
const 空 = v => String(v === undefined ? '—' : v).padStart(3);

console.log('种子 ' + SEEDS.join('/') + '，各 ' + DAYS + ' 天；共 ' + 总场数 + ' 场闲聊'
  + '；开口句归不了类的 ' + 归类失败 + ' 条');

console.log('\n═══ 一 · 单日抽取峰值（按 人 × 类别；容量取这个数的上界）═══');
console.log('开口人      ' + Sim.CHAT_KINDS.map(k => 名(k).padEnd(5)).join(''));
for (const k of 四人) console.log(k.padEnd(12) + Sim.CHAT_KINDS.map(kd => 空(开口峰[k + '|' + kd]).padEnd(5)).join(''));
console.log('接话人      ' + Sim.CHAT_KINDS.map(k => 名(k).padEnd(5)).join(''));
for (const k of 四人) console.log(k.padEnd(12) + Sim.CHAT_KINDS.map(kd => 空(接话峰[k + '|' + kd]).padEnd(5)).join(''));
console.log('（开口峰值＝该人当天说出的某类话最多几条；接话峰值＝该人当天接某类话最多几次。'
  + '分组后每一组的长度必须 ≥ 对应峰值，否则当天就会抽空重复。）');

console.log('\n═══ 二 · 配对判据：接话句是否出自「开口句类别」那一组 ═══');
if (!组内可判) console.log('  改前形态：接话池未分组（CHAT_FB_REPLY[人] 是平铺数组）⇒ 本条无从判，'
  + '「同类命中率」按 0% 记 —— 这正是本单要治的病。');
else console.log('  同类命中 ' + 组内命中 + ' / ' + 组内可判 + ' 场（' + (组内命中 / 组内可判 * 100).toFixed(1) + '%）'
  + '；落进别的组（串门）' + 组间串门 + ' 场');

console.log('\n═══ 三 · 逐字实录（语义只能目验：接话这一句，答上了吗）═══');
for (const s of 样本) {
  console.log('  [D' + s.日 + ' ' + s.开口人 + '→' + s.接话人 + '·' + 名(s.kind) + ']');
  console.log('    「' + s.said + '」');
  console.log('    「' + s.back + '」');
}

console.log('\n═══ 四 · 每句接话接过谁（全样本；括号里是开口人）═══');
console.log('  读法：这一行就是「这句接话答的是哪几句开口」——读一遍就知道答不答得上；');
console.log('  没被抽到的句子在末尾单列（不是错，只是这 30×3 天里没轮到）。\n');
let 覆盖 = 0, 总数 = 0;
for (const k of 四人) {
  for (const kd of Sim.CHAT_KINDS) {
    const 组 = (Sim.CHAT_FB_REPLY[k] || {})[kd] || [];
    if (!组.length) continue;
    console.log('  【' + k + '·' + 名(kd) + '】');
    const 没抽到 = [];
    for (const s of 组) {
      总数++;
      const 见过 = 接过谁.get(k + '|' + kd + '|' + s);
      if (!见过) { 没抽到.push(s); continue; }
      覆盖++;
      console.log('    「' + s + '」 ← ' + [...见过].join('　'));
    }
    if (没抽到.length) console.log('    （本次没抽到：' + 没抽到.map(s => '「' + s + '」').join('') + '）');
  }
}
console.log('\n  覆盖：' + 覆盖 + ' / ' + 总数 + ' 句接话在这段样本里被抽到过（'
  + (覆盖 / 总数 * 100).toFixed(0) + '%）');
