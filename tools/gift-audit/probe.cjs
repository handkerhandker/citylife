// 第 93 单·欠人情排队取证（只读诊断，不进 gate.yml、不判红）
//
// 为什么要有它：这道闸改的是**生日之后那两周**的事（第 87 单只记最后一份 ⇒ 三份礼只还一份），
// 而生日最早在 D72、30 天窗口走不到 ⇒ 门禁那两枚指纹**看不出来**。本工具拿**上一版**
// （默认第 92 单那一版，commit `7738b36`）整块解包，与当前工作区**同一颗种子跑同一段日子**：
//   旧版：三人送礼 ⇒ 回礼 **1** 笔（另两份白收） ／ 新版：回礼 **3** 笔（一天一笔，收几份还几份）。
// 判据（退出码）：新版回礼笔数 == 收到的礼的份数，且 **> 旧版**（闸真咬住了）。
//
// 用法：node tools/gift-audit/probe.cjs [--before=7738b36] [--种子=20260803,424242]
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const 仓库 = path.resolve(__dirname, '../..');
const 参数 = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=?(.*)$/.exec(a);
  if (m) 参数[m[1]] = m[2];
}
const 种子表 = String(参数['种子'] || '20260803,424242').split(',').map(s => parseInt(s, 10)).filter(isFinite);
const 自然天 = Math.max(1, parseInt(参数['自然天'] || '400', 10) || 400);
const 上一版 = 参数['before'] || '7738b36';        // 第 92 单那一版（v85）：本单动手前的最后一版
const 今天 = new Date().toISOString().slice(0, 10);
const 临时根 = 参数['临时'] || (fs.existsSync('F:\\临时') ? path.join('F:\\临时', 今天) : os.tmpdir());
const 临时 = path.join(临时根, 'gift-audit');
fs.mkdirSync(临时, { recursive: true });

const 解包 = html => { const m = /<script>([\s\S]*)<\/script>/.exec(html); if (!m) throw new Error('没找到 <script> 整块'); return m[1]; };
const 装载 = (名, 源码) => {
  const 文件 = path.join(临时, 名 + '.cjs');
  fs.writeFileSync(文件, 源码);
  delete require.cache[require.resolve(文件)];
  const mod = require(文件);
  if (!mod || !mod.Sim) throw new Error(名 + '：解出来的模块没有 Sim');
  return mod;
};
let 旧, 新;
try {
  旧 = 装载('before', 解包(execFileSync('git', ['-C', 仓库, 'show', 上一版 + ':city-life-framework.html'], { encoding: 'utf8', maxBuffer: 1 << 28 })));
} catch (e) { console.log('✘ 取不到上一版 ' + 上一版 + '：' + e.message); process.exit(1); }
新 = 装载('after', 解包(fs.readFileSync(path.join(仓库, 'city-life-framework.html'), 'utf8')));

/* 跑一段**构造**：一个人过生日（首位住户顾云帆，年内第 158 天），此后 16 天里
   **每天 15:00–21:00 每 10 分钟**把四个人摁在同一间屋、都空闲，并让**四个人都各推一把 decide**
   （回礼是人自己决定的——第一版只推了送礼那三位，寿星永远不还礼，读数是 0）。
   计数走 `lid` 增量扫，**不看最后的日志墙**：墙封 400 条，16 天后生日那天的条目早被裁掉了。
   为什么需要这种构造：礼物要"同屋 ＋ 寿星在窗内空闲"，自然跑 30 天里只有 0–1 份（实测），
   要验"收几份还几份"必须把这一晚摁住。 */
function 跑一段({ Sim }, seed, 天 = 16) {
  const w = Sim.makeWorld(seed);
  const 寿星 = w.agents[0];
  const 日底 = Math.floor(Sim.thisYearBdayAt(w, 寿星) / 1440) * 1440;
  let 送礼 = 0, 回礼 = 0;
  for (let d = 0; d < 天; d++) {
    for (let m = 15 * 60; m < 21 * 60; m += 10) {
      w.t = 日底 + d * 1440 + m;
      for (const a of w.agents) { a.anchor = 'home_table'; a.activity = { type: 'idle' }; a.busyUntil = 0; a.hunger = 30; a.energy = 80; }
      const 起点 = w.lidSeq;
      for (const a of w.agents) Sim.decide(w, a);
      for (const e of w.log) {
        if (!(e.lid > 起点)) continue;
        const t = String(e.text || '');
        if (t.indexOf('带了') === 0 && t.indexOf('过去给' + 寿星.name) >= 0) 送礼++;
        if (t.indexOf('回了') === 0) 回礼++;
      }
    }
  }
  return { 寿星: 寿星.name, 送礼, 回礼, 欠账: Array.isArray(寿星.giftRecv) ? 寿星.giftRecv.length : (寿星.giftRecv ? 1 : 0) };
}

/* 自然跑：不作任何构造，只逐拍数三样——
   ① 送出去的礼（"带了…过去给…"）；② 回礼（"回了…"）；
   ③ **真实机会**：生日窗口里"寿星醒着 ＋ 有一个**空闲**的邻居跟他同一间屋"的拍数
      （只看"同屋有人"会把"同事在上班"那一大堆假机会算进来——实测办公室那几个生日正是这么被高估的）。 */
function 自然跑({ Sim }, seed, 天 = 400) {
  const w = Sim.makeWorld(seed);
  const 屋 = a => { const x = Sim.ANCHORS[a.anchor]; return x ? x.room : 'street'; };
  let 送礼 = 0, 回礼 = 0, 机会 = 0;
  for (let i = 0; i < 天 * 144; i++) {
    const 起点 = w.lidSeq;
    Sim.step(w, 10);
    const mod = ((w.t % 1440) + 1440) % 1440;
    const 寿 = w.agents.find(a => Sim.inBirthday(w, a));
    if (寿 && mod >= Sim.GIFT.open && mod < Sim.GIFT.close
        && 寿.activity.type !== 'sleep' && 寿.activity.type !== 'nap') {
      if (w.agents.some(a => a !== 寿 && 屋(a) === 屋(寿) && w.t >= a.busyUntil)) 机会++;
    }
    for (const e of w.log) {
      if (!(e.lid > 起点)) continue;
      const t = String(e.text || '');
      if (t.indexOf('带了') === 0 && t.indexOf('过去给') > 0) 送礼++;
      if (t.indexOf('回了') === 0) 回礼++;
    }
  }
  return { 送礼, 回礼, 机会 };
}

console.log('对标版本：' + 上一版 + '（上一版） ↔ 当前工作区（这一版）\n');
let 红 = 0;
console.log('── 甲 · 构造：生日当天起 16 天，四人同屋且空闲（验"收几份还几份"）──────────────');
for (const seed of 种子表) {
  const a = 跑一段(旧, seed), b = 跑一段(新, seed);
  const ok = b.回礼 >= b.送礼 && b.回礼 > a.回礼;
  if (!ok) 红++;
  console.log((ok ? ' ok : ' : ' FAIL: ') + '[' + seed + '] ' + a.寿星 + ' 过生日：收到 ' + b.送礼 + ' 份礼 ｜ 旧版回 '
    + a.回礼 + ' 笔 → 新版回 ' + b.回礼 + ' 笔（队里还剩 ' + b.欠账 + ' 条）');
}
console.log('\n── 乙 · 自然跑 ' + 自然天 + ' 天：礼物这条线到底会不会发生（不作任何构造）────────────');
for (const seed of 种子表) {
  const a = 自然跑(旧, seed, 自然天), b = 自然跑(新, seed, 自然天);
  const ok = b.送礼 > a.送礼;
  if (!ok) 红++;
  console.log((ok ? ' ok : ' : ' FAIL: ') + '[' + seed + '] 送礼：旧版 ' + a.送礼 + ' 份 → 新版 ' + b.送礼
    + ' 份（回礼 ' + a.回礼 + ' → ' + b.回礼 + '）｜ 新版**真实机会** ' + b.机会 + ' 拍');
}
console.log('\n' + (红 ? ('✘ ' + 红 + ' 项不对——这条线还没接好') :
  ('✔ 构造：新版一份一份还；自然跑：新版把"生日礼物"从"几乎不发生"拉回会发生')));
process.exit(红 ? 1 : 0);
