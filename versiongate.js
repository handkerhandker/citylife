// 涨号铁律门禁（第 28 单立）。被验的是 city-life-framework.html 的原文与 version-ledger.json，不是副本。
//
// 立这条的缘由：版本号在第 25／26／27 单连着三单该涨没涨——三单都动了 HTML、
// 界面上那个数却一直钉在 v33，交付件开头还照抄「代码基线：v33」。
// 三单里没有任何一步是错的，错的是**没有任何机器闸在拦**：涨号全靠人自觉，
// 而人自觉在这个项目里已经被证伪三次（照第 20 单走位三铁律、第 23／24 单的先例，
// 靠人眼看出来、靠交付件写一句话放行的东西，下一单照样复发）。
//
//   铁律 · 只要 city-life-framework.html 的字节变了，界面上的构建版本号必须随之改变。
//
// 口径为什么定在「整份文件字节」而不是「只算 <script> 段」：
//   界面上那个数的标签逐字是「构建版本／旧卡片不会自动更新，请从最新消息打开」（html:404），
//   它对玩家的唯一用途就是**认出手里这份产物是哪一版**。故只要产物的字节变了，这个数就该变——
//   这比任务书说的「游戏代码」更严（连改一句 CSS、改一个标签文案都要涨号），
//   好处是**在这个文件内部没有任何盲区**：不存在「改了但哈希没变」的缝。
//   代价照实登记在交付件「挡得住什么／挡不住什么」一节。
//
// 两层判据（为什么要两层，见各层「这一层堵的洞」）：
//   第一层 · 版本对照表：不需要 git，任何一份检出都能跑。
//   第二层 · git 差分  ：天然是「一单一号」的粒度，且堵住第一层唯一的洞。
//
// 用法：node versiongate.js
//   （不依赖 app.js，故不必先跑门禁第 1 步；可单独跑）
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = __dirname;
const HTML_PATH = path.join(ROOT, 'city-life-framework.html');
const LEDGER_PATH = path.join(ROOT, 'version-ledger.json');
const HTML_REL = 'city-life-framework.html';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log(' ok :', m); };
const skip = m => console.log(' -- :', m);

// ── 版本号的唯一权威处：city-life-framework.html 里 id="set-build" 那个 span 的文本 ──
// 正则只认这个 id，故不会误配到 html:2086 那句注释里的「v33 及以前落的盘」——
// 那是叙述历史事实的提及，不是版本号定义处，改它反而是错的。
const VER_RE = /id="set-build"[^>]*>\s*([^<]*?)\s*</;
const parseVersion = buf => { const m = buf.toString('utf8').match(VER_RE); return m ? m[1] : null; };
const verNum = v => { const m = /^v(\d+)$/.exec(v || ''); return m ? Number(m[1]) : NaN; };
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

// ═════════════════════════════════════════════════════════════════════════════
// 第一层 · 版本对照表（纯函数，不碰 git、不碰磁盘，故反向自查可以直接喂它造出来的场景）
//
// 判据：
//   ① 版本号必须解析得出且形如 vN。
//   ② vN 已登记 ⇒ 当前 HTML 的 sha256 必须与登记值逐字相等。
//      对不上＝「这个号已经发过版了，而文件字节又变了」＝改了代码没涨号。**判红。**
//   ③ vN 未登记且 vN 大于表内最大号 ⇒ 放行（施工正在一个新号上干活，中途不必反复改表）。
//      这一条是刻意留的：让「涨号」成为习惯动作，而不是让「改对照表」成为习惯动作。
//   ④ vN 未登记且 vN 不大于表内最大号 ⇒ 判红（往回退号、或占用已退役的号）。
//
// 这一层堵的洞：改了 HTML 却没涨号，在**任何一份检出上**（含无 git 的 zip、含直推 main）当场判红。
// 这一层自己的洞：不涨号、直接把表里当前号那条的 sha256 改成新值，就能变绿。由第二层堵。
// ═════════════════════════════════════════════════════════════════════════════
function checkLedger(htmlBuf, ledger) {
  const v = parseVersion(htmlBuf);
  if (!v) return { ok: false, kind: 'NOVER', msg: 'HTML 里找不到 id="set-build"，版本号无处可读' };
  const n = verNum(v);
  if (!Number.isFinite(n)) return { ok: false, kind: 'BADVER', msg: `版本号 "${v}" 不合形如 vN 的格式` };

  const rows = ledger.条目 || [];
  const hit = rows.find(r => r.版本 === v);
  const h = sha256(htmlBuf);
  const max = rows.reduce((a, r) => Math.max(a, verNum(r.版本)), -Infinity);

  if (hit) {
    return hit.sha256 === h
      ? { ok: true, kind: 'MATCH', msg: `${v} 已登记，HTML 字节与登记值逐字相等（${h.slice(0, 8)}…）` }
      : {
        ok: false, kind: 'MISMATCH',
        msg: `${v} 是已登记（已发版）的号，而 HTML 字节已变：登记 ${hit.sha256.slice(0, 8)}… ≠ 实际 ${h.slice(0, 8)}…\n`
          + `        ⇒ 改了 ${HTML_REL} 却没涨号。请把 html:405 的构建版本号涨一位，再跑 node versiongate.js --登记`,
      };
  }
  if (n > max) {
    return {
      ok: true, kind: 'NEW',
      msg: `${v} 尚未登记且大于表内最大号 v${max}（施工中的新号，本层放行）`
        + `\n        ※ 收工前必须补登：node versiongate.js --登记`,
    };
  }
  return {
    ok: false, kind: 'BACKWARD',
    msg: `${v} 未登记，且不大于表内最大号 v${max} ⇒ 往回退号或占用已退役的号`,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 第二层 · git 差分（纯函数部分：只吃「基线那份 HTML」与「当前这份 HTML」两个 Buffer）
//
// 判据：基线到当前，HTML 字节变了 ⇒ 版本号必须跟着变。没变＝判红。
//
// 为什么这一层天然是「一单一号」的粒度：基线取的是与 main 的分叉点，
// 一条分支＝一单，故单里改几次 HTML 都只要求整条分支相对 main 涨一次号，
// 中途提交不会被逐个判红。
//
// 为什么这一层不会让历史提交无法通过：老提交是 main 的祖先，
// merge-base(它, main) ＝ 它自己 ⇒ 差分为空 ⇒ 直接跳过。**只对当前及往后生效**是结构性的，
// 不是靠写一个截止日期。
// ═════════════════════════════════════════════════════════════════════════════
function checkBump(baseBuf, headBuf) {
  if (sha256(baseBuf) === sha256(headBuf)) return { ok: true, kind: 'SKIP', msg: `${HTML_REL} 相对基线零改动 ⇒ 本层不适用` };
  const a = parseVersion(baseBuf), b = parseVersion(headBuf);
  if (a === b) {
    return {
      ok: false, kind: 'STALE',
      msg: `${HTML_REL} 相对基线已改动，而构建版本号两头都是 ${a} ⇒ 改了代码没涨号`,
    };
  }
  return { ok: true, kind: 'BUMPED', msg: `${HTML_REL} 有改动，构建版本号 ${a} → ${b} 已随之改变` };
}

// ── git 取数（取不到一律不判红，只登记 SKIP 与理由；理由必须印出来，不许静默放行） ──
const git = (args, raw) => {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28, encoding: raw ? 'buffer' : 'utf8' });
  } catch (e) { return null; }
};
// 注意：`cat-file -e` 成功时输出是空串，故这里必须判 !==null 而不是判真值。
const gitOk = sha => git(`cat-file -e ${sha}^{commit}`) !== null;
const showHtml = sha => git(`show ${sha}:${HTML_REL}`, true);

function resolveBase() {
  // ① CI 的 pull_request 事件把基线 sha 直接给进来（gate.yml 里传 VERSIONGATE_BASE）
  const env = (process.env.VERSIONGATE_BASE || '').trim();
  if (env && gitOk(env)) return { sha: git(`rev-parse ${env}`).trim(), how: 'CI 传入的 PR 基线 sha' };
  if (env) return { sha: null, how: `环境变量给了 ${env.slice(0, 12)}… 但该提交在本地不可达（多半是浅克隆，需 fetch-depth: 0）` };
  // ② 本地／push 事件：与 main 的分叉点
  for (const ref of ['origin/main', 'main']) {
    const b = git(`merge-base HEAD ${ref}`);
    if (b && b.trim()) return { sha: b.trim(), how: `merge-base HEAD ${ref}` };
  }
  return { sha: null, how: '仓库里取不到 origin/main 或 main（无 git 历史／无 remote）' };
}

// ═════════════════════════════════════════════════════════════════════════════
// 正查
// ═════════════════════════════════════════════════════════════════════════════
const htmlBuf = fs.readFileSync(HTML_PATH);
const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
const curVer = parseVersion(htmlBuf);
const curSha = sha256(htmlBuf);

// `--登记` / `--register`：把当前版本号与当前字节写进对照表。
// 单独成一个开关而不是让门禁自动写，是因为**自动写等于这道闸自己把自己关了**。
if (process.argv.includes('--登记') || process.argv.includes('--register')) {
  const rows = ledger.条目;
  const hit = rows.find(r => r.版本 === curVer);
  if (hit) { hit.sha256 = curSha; hit.SIM块md5 = simMd5(htmlBuf); }
  else rows.push({ 版本: curVer, 单: process.env.VERSIONGATE_UNIT || '（待填：第 NN 单）', 状态: '已发', sha256: curSha, SIM块md5: simMd5(htmlBuf), 备注: '' });
  rows.sort((a, b) => verNum(a.版本) - verNum(b.版本));
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`已登记 ${curVer} → ${curSha}`);
  process.exit(0);
}

function simMd5(buf) {
  const m = buf.toString('utf8').match(/\/\*SIM-START\*\/([\s\S]*?)\/\*SIM-END\*\//);
  return m ? crypto.createHash('md5').update(m[1]).digest('hex') : null;
}

const verLine = htmlBuf.toString('utf8').split('\n').findIndex(l => l.includes('id="set-build"')) + 1;
console.log('── 涨号铁律 · 正查 ──────────────────────────────────────');
console.log(`   当前构建版本号 ${curVer}（${HTML_REL}:${verLine}）`
  + ` · HTML sha256 ${curSha.slice(0, 12)}… · SIM 块 md5 ${String(simMd5(htmlBuf)).slice(0, 12)}…`);

// 对照表自身的结构自洽（表烂了则一切判据失效，故先验表）
{
  const rows = ledger.条目 || [];
  ok(Array.isArray(rows) && rows.length > 0, '对照表非空');
  ok(rows.every(r => /^v\d+$/.test(r.版本)), '对照表每条的版本号形如 vN');
  ok(rows.every(r => /^[0-9a-f]{64}$/.test(r.sha256)), '对照表每条都带一个合法 sha256');
  ok(new Set(rows.map(r => r.版本)).size === rows.length, '对照表版本号无重号');
  ok(rows.every((r, i) => i === 0 || verNum(r.版本) > verNum(rows[i - 1].版本)), '对照表版本号严格递增');
  ok(new Set(rows.map(r => r.sha256)).size === rows.length,
    '对照表无两号共用同一字节状态（同一份产物不许挂两个号）');
}

const L = checkLedger(htmlBuf, ledger);
ok(L.ok, `第一层 · 版本对照表：${L.msg}`);

// 第二层
console.log('── 涨号铁律 · 第二层 git 差分 ────────────────────────────');
const base = resolveBase();
if (!base.sha) {
  skip(`第二层跳过：${base.how} —— 此时只剩第一层兜底，能挡的范围见交付件「挡得住什么／挡不住什么」`);
} else {
  const baseBuf = showHtml(base.sha);
  if (!baseBuf) {
    skip(`第二层跳过：基线 ${base.sha.slice(0, 8)} 上取不到 ${HTML_REL}`);
  } else {
    console.log(`   基线 ${base.sha.slice(0, 8)}（${base.how}） · 基线版本号 ${parseVersion(baseBuf)}`);
    const B = checkBump(baseBuf, htmlBuf);
    ok(B.ok, `第二层 · 涨号判据：${B.msg}`);

    // 补一条「上一单收工时该登记而没登记」的闸：基线是 main 上已发版的状态，它必须在表里。
    // 只在基线版本号 ≥ 对照表起点时才适用 —— 对照表起点之前的历史（v33 及以前）
    // 本来就没有表可查，故**结构性地只对当前及往后生效**，不会让历史提交无法通过。
    const rows = ledger.条目, minV = Math.min(...rows.map(r => verNum(r.版本)));
    const bv = parseVersion(baseBuf);
    if (!(verNum(bv) >= minV)) {
      skip(`基线登记检查跳过：基线版本号 ${bv} 早于对照表起点 v${minV}（对照表自第 28 单起立，之前无表可查）`);
    } else {
      const bh = rows.find(r => r.版本 === bv);
      ok(bh && bh.sha256 === sha256(baseBuf),
        `基线 ${bv} 已在对照表里且哈希对得上 —— 这一条堵的是「上一单发了版却没补登对照表」`);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 反向自查（第 20 单立下的规矩：闸立完必须把病态写法复演一遍，断言它确实被判违规。
//           一条恒绿的闸等于没立。）
//
// 本单的反向自查有一处比历次都强的地方：**病态场景不是造出来的，是真实历史。**
// 第 25／26／27 单本身就是「改了 HTML 没涨号」的三个真实样本，
// 第 23／24 单则是「没动 HTML 所以正确地没涨号」的真实对照。
// 故这道闸直接拿 git 里的真提交对喂，证的是「它当初就该判红、且不会误伤那两单」。
// git 不可达时（浅克隆）退回等价的合成场景，并印出走的是哪条路。
// ═════════════════════════════════════════════════════════════════════════════
console.log('── 涨号铁律 · 反向自查 · 第一层（对照表） ────────────────');
{
  const fake = { 条目: [{ 版本: 'v36', 单: '第27单', 状态: '已发', sha256: sha256(Buffer.from('AAA')), SIM块md5: null, 备注: '' }] };
  const mk = (ver, body) => Buffer.from(`<span class="num dim" id="set-build">${ver}</span>${body}`, 'utf8');
  // 让 v36 那条的哈希正好等于「原样」这份，好造出三个场景
  const 原样 = mk('v36', 'GAME CODE');
  fake.条目[0].sha256 = sha256(原样);

  const r原样 = checkLedger(原样, fake);
  ok(r原样.ok && r原样.kind === 'MATCH', '不误伤：HTML 一个字节没动（＝只改了 .md 文档的单）⇒ 判绿');

  const r病 = checkLedger(mk('v36', 'GAME CODE CHANGED'), fake);
  ok(!r病.ok && r病.kind === 'MISMATCH', '拦得住：改了游戏代码而版本号还钉在已发版的 v36 ⇒ 判红（MISMATCH）');

  const r涨 = checkLedger(mk('v37', 'GAME CODE CHANGED'), fake);
  ok(r涨.ok && r涨.kind === 'NEW', '不误伤：改了游戏代码且涨到未登记的 v37 ⇒ 放行（施工中的新号）');

  const r退 = checkLedger(mk('v35', 'GAME CODE CHANGED'), fake);
  ok(!r退.ok && r退.kind === 'BACKWARD', '拦得住：把号往回退到 v35 想绕过去 ⇒ 判红（BACKWARD）');

  const r无 = checkLedger(Buffer.from('<span>没有这个 id</span>', 'utf8'), fake);
  ok(!r无.ok && r无.kind === 'NOVER', '拦得住：把 id="set-build" 整个删掉想绕过去 ⇒ 判红（NOVER）');

  // 只改文档不动 HTML —— 这一条单独立，因为它是本单最要紧的「不许误伤」
  ok(checkLedger(原样, fake).ok, '不误伤（复述）：文档单不碰 HTML，故对照表这一层对它恒绿');
}

console.log('── 涨号铁律 · 反向自查 · 第二层（拿真实历史对喂） ──────────');
{
  // 单号 → 该单合并进 main 的 merge commit。三红三绿的期望写死在这里。
  const 史 = [
    { 从: '8a00b34', 到: '005f0fe', 名: '第26单→第27单（真实：动了 HTML 279+/18−，号没涨）', 期望: 'STALE' },
    { 从: '73ea78e', 到: '8a00b34', 名: '第25单→第26单（真实：动了 HTML 188+/6−，号没涨）', 期望: 'STALE' },
    { 从: '1d23ae1', 到: '73ea78e', 名: '第24单→第25单（真实：动了 HTML 25+/1−，号没涨）', 期望: 'STALE' },
    { 从: '95a2cb0', 到: '1d23ae1', 名: '第23单→第24单（真实：HTML 零改动，正确地没涨号）', 期望: 'SKIP' },
    { 从: '8641aa2', 到: '95a2cb0', 名: '第22单→第23单（真实：HTML 零改动，正确地没涨号）', 期望: 'SKIP' },
    { 从: 'c29512d', 到: '8641aa2', 名: '第21单→第22单（真实：动了 HTML，且 v32→v33 涨了号）', 期望: 'BUMPED' },
  ];
  const 可达 = 史.every(s => gitOk(s.从) && gitOk(s.到));
  if (可达) {
    for (const s of 史) {
      const r = checkBump(showHtml(s.从), showHtml(s.到));
      const 判 = s.期望 === 'STALE' ? '判红' : '判绿';
      ok(r.kind === s.期望, `${判}：${s.名} ⇒ ${r.kind}`);
    }
    ok(史.filter(s => s.期望 === 'STALE').length === 3 && 史.filter(s => s.期望 !== 'STALE').length === 3,
      '构造成立：三个真实的「该涨没涨」样本判红、三个真实的「不该涨/涨了」样本判绿，正反两面都有（不是恒绿也不是恒红）');
  } else {
    skip('真实历史不可达（浅克隆），退回合成场景');
    const mk = (ver, body) => Buffer.from(`<span class="num dim" id="set-build">${ver}</span>${body}`, 'utf8');
    ok(checkBump(mk('v36', 'A'), mk('v36', 'B')).kind === 'STALE', '判红（合成）：HTML 变了、号没变');
    ok(checkBump(mk('v36', 'A'), mk('v36', 'A')).kind === 'SKIP', '判绿（合成）：HTML 没变（＝只改文档）');
    ok(checkBump(mk('v36', 'A'), mk('v37', 'B')).kind === 'BUMPED', '判绿（合成）：HTML 变了、号也涨了');
  }
}

console.log('── 涨号铁律 · 历史取证表自核（对照表 .历史 一节是否对得上 git） ──');
{
  const 历史 = ledger.历史 || [];
  if (!历史.length) { skip('对照表无 .历史 一节'); }
  else if (!历史.every(r => gitOk(r.合并))) { skip('真实历史不可达（浅克隆），历史取证表本次不自核'); }
  else {
    for (const r of 历史) {
      const buf = showHtml(r.合并);
      const 实哈 = sha256(buf), 实标 = parseVersion(buf);
      ok(实哈 === r.sha256 && 实标 === r.当时界面上的号,
        `${r.单}（${r.合并}）：HTML sha256 ${实哈.slice(0, 8)}… · 当时界面上写的是 ${实标}`
        + `${r.应为 && r.应为 !== 实标 ? ` ⇒ 事实上该是 ${r.应为}（本单补正）` : ''}`);
    }
    const 漂 = 历史.filter(r => r.应为 && r.应为 !== r.当时界面上的号);
    ok(漂.length === 3, `取证结论：v33 这一个号先后挂过 ${new Set(历史.filter(r => r.当时界面上的号 === 'v33').map(r => r.sha256)).size} 份不同字节的产物`
      + ` ⇒ 第 ${漂.map(r => r.单.replace(/[^0-9]/g, '')).join('／')} 单三单漏涨（这正是本单要补的账）`);
  }
}

console.log(fails ? ('\n' + fails + ' FAILURES') : '\n涨号铁律 ALL PASS');
process.exit(fails ? 1 : 0);
