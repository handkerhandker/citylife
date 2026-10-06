// 第 293 单·文本层体检（真 SIM、纯 Node、进冒烟档 1）
//
// 为什么要它：门禁与探针量的是**数字与像素**，而玩家真正读的是**日志墙那一行行字**。
//   第 293 单把 3 种子 × 180 天的日志全文（27925 条）拉出来扫了一遍，当场定下六条判据；
//   以后每单由冒烟自动跑——"文本里冒出 undefined／NaN""空句""超长句""同一件事被记两遍"
//   这类毛病再不用靠人翻。
//
// 六条判据（阈值都取自那次实测）：
//   ① 零 `undefined`／`NaN`／`Infinity` 字面量；
//   ② 零空句、零"以标点开头"的断句；
//   ③ 单条 ≤ 120 字（实测最长远低于此，超了就是拼接出错）；
//   ④ **同人同句连着重**：同一人的同一句在 **≤20 分钟（两拍）内**重复 = 0——实测 180 天里
//      最近的一次是 **30 分钟**（"去了又回来"的正常重复），故门槛定在 20 分，两拍内重现才算"记重了"；
//   ⑤ 世界时间不许倒挂（后一条的 t 小于前一条）；
//   ⑥ 扫描面够广（条数太少说明样本被抽干，判红而不是放行）。
//
// 每条判据都带**反向自查**：把病态样本喂进同一个扫描器，必须当场判红（一条恒绿的闸等于没立）。
//
// 用法：node tools/text-audit/probe.cjs [输出目录] [--天数=180] [--种子=20260803,424242,777]
try { require('../lib/sync-app.cjs').同步(); } catch (e) { if (String(e && e.code) !== 'MODULE_NOT_FOUND') throw e; }
const fs = require('fs');
const path = require('path');
const { Sim } = require(path.resolve(__dirname, '../..', 'app.js'));

const 参数 = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=?(.*)$/.exec(a);
  if (m) 参数[m[1]] = m[2];
}
const 今天 = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
const OUT = path.resolve(参数.输出 || process.argv[2] && !String(process.argv[2]).startsWith('--') ? process.argv[2] : path.join('F:/临时', 今天, 'text-audit'));
fs.mkdirSync(OUT, { recursive: true });
const 天 = Number(参数.天数 || 180);
const 种子 = String(参数.种子 || '20260803,424242,777').split(',').map(Number).filter(Number.isFinite);

/* 扫描器：喂一串 {text, agent, name, t} 进来，回六类问题 */
function 扫(条) {
  const 坏 = { undefined的: [], NaN的: [], 空句: [], 超长: [], 二拍内重复: [], 时间倒挂: [] };
  let 上 = null, 上时 = -Infinity;
  for (const e of 条) {
    const t = String(e && e.text != null ? e.text : '');
    if (/undefined/.test(t)) 坏.undefined的.push(t);
    if (/NaN|Infinity/.test(t)) 坏.NaN的.push(t);
    if (!t.trim() || /^[·、，。！？：；]/.test(t.trim())) 坏.空句.push(JSON.stringify(t));
    if (t.length > 120) 坏.超长.push(t.slice(0, 40) + '…（' + t.length + '）');
    if (上 && 上.agent === e.agent && String(上.text) === t && Number.isFinite(e.t) && Number.isFinite(上.t) && (e.t - 上.t) <= 20) {
      坏.二拍内重复.push((e.name || e.agent || '?') + '：' + t + '（' + 上.t + '→' + e.t + '）');
    }
    if (Number.isFinite(e.t) && e.t < 上时 - 1) 坏.时间倒挂.push(t);
    if (Number.isFinite(e.t)) 上时 = e.t;
    上 = e;
  }
  return 坏;
}

/* ① 真样本 */
const 全 = [];
const 累计 = { undefined的: [], NaN的: [], 空句: [], 超长: [], 二拍内重复: [], 时间倒挂: [] };
for (const 种 of 种子) {
  const w = Sim.makeWorld(种);
  /* ★两个"入账口径"的坑都是本单踩出来的：
     ① `w.log` 是**滚动窗口**（有上限）⇒ 必须按 `lid` 水位线只收"新落的"那几条
        （第一版整窗反复入账：30 天样本被记成 3000 万条）；② 必须**逐世界分别扫**
        （三个种子的日志拼成一个数组时，第二个世界开局那条 t=0 会撞上第一个世界的末尾 t≈26 万，
        被"时间倒挂"误判）。 */
  const 本世界 = [];
  let 已读 = 0;
  for (let i = 0; i < 天 * 144; i++) {
    Sim.step(w, 10);
    for (const e of w.log) { if (e.lid > 已读) { 已读 = e.lid; 本世界.push(e); 全.push(e); } }
  }
  const 本坏 = 扫(本世界);
  for (const k of Object.keys(累计)) 累计[k].push(...本坏[k]);
}
const 坏 = 累计;
const 断言 = [];
const 判 = (n, ok, 读数_) => { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); };
判('① 零 undefined：' + 坏.undefined的.length + ' 条（样本 ' + 全.length + ' 条）', 坏.undefined的.length === 0, 坏.undefined的.slice(0, 2));
判('② 零 NaN／Infinity：' + 坏.NaN的.length + ' 条', 坏.NaN的.length === 0, 坏.NaN的.slice(0, 2));
判('③ 零空句／零"标点开头"：' + 坏.空句.length + ' 条', 坏.空句.length === 0, 坏.空句.slice(0, 2));
判('④ 零超长句（>120 字）：' + 坏.超长.length + ' 条', 坏.超长.length === 0, 坏.超长.slice(0, 2));
判('⑤ 零"同人同句两拍内重现"（≤20 分）：' + 坏.二拍内重复.length + ' 处', 坏.二拍内重复.length === 0, 坏.二拍内重复.slice(0, 3));
判('⑥ 零时间倒挂：' + 坏.时间倒挂.length + ' 条', 坏.时间倒挂.length === 0, 坏.时间倒挂.slice(0, 2));
判('⑦ 样本面够广（≥2000 条；太少说明抽干，判红不放行）', 全.length >= 2000, { 条数: 全.length, 天, 种子 });

/* ② 反向自查：把病态样本喂进同一个扫描器，必须当场判红 */
{
  const 病 = [
    { text: 'undefined 的事', agent: 'a1', name: '甲', t: 100 },
    { text: 'NaN 块钱', agent: 'a1', name: '甲', t: 110 },
    { text: '   ', agent: 'a2', name: '乙', t: 120 },
    { text: '、他说', agent: 'a2', name: '乙', t: 130 },
    { text: '长'.repeat(130), agent: 'a3', name: '丙', t: 140 },
    { text: '同一句', agent: 'a3', name: '丙', t: 150 },
    { text: '同一句', agent: 'a3', name: '丙', t: 160 },
    { text: '早的', agent: 'a4', name: '丁', t: 200 },
    { text: '晚的', agent: 'a4', name: '丁', t: 100 },
  ];
  const 病坏 = 扫(病);
  const 咬 = k => 病坏[k].length > 0;
  ok0('反向自查·①：喂一句含 undefined ⇒ 判红', 咬('undefined的'), 病坏.undefined的);
  ok0('反向自查·②：喂一句含 NaN ⇒ 判红', 咬('NaN的'), 病坏.NaN的);
  ok0('反向自查·③：喂一句空的／以标点开头 ⇒ 判红', 咬('空句'), 病坏.空句);
  ok0('反向自查·④：喂一句 130 字 ⇒ 判红', 咬('超长'), 病坏.超长);
  ok0('反向自查·⑤：喂同一人同一句隔 10 分钟（两拍内）⇒ 判红', 咬('二拍内重复'), 病坏.二拍内重复);
  ok0('反向自查·⑥：喂一条时间倒挂 ⇒ 判红', 咬('时间倒挂'), 病坏.时间倒挂);
  /* 不误伤：隔 30 分钟的重复（真实世界里"去了又回来"）必须放行 */
  const 好 = 扫([{ text: '回去又回来', agent: 'a1', name: '甲', t: 100 }, { text: '回去又回来', agent: 'a1', name: '甲', t: 130 }]);
  ok0('反向自查·不误伤：同人同句隔 30 分钟（＞两拍）照常放行', 好.二拍内重复.length === 0, 好.二拍内重复);
}
function ok0(n, ok, 读数_) { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); }

const 结论 = { 样本: { 种子, 天, 条数: 全.length }, 问题: Object.fromEntries(Object.entries(坏).map(([k, v]) => [k, v.length])),
  断言, 通过: 断言.every(x => x.ok) };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
const 红 = 断言.filter(x => !x.ok).length;
console.log('\n文本层体检：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
