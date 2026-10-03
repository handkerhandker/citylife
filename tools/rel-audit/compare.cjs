// 第 88 单·关系状态机 A 档的**行为零改动**取证（只读诊断，不进 gate.yml、不判红）
//
// 为什么要有它：A 档新增一处世界状态（`ag.rel`），方案里那句"世界指纹必变"是**预判**，
// 而"关系只动自己那一个数、不碰钱／饭／上班／睡觉"是**必须拿旧版逐拍对出来的**——
// 门禁只能证"这一版自洽"，证不了"与上一版行为逐字节相同"。故本工具把**上一版**
// （默认＝第 87 单那一版 v82，commit `34c9871`）整块解包出来，与当前仓库的这一版**并排跑**，
// 逐拍比对：同种子、同天数、逐 10 分钟一拍，四个人的
//   活动类型 ／ 锚点 ／ 钱 ／ 饥饿 ／ 体力 ／ 忙到几点
// 六项**逐字段**相同才算过（第一处不同会连采样序号一起印出来）。
//
// 用法：
//   node tools/rel-audit/compare.cjs                      # 默认 400 天 × 3 种子
//   node tools/rel-audit/compare.cjs --天=400 --种子=20260803,424242,777
//   node tools/rel-audit/compare.cjs --before=HEAD~1      # 换个"上一版"（默认 34c9871）
//   node tools/rel-audit/compare.cjs --临时=F:\临时\2026-10-03
// 退出码：0＝逐拍全同；1＝有分叉（或解包/取版失败）。
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const 仓库 = path.resolve(__dirname, '../..');
const 参数 = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=?(.*)$/.exec(a);
  if (m) 参数[m[1]] = m[2];
}
const 天 = Math.max(1, parseInt(参数['天'] || '400', 10) || 400);
const 种子表 = String(参数['种子'] || '20260803,424242,777').split(',').map(s => parseInt(s, 10)).filter(isFinite);
const 上一版 = 参数['before'] || '34c9871';        // 第 87 单那一版（v82）：关系状态机落地**之前**的最后一版
/* 第 104 单加：`--忽略=锚点` —— 把"锚点"这一项**从迹里摘掉**再比。
   用途：像"店员去货架理货"这种**只换站位、不该换日子**的改动，正需要证明"除了站的地方，别的逐拍全同"。 */
const 忽略 = String(参数['忽略'] || '').split(',').map(s => s.trim()).filter(Boolean);
/* 第 107 单加：`--允许分叉` —— 找到分叉也退 0。
   用途：冒烟器只关心"这支工具跑不跑得通"，而本工具的退出码本意是"有没有分叉"——
   拿它去自比（`--before=HEAD`）时，树上只要有未提交的行为改动就会退 1，冒烟器会误报"跑不通"。 */
const 允许分叉 = String(参数['允许分叉'] || '') !== '';
const 今天 = new Date().toISOString().slice(0, 10);
const 临时根 = 参数['临时'] || (fs.existsSync('F:\\临时') ? path.join('F:\\临时', 今天) : os.tmpdir());
const 临时 = path.join(临时根, 'rel-audit');
fs.mkdirSync(临时, { recursive: true });

// 与门禁第 1 步同一条解包口径（<script>…</script> 整块抠出来）
function 解包(html) {
  const m = /<script>([\s\S]*)<\/script>/.exec(html);
  if (!m) throw new Error('这份 HTML 里没找到 <script> 整块');
  return m[1];
}
function 落盘并加载(名, 源码) {
  const 文件 = path.join(临时, 名 + '.cjs');
  fs.writeFileSync(文件, 源码);
  delete require.cache[require.resolve(文件)];
  const mod = require(文件);
  if (!mod || !mod.Sim) throw new Error(名 + '：解出来的模块没有 Sim');
  return mod.Sim;
}

let 旧, 新;
try {
  旧 = 落盘并加载('before', 解包(execFileSync('git', ['-C', 仓库, 'show', 上一版 + ':city-life-framework.html'],
    { encoding: 'utf8', maxBuffer: 1 << 28 })));
} catch (e) {
  console.log('✘ 取不到上一版 ' + 上一版 + '：' + e.message);
  process.exit(1);
}
新 = 落盘并加载('after', 解包(fs.readFileSync(path.join(仓库, 'city-life-framework.html'), 'utf8')));

console.log('对标版本：' + 上一版 + '（上一版） ↔ 当前工作区（这一版）');
console.log('口径：' + 天 + ' 天 × ' + 种子表.length + ' 种子（' + 种子表.join('／') + '）；逐 10 分钟一拍，六项逐字段比对');
console.log('临时目录：' + 临时);

function 一拍一行(a, w) {
  const 六 = { 活动: a.activity.type, 锚点: a.anchor, 钱: a.money, 饥饿: a.hunger, 体力: a.energy, 忙到: a.busyUntil };
  return Object.keys(六).filter(k => 忽略.indexOf(k) < 0).map(k => 六[k]).join('|');
}
let 红 = 0;
const 汇总 = [];
for (const seed of 种子表) {
  const wOld = 旧.makeWorld(seed), wNew = 新.makeWorld(seed);
  let 首差 = null, 拍 = 0;
  for (let i = 0; i < 天 * 144 && !首差; i++) {
    旧.step(wOld, 10); 新.step(wNew, 10);
    for (const a of wOld.agents) {
      const b = wNew.agents.find(x => x.id === a.id);
      if (!b) { 首差 = { 拍: i + 1, 谁: a.id, 旧: '（这一版没有这个人）', 新: '缺' }; break; }
      const x = 一拍一行(a, wOld), y = 一拍一行(b, wNew);
      if (x !== y) { 首差 = { 拍: i + 1, 谁: a.name, 旧: x, 新: y }; break; }
    }
    拍 = i + 1;
  }
  // 四项读数（钱／饭／上班／睡觉）也逐条摆出来——它们是"不夺走"那条红线的直接读数
  const 四项 = (w) => w.agents.map(a => {
    const s = (w.stats.act && w.stats.act[a.id]) || {};
    return a.name + ' 钱' + Math.round(a.money) + ' 饭' + (s.eat | 0) + ' 班' + (s.work | 0) + ' 睡' + (s.sleep | 0);
  }).join('；');
  const 旧项 = 四项(wOld), 新项 = 四项(wNew);
  const 关 = (w) => { let n = 0; for (const e of w.log) if (String(e.text || '').indexOf('关系：') === 0) n++; return n; };
  /* 日志墙封 400 条，跑满 400 天时窗口里早就没有「关系：…」了 ⇒ 空转判据要看**关系表本身**，
     不能只看日志（"没看到"≠"没发生"）。 */
  const 边 = (w) => {
    let 记录 = 0, 正 = 0, 最高 = 0;
    for (const a of w.agents) {
      const R = a.rel; if (!R || typeof R !== 'object') continue;
      for (const id in R) {
        const v = R[id] && R[id].v;
        if (!isFinite(v)) continue;
        记录++; if (v > 0) 正++; if (v > 最高) 最高 = v;
      }
    }
    return { 记录, 正, 最高 };
  };
  const ok = !首差 && 旧项 === 新项;
  if (!ok) 红++;
  汇总.push({ seed, ok, 拍, 首差, 旧项, 新项, 关系日志_新: 关(wNew) });
  console.log((ok ? ' ok : ' : ' FAIL: ') + '[' + seed + '] ' + 拍 + ' 拍逐字段比对' +
    (ok ? '全同' : '在第 ' + 首差.拍 + ' 拍分叉（' + 首差.谁 + '）：旧 ' + 首差.旧 + ' ≠ 新 ' + 首差.新));
  console.log('        四项读数（旧）：' + 旧项);
  const b = 边(wNew);
  console.log('        四项读数（新）：' + 新项 + '　｜　关系表：' + b.记录 + ' 条边（v>0 的 ' + b.正 +
    ' 条，最高 ' + b.最高 + '）；日志里「关系：…」' + 关(wNew) + ' 条');
}
console.log('');
console.log(红 ? ('✘ ' + 红 + ' 颗种子分叉——关系这一层动到了行为，不许收工') :
  ('✔ ' + 种子表.length + ' 颗种子 × ' + 天 + ' 天：钱／饭／上班／睡觉与逐拍活动全部逐字段相同 ⇒ ' +
    '关系值只动自己那一个数。空转判据看**关系表本身**：终局每条边的 v 都已列在上面' +
    '（跑满 ' + 天 + ' 天时日志墙里那几句早被裁掉了，"没看到"不等于"没发生"）'));
process.exit(红 && !允许分叉 ? 1 : 0);
