// 第 92 单·新状态的耐久性体检（千日长跑 ＋ 存档往返）（只读诊断，不进 gate.yml、不判红）
//
// 为什么要有它：第 87／88／90／91 单连着往世界里加了四样**长期活着**的东西——
// `giftRecv`（欠人情）／`ag.rel`（关系值）／`rel[对方].heart`（交心旗子）／`festLampDay`（今晚放过灯）。
// 门禁与 sim30 都只看 **30 天**，看不住"跑久了会不会长歪"：数值越界、旗子对不上、剪辑与日志墙撑破、
// 存档往返丢字段——这些病都要**跑够长**才现形。
// 本工具做两件事：
//   ① 千日长跑（默认 1000 天 × 3 种子），**逐日**扫一批硬不变量，并印 D30／100／300／1000 的画像；
//   ② 存档往返：跑完 1000 天 → `serialize` → `hydrate` → **深比全等**（键序不敏感）→ 再各跑 5 天逐拍比对。
// 判据（退出码）：任何一条不变量违规、或存档往返不全等／往返后行为分叉，都判红。
//
// 用法：
//   node tools/long-run/probe.cjs                       # 1000 天 × 3 种子（约 2 秒）
//   node tools/long-run/probe.cjs --天=200 --种子=20260803,424242
const path = require('path');
const { Sim, PURE } = require(path.resolve(__dirname, '../../app.js'));

const 参数 = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=?(.*)$/.exec(a);
  if (m) 参数[m[1]] = m[2];
}
const 天 = Math.max(1, parseInt(参数['天'] || '1000', 10) || 1000);
const 种子表 = String(参数['种子'] || '20260803,424242,777').split(',').map(s => parseInt(s, 10)).filter(isFinite);
const 看点 = [30, 100, 300, 1000].filter(d => d <= 天);

// 键序不敏感的深比（hydrate 会重建对象，键序可能变，那不是差异）
const 深 = x => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v))
  ? Object.keys(v).sort().reduce((o, kk) => (o[kk] = v[kk], o), {}) : v);

function 查一天(w, d, 坏) {
  for (const a of w.agents) {
    if (!isFinite(a.money) || !isFinite(a.hunger) || !isFinite(a.energy)) 坏.push('NaN@D' + d + ' ' + a.name);
    if (!(a.hunger >= 0 && a.hunger <= 100) || !(a.energy >= 0 && a.energy <= 100)) 坏.push('生存值越界@D' + d + ' ' + a.name);
    const R = a.rel || {};
    for (const id in R) {
      const r = R[id];
      if (!r || typeof r !== 'object') { 坏.push('rel 条目坏@D' + d + ' ' + a.name); continue; }
      if (!isFinite(r.v) || r.v < 0 || r.v > Sim.REL.cap) 坏.push('rel 越界@D' + d + ' ' + a.name + '→' + id + ' v=' + r.v);
      if (!isFinite(r.day) || r.day < 0) 坏.push('rel.day 坏@D' + d + ' ' + a.name + '→' + id + ' day=' + r.day);
      if (r.heart) {                                   // 旗子两边必须一致
        const o = w.agents.find(x => x.id === id);
        if (!o) 坏.push('旗子指向不存在的人@D' + d + ' ' + a.name + '→' + id);
        else if (!(o.rel && o.rel[a.id] && o.rel[a.id].heart)) 坏.push('旗子单边@D' + d + ' ' + a.name + '↔' + o.name);
      }
    }
    if (a.giftRecv && (!isFinite(a.giftRecv.t) || typeof a.giftRecv.from !== 'string')) 坏.push('giftRecv 坏@D' + d + ' ' + a.name);
    if (a.festLampDay !== undefined && !isFinite(a.festLampDay)) 坏.push('festLampDay 坏@D' + d + ' ' + a.name);
  }
  if (w.log.length > 400) 坏.push('日志墙越界@D' + d + ' ' + w.log.length);
  if ((w.clips || []).length > 60) 坏.push('剪辑越界@D' + d + ' ' + (w.clips || []).length);
}

let 红 = 0;
console.log('口径：' + 天 + ' 天 × ' + 种子表.length + ' 种子（' + 种子表.join('／') + '）；逐日扫硬不变量 ＋ 存档往返（深比全等 ＋ 往返后再跑 5 天逐拍）\n');
for (const seed of 种子表) {
  const w = Sim.makeWorld(seed);
  const 坏 = [];
  const 画像 = [];
  for (let d = 1; d <= 天; d++) {
    for (let i = 0; i < 144; i++) Sim.step(w, 10);
    查一天(w, d, 坏);
    if (坏.length > 8) break;
    if (看点.indexOf(d) >= 0) {
      const 钱 = w.agents.map(a => Math.round(a.money));
      const 档 = {};
      for (const a of w.agents) for (const id in (a.rel || {})) { const n = Sim.relTierName(a.rel[id].v); 档[n] = (档[n] || 0) + 1; }
      const 旗 = w.agents.reduce((s, a) => s + Object.values(a.rel || {}).filter(r => r.heart).length, 0) / 2;
      画像.push('D' + String(d).padStart(4) + ' ｜ 基尼 ' + PURE.gini(钱).toFixed(3) + ' ｜ 钱 ' + 钱.join('/')
        + ' ｜ 关系 ' + Object.entries(档).map(([k, v]) => k + '×' + v).join(' ') + ' ｜ 交心 ' + 旗 + ' 对');
    }
  }
  // 存档往返：深比全等 ＋ 各自再跑 5 天逐拍一致
  const { world: w2 } = Sim.hydrate(Sim.serialize(w, null)) || {};
  const 往返全等 = !!w2 && 深(w) === 深(w2);
  let 分叉 = -1;
  if (往返全等) {
    for (let i = 0; i < 720 && 分叉 < 0; i++) {
      Sim.step(w, 10); Sim.step(w2, 10);
      for (const a of w.agents) {
        const b = w2.agents.find(x => x.id === a.id);
        if (!b || JSON.stringify(a) !== JSON.stringify(b)) { 分叉 = i + 1; break; }
      }
    }
  }
  const ok = 坏.length === 0 && 往返全等 && 分叉 < 0;
  if (!ok) 红++;
  console.log((ok ? ' ok : ' : ' FAIL: ') + '[' + seed + '] ' + 天 + ' 天不变量违规 ' + 坏.length + ' 处；'
    + '存档往返深比全等 ' + (往返全等 ? '✓' : '✘') + '；往返后 5 天逐拍 ' + (分叉 < 0 ? '一致 ✓' : ('第 ' + 分叉 + ' 拍分叉 ✘')));
  for (const l of 画像) console.log('        ' + l);
  if (坏.length) console.log('        前几处：' + 坏.slice(0, 5).join(' ; '));
}
console.log('');
console.log(红 ? ('✘ ' + 红 + ' 颗种子不对——新状态的耐久性有问题') :
  ('✔ ' + 种子表.length + ' 颗种子 × ' + 天 + ' 天：四样新状态（关系值／交心旗子／欠人情／今晚放灯）全部守得住；'
    + '存档往返深比全等、往返后逐拍不分叉'));
process.exit(红 ? 1 : 0);
