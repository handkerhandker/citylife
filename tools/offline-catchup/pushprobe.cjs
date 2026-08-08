// 第 30 单·回城提示改弹窗 —— 取证脚本：「这次为什么没被推到剪辑页」
// （诊断工具，不是门禁：不进 gate.yml、不判红、只印读数。判红的那份在 harness.js「第 30 单」段。）
//
// 病症（决策者实测，v37 线上）：离开约 13 小时回来，屏幕上唯一的提示是日志墙里的一条
//   `D112 12:30 城市 ⏻ 你不在的时候，城市自己过了 13 小时。`
// 第 26 单裁定的是「跨过夜、且剪辑最新一张卡的日期前进了，就把剪辑页推到玩家面前」，
// 本次明显跨了夜（离开时 D111 23:30，回来时 D112 12:30），却没被推。本脚本查的就是这一条。
//
// 用法（仓库根目录，须先按门禁第 1 步抽出 app.js）：
//   python3 -c "import re;m=re.search(r'<script>([\s\S]*)</script>',open('city-life-framework.html').read());open('app.js','w').write(m.group(1))"
//   node tools/offline-catchup/pushprobe.cjs
//
// 本脚本只读：不改仓库任何文件，不写档，不出网。
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { PURE, Sim } = require(path.join(ROOT, 'app.js'));
const SEED = 20260803;
const line = s => console.log(s);
const hr = t => console.log('\n═══ ' + t + ' ' + '═'.repeat(Math.max(0, 60 - t.length)));

// 把世界推到 D<day> <min> 分，顺带按主循环的口径维护 lastReflectDay（判据要它进出同源）
function runTo(w, day, min) {
  let rd = PURE.dayOf(w.t) - 1;
  const target = (day - 1) * 1440 + min;
  while (w.t < target) {
    Sim.step(w, 10);
    const d = PURE.dayOf(w.t);
    if (d !== rd && PURE.minuteOfDay(w.t) >= Sim.REFLECT_MIN) rd = d;
  }
  return rd;
}

/* ── 问 1 · 复演决策者那一次：13 小时，跨了夜，为什么没推 ─────────────── */
hr('问 1 · 复演实测：D111 23:30 关页 → 13 小时后 D112 12:30 回来');
{
  const w = Sim.makeWorld(SEED);
  const rd = runTo(w, 111, 23 * 60 + 30);
  line('  离开时刻 t0 ＝ ' + PURE.fmtStamp(w.t) + '　lastReflectDay ＝ ' + rd
    + '（离开时 minuteOfDay ＝ ' + PURE.minuteOfDay(w.t) + ' ≥ REFLECT_MIN ' + Sim.REFLECT_MIN + '，故当天那一夜早已落过）');
  line('  离开时最新剪辑日 clipTopDay ＝ ' + Sim.clipTopDay(w) + '　w.clips 条数 ＝ ' + w.clips.length
    + '（已顶到 CLIP_KEEP ＝ ' + Sim.CLIP_KEEP + '，故「条数增量」这个读数从此恒为 0）');

  const plan = Sim.catchUpPlan(w, 13 * 3600 * 1000);
  const r = Sim.catchUp(w, plan.ticks, rd);
  line('  补算 ' + r.ticks + ' 拍 ⇒ 回来时刻 t1 ＝ ' + PURE.fmtStamp(w.t));
  line('');
  line('  ── 判据的两个合取项，逐项读数 ──');
  line('    catchup.nights   ＝ ' + r.nights + '   ← 「夜深了」节点＝' + Sim.REFLECT_MIN + ' 分（21:50），本窗一次都没跨到');
  line('    catchup.clipsNew ＝ ' + r.clipsNew + ' （clipTop ' + r.clipTop0 + ' → ' + r.clipTop1 + '）'
    + '   ← 剪辑日切＝240 分（04:00），本窗跨了一次，真出了一张新卡');
  line('    现行判据 nights>0 && clipsNew ＝ ' + (r.nights > 0 && r.clipsNew)
    + '  ⇒ ' + ((r.nights > 0 && r.clipsNew) ? '推剪辑页' : '**不推**，照旧进现场页'));
  const fresh = w.clips.filter(c => c.d > r.clipTop0);
  line('  补算期间真出的新卡：' + fresh.length + ' 张 → ' + fresh.map(c => 'D' + c.d + '·' + (c.name || '无人入选')).join('  '));
  line('');
  line('  ⇒ 结论：判据**生效了**，不是没跑；判成假的是 `nights>0` 那一半，而它判假是对的——');
  line('    离开那一刻（23:30）当天的「夜深了」已经落过，补算窗口 23:30→次日 12:30 里');
  line('    再没有第二个 21:50。**但新卡确确实实出了**（04:00 那一下把 D111 结算成了一张卡）。');
  line('    两个节点根本不是同一个时刻：「夜深了」21:50，剪辑日切 04:00，差 6 小时 10 分。');
  line('    把它们与在一起，就造出了一整片「有新卡却不推」的死区。');
}

/* ── 问 2 · 死区有多大：离开时刻 × 离开时长 全扫 ──────────────────── */
hr('问 2 · 死区扫描（●＝有新卡却没推｜✓＝推了｜·＝本来就没新卡，不推是对的）');
{
  const base = Sim.makeWorld(SEED);
  runTo(base, 100, 0);
  const SNAP = Sim.serialize(base, null);
  const HOURS = [0.5, 2, 5, 8, 13, 20, 26, 40];
  let head = '   离开时刻 |'; for (const h of HOURS) head += String(h + 'h').padStart(6);
  line(head);
  let dead = 0, total = 0;
  const deadRows = [];
  for (let lm = 0; lm < 1440; lm += 60) {
    let row = '     ' + String(Math.floor(lm / 60)).padStart(2, '0') + ':00 |';
    for (const h of HOURS) {
      const w = Sim.hydrate(SNAP).world;
      const rd = runTo(w, 100, lm);
      const plan = Sim.catchUpPlan(w, h * 3600 * 1000);
      const r = Sim.catchUp(w, plan.ticks, rd);
      total++;
      const sym = r.clipsNew ? ((r.nights > 0) ? '✓' : '●') : '·';
      if (sym === '●') { dead++; deadRows.push(String(Math.floor(lm / 60)).padStart(2, '0') + ':00×' + h + 'h'); }
      row += sym.padStart(6);
    }
    line(row);
  }
  line('');
  line('  死区格数 ' + dead + ' / ' + total + '（' + (dead * 100 / total).toFixed(1) + '%）');
  line('  死区的形状：**离开时刻落在 [21:50, 次日 04:00) 这 6 小时 10 分里，且回来时还没到当天 21:50**。');
  line('    离开时刻在这一段里 ⇒ 当天的「夜深了」已经落过、次日的还没到 ⇒ nights 恒为 0；');
  line('    而只要窗口盖过了 04:00，剪辑就照常结算出卡 ⇒ clipsNew 为真。两者一与，卡出了也不推。');
  line('    决策者那一次（23:30 关、次日 12:30 回）正落在这片里。');
}

/* ── 问 3 · 卡是补算中生成还是补算完结算？每个节点各出一张还是只出最后一张？ ── */
hr('问 3 · 剪辑卡在补算的哪一步落地');
{
  const w = Sim.makeWorld(SEED);
  const rd = runTo(w, 100, 20 * 60);
  const top0 = Sim.clipTopDay(w), lid0 = w.lidSeq;
  const plan = Sim.catchUpPlan(w, 72 * 3600 * 1000);
  line('  离开 D' + PURE.dayOf(w.t) + ' ' + PURE.fmtTime(w.t) + '，离开 72 小时 → ' + plan.ticks + ' 拍（顶到封顶 '
    + Sim.CATCHUP_MAX_DAYS + ' 天）');
  // 逐拍推进，观测卡在哪一拍落地
  const marks = [];
  let rd2 = rd;
  for (let i = 0; i < plan.ticks; i++) {
    const a = Sim.clipTopDay(w);
    const c = Sim.catchUp(w, 1, rd2); rd2 = c.lastReflectDay;
    const b = Sim.clipTopDay(w);
    if (b > a) marks.push('第 ' + (i + 1) + ' 拍（' + PURE.fmtStamp(w.t) + '）→ 落一张 D' + b);
  }
  line('  逐拍观测，卡在这些拍上落地：');
  for (const m of marks) line('    ' + m);
  const fresh = w.log.filter(e => e && e.lid > lid0);
  const nights = fresh.filter(e => /夜深了/.test(String(e.text || '')));
  line('  ⇒ 卡是**在补算过程中**生成的（clipTick 长在 advance10 末尾，每拍都跑），不是补算完才结算。');
  line('  ⇒ 跨过的每一个节点**各出一张**，不是只出最后一张：本窗出了 '
    + w.clips.filter(c => c.d > top0).length + ' 张（D'
    + w.clips.filter(c => c.d > top0).map(c => c.d).join('、D') + '）。');
  line('  ⇒ 但「节点」是 **04:00 的剪辑日切**（CLIP_CUT），不是「夜深了」：');
  line('    本窗「🌙 夜深了」落了 ' + nights.length + ' 轮，各在 '
    + nights.map(e => PURE.fmtTime(e.t)).join('、') + '；卡落在 '
    + marks.length + ' 个 04:00 上。两串数字在长窗口里凑巧一样多，在窗口两端却各错各的。');
}

/* ── 问 4 · 换成「只看 clipsNew」之后，死区补上了没有？会不会误弹？ ────── */
hr('问 4 · 判据换成「只看 clipsNew」之后的读数');
{
  const base = Sim.makeWorld(SEED);
  runTo(base, 100, 0);
  const SNAP = Sim.serialize(base, null);
  let both = 0, onlyNew = 0, onlyNight = 0, neither = 0;
  for (let lm = 0; lm < 1440; lm += 30) {
    for (const h of [0.5, 1, 2, 5, 8, 13, 20, 26, 40, 80]) {
      const w = Sim.hydrate(SNAP).world;
      const rd = runTo(w, 100, lm);
      const plan = Sim.catchUpPlan(w, h * 3600 * 1000);
      const r = Sim.catchUp(w, plan.ticks, rd);
      if (r.clipsNew && r.nights > 0) both++;
      else if (r.clipsNew) onlyNew++;
      else if (r.nights > 0) onlyNight++;
      else neither++;
    }
  }
  line('  两条都真（改前改后都推）        ：' + both);
  line('  只有 clipsNew（改前漏推 ⇒ 病症）：' + onlyNew + '   ← 本单要补的就是这一格');
  line('  只有 nights（跨了夜但没出卡）    ：' + onlyNight + '   ← 改后仍**不弹卡**，走「没有新卡」那一形态');
  line('  两条都假（本来就不该推）        ：' + neither);
  line('');
  line('  ⇒ 「只看 clipsNew」不会造出反向误伤：nights>0 而 clipsNew 为假的那 ' + onlyNight + ' 格，');
  line('    改后照旧不摆卡（没有卡可摆），走的是弹窗的「乙·没有新卡」形态。');
  line('    `nights>0` 这一合取项在整张表上**只做了一件事：把 ' + onlyNew + ' 格该推的判成不推**。');
}

console.log('\n（本脚本为诊断工具，判红的那份在 harness.js「第 30 单·回城弹窗」段。）');
