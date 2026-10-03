// 第 137 单·三件套回写器（工作流工具；快、不需要浏览器，进冒烟档 1 跑 --自测）
//
// 用法：
//   正式：node tools/closeout/writeback.cjs --单=137 --单条=<文件> --交接块=<文件> --待办块=<文件> [--旧版=v116 --新版=v117]
//   预演：同上再加 --试运行（只打印将发生的变化，不落盘）
//   自测：node tools/closeout/writeback.cjs --自测    （在 F:\临时\<今天>\ 沙盒里跑 7 个场景，全过退出码 0）
//
// 它做什么（与手工 updateN.cjs 同构，但把护栏收进来）：
//   ① 在两份活文档的**第 2 行（逐单基线行）末尾**追加「单条」段——不再手抄「已知结尾」（抄错=事故的来源）；
//   ② 「交接块」插到 `第 78 单·三项自测全套复跑` 锚点之前；「待办块」插到 `## 下一单候选（按优先级）` 锚点之前；
//   ③ 可选的版本行替换（交接说明.md 的 `当前构建版本 **vX**`，须恰好一处）；
//   ④ 先全量校验、后落盘、再读回——判据含第 134 单门禁规则三的同一套：
//      单条必须以单「。）」收尾、`。））` 坏形态零命中、交付件尾巴出现次数为 1；
//   ⑤ 正式写完后自动跑 `node linegate.js`（第 9 步门禁），红则本工具退出码也红。
//
// 三条硬口径（各自都来自已发生过的真实事故）：
//   · 收尾括号只许出现一次——别再多写一个「）」（132/133 两单连发过，见第 134 单）；
//   · 疑似已回写过（该单的交付件尾巴已在文件里）⇒ 直接拒绝，绝不写第二遍；
//   · 锚点找不到/不唯一 ⇒ 拒绝（宁可不写，不许写歪）。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const 交接 = '交接说明.md', 待办 = '待办.md';
const 交接锚 = '第 78 单·三项自测全套复跑', 待办锚 = '## 下一单候选（按优先级）';
const 坏形态 = /交付件＝`[^`\n]+`。））/;

const 读 = p => fs.readFileSync(p, 'utf8');
const 写 = (p, s) => fs.writeFileSync(p, s);
const 去边 = s => s.replace(/^\s+|\s+$/g, '');

function 解析参数(argv) {
  const o = {};
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) o[m[1]] = m[2];
    else if (/^--[^=]+$/.test(a)) o[a.slice(2)] = true;
  }
  return o;
}

/* 在第 2 行末尾插入（行尾若有 \r 则插在 \r 之前，保持原换行风格） */
function 行二尾插入(s, 文本) {
  const i1 = s.indexOf('\n');
  if (i1 < 0) throw new Error('没有第一行换行');
  const i2 = s.indexOf('\n', i1 + 1);
  if (i2 < 0) throw new Error('没有第二行换行');
  const 点 = (i2 > i1 + 1 && s[i2 - 1] === '\r') ? i2 - 1 : i2;
  return s.slice(0, 点) + 文本 + s.slice(点);
}
function 行二(s) {
  const i1 = s.indexOf('\n');
  const i2 = s.indexOf('\n', i1 + 1);
  return s.slice(i1 + 1, i2).replace(/\r$/, '');
}
function 插到锚前(s, 锚, 块) {
  const i = s.indexOf(锚);
  if (i < 0) throw new Error('锚点找不到：' + 锚);
  if (s.indexOf(锚, i + 1) >= 0) throw new Error('锚点不唯一：' + 锚);
  return s.slice(0, i) + 块 + s.slice(i);
}

/* 核心：只在内存里做一切；返回 {a,b}（两份文件的产物）。任何一步不合格就 throw。 */
function 回写构造(根, 参) {
  const 单 = String(参['单'] || '');
  if (!/^\d+$/.test(单)) throw new Error('--单 必须是数字');
  const 单条 = 去边(读(参['单条']));
  const 交接块 = 去边(读(参['交接块'])).replace(/\r?\n/g, '\r\n') + '\r\n';   // 块内换行统一成 CRLF（与历次回写一致）
  const 待办块 = 去边(读(参['待办块'])).replace(/\r?\n/g, '\r\n') + '\r\n';
  if (/\n/.test(单条)) throw new Error('单条必须是单行（基线行是一行）');
  if (!单条.includes('第 ' + 单 + ' 单') && !单条.includes('第' + 单 + '单')) throw new Error('单条里找不到「第 ' + 单 + ' 单」');
  if (坏形态.test(单条)) throw new Error('单条里出现「。））」坏形态（收尾括号只许一个）');
  const 尾 = (单条.match(/交付件＝`docs\/交付\/[^`\n]+`。）$/) || [])[0];
  if (!尾) throw new Error('单条必须以「交付件＝`docs/交付/…md`。）」收尾（单括号）');
  const 交0 = 读(path.join(根, 交接)), 待0 = 读(path.join(根, 待办));
  for (const [名, s] of [[交接, 交0], [待办, 待0]]) {
    if (!行二(s).endsWith('。）')) throw new Error(名 + '：第 2 行不是以单「。）」收尾（先修齐再回写）');
    if (s.includes(尾)) throw new Error(名 + '：该单的交付件尾巴已在文件里——疑似已回写过，拒绝写第二遍');
  }
  let a = 行二尾插入(交0, 单条);
  a = 插到锚前(a, 交接锚, 交接块);
  if (参['旧版'] || 参['新版']) {
    if (!参['旧版'] || !参['新版']) throw new Error('--旧版/--新版 必须成对给');
    const 旧 = '当前构建版本 **' + 参['旧版'] + '**', 新 = '当前构建版本 **' + 参['新版'] + '**';
    const i = a.indexOf(旧);
    if (i < 0) throw new Error(交接 + '：版本行「' + 旧 + '」找不到');
    if (a.indexOf(旧, i + 1) >= 0) throw new Error(交接 + '：版本行不唯一');
    a = a.slice(0, i) + 新 + a.slice(i + 旧.length);
  }
  let b = 行二尾插入(待0, 单条);
  b = 插到锚前(b, 待办锚, 待办块);
  // 产物校验（与第 134 单门禁规则三同一套判据）
  for (const [名, s] of [[交接, a], [待办, b]]) {
    if (!行二(s).endsWith(尾)) throw new Error(名 + '：产物第 2 行行尾不对');
    if (坏形态.test(s)) throw new Error(名 + '：产物出现「。））」坏形态');
    const 计 = s.split(尾).length - 1;
    if (计 !== 1) throw new Error(名 + '：交付件尾巴出现次数不为 1（' + 计 + '）');
  }
  if (!a.includes(交接块.trim())) throw new Error(交接 + '：交接块没出现在产物里');
  if (!b.includes(待办块.trim())) throw new Error(待办 + '：待办块没出现在产物里');
  return { a, b, 单条, 尾 };
}

/* ── 自测：在沙盒里跑 7 个场景 ─────────────────────────────────────── */
function 自测() {
  const 今 = new Date();
  const 日 = 今.getFullYear() + '-' + String(今.getMonth() + 1).padStart(2, '0') + '-' + String(今.getDate()).padStart(2, '0');
  const 父 = 'F:/临时/' + 日;
  fs.mkdirSync(父, { recursive: true });
  const 根 = fs.mkdtempSync(path.join(父, 'writeback-selftest-'));
  const 造 = (目录) => {
    fs.mkdirSync(目录, { recursive: true });
    fs.writeFileSync(path.join(目录, 交接), '# 测\n更新：…交付件＝`docs/交付/第998单-x.md`。）\r\n\r\n当前构建版本 **v998**（占位）\r\n\r\n第 78 单·三项自测全套复跑（占位）\r\n');
    fs.writeFileSync(path.join(目录, 待办), '# 测\n更新：…交付件＝`docs/交付/第998单-x.md`。）\r\n\r\n## 下一单候选（按优先级）\r\n');
    fs.writeFileSync(path.join(目录, '单条.txt'), '**第 999 单 v999**（测试）…交付件＝`docs/交付/第999单-测试.md`。）');
    fs.writeFileSync(path.join(目录, '交接块.txt'), '第 999 单·测试（**工具**；不涨号）：块 A。');
    fs.writeFileSync(path.join(目录, '待办块.txt'), '> **第 999 单补记**：块 B。');
  };
  const 参 = d => ({ '单': '999', '单条': path.join(d, '单条.txt'), '交接块': path.join(d, '交接块.txt'), '待办块': path.join(d, '待办块.txt') });
  const 例 = [];
  const 跑 = (名, 造件, 调, 期望) => {
    const d = path.join(根, 名);
    造(d); 造件 && 造件(d);
    let 结果 = '过', 详 = '';
    try {
      const r = 回写构造(d, 调(d));
      写(path.join(d, 交接), r.a); 写(path.join(d, 待办), r.b);
      详 = '行尾→' + 行二(读(path.join(d, 交接))).slice(-24);
    } catch (e) { 结果 = '拒'; 详 = String(e.message).slice(0, 60); }
    const 好 = 结果 === 期望;
    例.push({ 名, 结果, 期望, 好, 详 });
    console.log((好 ? ' ok  ' : ' FAIL ') + 名 + '：' + 结果 + '（期望 ' + 期望 + '）  ' + 详);
  };
  跑('① 正常回写', null, d => 参(d), '过');
  跑('② 单条带坏形态「。））」', d => fs.writeFileSync(path.join(d, '单条.txt'), '**第 999 单**（测试）…交付件＝`docs/交付/第999单-测试.md`。））'), d => 参(d), '拒');
  跑('③ 现存文件第 2 行以「。））」收尾', d => { const p = path.join(d, 交接); 写(p, 读(p).replace('第998单-x.md`。）', '第998单-x.md`。））')); }, d => 参(d), '拒');
  跑('④ 锚点缺失', d => { const p = path.join(d, 待办); 写(p, 读(p).replace('## 下一单候选（按优先级）', '## 换个标题')); }, d => 参(d), '拒');
  跑('⑤ 已回写过（尾巴已在）', d => { const p = path.join(d, 交接); 写(p, 读(p).replace('。）\r\n', '。）**第 999 单**（测试）…交付件＝`docs/交付/第999单-测试.md`。）\r\n')); }, d => 参(d), '拒');
  跑('⑥ 版本行找不到（被抠掉）⇒ 拒', d => { const p = path.join(d, 交接); 写(p, 读(p).replace('当前构建版本 **v998**（占位）\r\n\r\n', '')); }, d => Object.assign(参(d), { '旧版': 'v998', '新版': 'v999' }), '拒');
  跑('⑦ 单条多行', d => fs.writeFileSync(path.join(d, '单条.txt'), '**第 999 单**（测\n试）…交付件＝`docs/交付/第999单-测试.md`。）'), d => 参(d), '拒');
  跑('⑧ 版本行替换成功', null, d => Object.assign(参(d), { '旧版': 'v998', '新版': 'v999' }), '过');
  const 红 = 例.filter(x => !x.好).length;
  fs.writeFileSync(path.join(根, 'report.json'), JSON.stringify(例, null, 2), 'utf8');
  console.log('\n三件套回写器自测：' + 红 + ' 例不过 / 共 ' + 例.length + ' 例；沙盒在 ' + 根);
  process.exit(红 ? 1 : 0);
}

/* ── 主流程 ─────────────────────────────────────────────────────── */
{
  const 参 = 解析参数(process.argv.slice(2));
  if (参['自测']) 自测();
  else {
    const 缺 = ['单', '单条', '交接块', '待办块'].filter(k => !参[k]);
    if (缺.length) { console.log('缺参数：' + 缺.join('、') + '（用法见文件头注释；或加 --自测 跑沙盒自测）'); process.exit(2); }
    try {
      const r = 回写构造(ROOT, 参);
      console.log('校验全过：单条 +' + r.单条.length + ' 字；尾 = ' + r.尾.slice(0, 46) + '…');
      if (参['试运行']) { console.log('（--试运行：未落盘）'); process.exit(0); }
      写(path.join(ROOT, 交接), r.a); 写(path.join(ROOT, 待办), r.b);
      // 读回终验
      const a2 = 读(path.join(ROOT, 交接)), b2 = 读(path.join(ROOT, 待办));
      if (!行二(a2).endsWith(r.尾) || !行二(b2).endsWith(r.尾)) throw new Error('读回：行尾不对');
      if (a2.split(r.尾).length - 1 !== 1 || b2.split(r.尾).length - 1 !== 1) throw new Error('读回：尾巴计数不对');
      if (坏形态.test(a2) || 坏形态.test(b2)) throw new Error('读回：出现坏形态');
      console.log('已落盘并读回✓（交接说明.md ' + a2.length + ' 字；待办.md ' + b2.length + ' 字）');
      const lg = spawnSync('node', ['linegate.js'], { cwd: ROOT, encoding: 'utf8' });
      console.log('linegate：' + (lg.status === 0 ? 'ALL PASS' : '判红（退出码 ' + lg.status + '）'));
      process.exit(lg.status === 0 ? 0 : 1);
    } catch (e) {
      console.log('拒绝回写：' + e.message);
      process.exit(1);
    }
  }
}
