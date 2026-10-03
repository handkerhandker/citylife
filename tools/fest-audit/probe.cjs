// 第 90 单·江灯节「每人每晚一盏」取证（只读诊断，不进 gate.yml、不判红）
//
// 为什么要有它：这道闸改的是**一晚之内**的行为（原来一晚反复去：实测 11–12 盏来自 4 个人），
// 而 30 天窗口根本走不到江灯节（它在年内第 45 天）——门禁那两枚指纹据此**不会动**，
// 也就是说"改对了没有"只能靠**跑那一晚**来看。本工具于是拿**上一版**（默认第 89 单那一版，
// commit `b904a53`）整块解包，与当前工作区**同一颗种子跑同一晚**，并排印盏数与人次：
//   旧版：一晚 11–12 盏、有人 3–4 盏 ／ 新版：一晚 ≤4 盏、每人至多 1 盏。
// 判据（退出码）：新版总数 ≤4 且逐人 ≤1 且新版 < 旧版（闸真的咬住了）；否则 exit 1。
//
// 用法：
//   node tools/fest-audit/probe.cjs
//   node tools/fest-audit/probe.cjs --before=b904a53 --种子=20260803,424242,777
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const 仓库 = path.resolve(__dirname, '../..');
const 参数 = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=?(.*)$/.exec(a);
  if (m) 参数[m[1]] = m[2];
}
const 种子表 = String(参数['种子'] || '20260803,424242,777').split(',').map(s => parseInt(s, 10)).filter(isFinite);
const 上一版 = 参数['before'] || 'b904a53';        // 第 89 单那一版（v83）：本单动手前的最后一版
const 今天 = new Date().toISOString().slice(0, 10);
const 临时根 = 参数['临时'] || (fs.existsSync('F:\\临时') ? path.join('F:\\临时', 今天) : os.tmpdir());
const 临时 = path.join(临时根, 'fest-audit');
fs.mkdirSync(临时, { recursive: true });

const 解包 = html => {
  const m = /<script>([\s\S]*)<\/script>/.exec(html);
  if (!m) throw new Error('这份 HTML 里没找到 <script> 整块');
  return m[1];
};
const 落盘并加载 = (名, 源码) => {
  const 文件 = path.join(临时, 名 + '.cjs');
  fs.writeFileSync(文件, 源码);
  delete require.cache[require.resolve(文件)];
  const mod = require(文件);
  if (!mod || !mod.Sim) throw new Error(名 + '：解出来的模块没有 Sim');
  return { Sim: mod.Sim, PURE: mod.PURE };
};

let 旧, 新;
try {
  旧 = 落盘并加载('before', 解包(execFileSync('git', ['-C', 仓库, 'show', 上一版 + ':city-life-framework.html'],
    { encoding: 'utf8', maxBuffer: 1 << 28 })));
} catch (e) {
  console.log('✘ 取不到上一版 ' + 上一版 + '：' + e.message); process.exit(1);
}
新 = 落盘并加载('after', 解包(fs.readFileSync(path.join(仓库, 'city-life-framework.html'), 'utf8')));

/* 跑江灯节那一晚：从开灯前 10 分钟起，跑到收灯播报之后（多给 10 分钟余量）。
   只读统计：数「在江边放了一盏灯」的日志条数（按人）＋ 收灯播报原文。 */
function 跑一晚({ Sim }, seed) {
  const w = Sim.makeWorld(seed);
  const 节 = Sim.thisYearFestAt(w);
  w.t = 节 - 10;
  for (const a of w.agents) a.busyUntil = 0;
  let 已 = w.lidSeq;
  for (let i = 0; i < 200 && w.t < 节 + 4 * 60 + 60; i++) Sim.step(w, 10);
  const 数 = {};
  for (const e of w.log) {
    if (e.lid <= 已) continue;
    if (String(e.text || '').indexOf('在江边放了一盏灯') >= 0) 数[e.name] = (数[e.name] || 0) + 1;
  }
  const 收 = (w.log.filter(e => String(e.text || '').indexOf('收灯了') >= 0).pop() || {}).text || '（没收灯播报）';
  return { seed, 节, 数, 总: Object.values(数).reduce((a, b) => a + b, 0), 收 };
}

console.log('对标版本：' + 上一版 + '（上一版） ↔ 当前工作区（这一版）');
console.log('口径：同一颗种子跑江灯节那一晚（19:00–23:00），数「在江边放了一盏灯」的条数\n');
let 红 = 0;
for (const seed of 种子表) {
  const a = 跑一晚(旧, seed), b = 跑一晚(新, seed);
  const 逐人 = Object.entries(b.数).map(([n, c]) => n + '×' + c).join(' ');
  const 旧逐人 = Object.entries(a.数).map(([n, c]) => n + '×' + c).join(' ');
  const 人ok = Object.values(b.数).every(c => c <= 1);
  const ok = b.总 <= 4 && 人ok && b.总 < a.总;
  if (!ok) 红++;
  console.log((ok ? ' ok : ' : ' FAIL: ') + '[' + seed + '] 旧版 ' + a.总 + ' 盏（' + 旧逐人 + '） → 新版 '
    + b.总 + ' 盏（' + 逐人 + '）' + (人ok ? '' : '　✘ 有人超过一盏'));
  console.log('        收灯播报（新）：' + b.收);
}
console.log('');
console.log(红 ? ('✘ ' + 红 + ' 颗种子没咬住——这道闸没起作用') :
  ('✔ ' + 种子表.length + ' 颗种子：新版一晚 ≤4 盏、逐人 ≤1 盏，且比旧版少 ⇒ 「每人每晚一盏」真在拦'));
process.exit(红 ? 1 : 0);
