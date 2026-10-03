// 第 52 单 · 目标系统取证（**只读诊断**：不进 gate.yml、不判红）
//
// 量三件事：
//   ① 每人的目标轮数、达成／失败数、达成率（分目标类型）；
//   ② 「无用小事」在池子里的占比（硬口径：≥ 一半）；
//   ③ 旋钮 A/B：把 `goalKnob` 那两处加法就地抹成 0（改的是**临时副本**，不碰生产），
//      同一批种子再跑一遍，比「社交场次」与「散步次数」——证明旋钮真的在动世界，而不是写着好看。
//
// 用法：先按门禁第 1 步生成 app.js，再 `node tools/goal-audit/probe.cjs [天数]`
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.resolve(__dirname, '../..');
const DAYS = Number(process.argv[2] || 56);
const SEEDS = [20260803, 424242, 777];

function 跑(appPath) {
  delete require.cache[require.resolve(appPath)];
  const { PURE, Sim } = require(appPath);
  const r = { 轮: {}, 达成: {}, 失败: {}, 在用: {}, 人轮: {}, 进度: { 达成: [], 失败: [] }, 分类进度: {},
              社交: 0, 散步: 0, 目标数: 0, 达成数: 0, 失败数: 0 };
  for (const seed of SEEDS) {
    const w = Sim.makeWorld(seed);
    let 已读 = 0;
    const 见过的进度 = {};                       // aid|born → 最后一次看到的进度（目标一结束就被删了，只能沿路记）
    for (let i = 0; i < DAYS * 144; i++) {
      Sim.step(w, 10);
      // 当前在手的目的一眼（用于"同一时刻每人至多一条"的抽查）
      for (const ag of w.agents) {
        const g = Sim.goalOf(ag);
        r.在用[g ? g.k : '无'] = (r.在用[g ? g.k : '无'] || 0) + 1;
        if (g) 见过的进度[ag.id + '|' + g.born] = { k: g.k, n: g.n || 0, bad: g.bad || 0,
          money: Math.round(ag.money - (g.base && g.base.money || 0)), rel: (ag.relNotes | 0) - (g.base && g.base.relNotes || 0) };
      }
      for (const e of w.log) {
        if (e.lid <= 已读) continue; 已读 = e.lid;
        const t = String(e.text || '');
        const 人 = w.agents.find(a => a.id === e.agent);
        const 记进度 = (类) => {
          // 结束时目标已删，故取「这个人**最近一次出生**」的那条进度归档（只取最近一条：早先几轮的要丢掉，
          // 否则归档会混进上一轮的读数——第一版就是这么错的，两批读数区间完全重叠）
          let 最近 = null, 最近键 = null, 最近生 = -1;
          for (const kk in 见过的进度) if (kk.indexOf(e.agent + '|') === 0) {
            const 生 = Number(kk.slice(kk.indexOf('|') + 1));
            if (生 >= 最近生) { 最近生 = 生; 最近 = 见过的进度[kk]; 最近键 = kk; }
          }
          if (!最近) return;
          r.进度[类].push(最近);
          (r.分类进度[类] = r.分类进度[类] || {})[最近.k] = (r.分类进度[类][最近.k] || []).concat([最近]);
          delete 见过的进度[最近键];
        };
        if (t.indexOf('这周想的事定下了：') === 0) {
          r.目标数++;
          const label = t.slice('这周想的事定下了：'.length);
          const G = Sim.GOALS.find(x => x.label === label);
          const k = G ? G.k : '?';
          r.轮[k] = (r.轮[k] || 0) + 1;
          if (人) { const wk = 人.workKind; r.人轮[wk] = r.人轮[wk] || {}; r.人轮[wk][k] = (r.人轮[wk][k] || 0) + 1; }
        } else if (t.indexOf('这周想的事做到了：') === 0) {
          r.达成数++;
          记进度('达成');
          const label = t.slice('这周想的事做到了：'.length);
          const G = Sim.GOALS.find(x => x.label === label);
          const k = G ? G.k : '?';
          r.达成[k] = (r.达成[k] || 0) + 1;
        } else if (t.indexOf('这周想的事没做成：') === 0) {
          r.失败数++;
          记进度('失败');
          const label = t.slice('这周想的事没做成：'.length);
          const G = Sim.GOALS.find(x => x.label === label);
          const k = G ? G.k : '?';
          r.失败[k] = (r.失败[k] || 0) + 1;
        } else if (e.type === 'chat') r.社交++;
        else if (e.type === 'act' && /出门散步|周末出门逛逛|逛街市/.test(t)) r.散步++;
      }
    }
  }
  return { r, Sim };
}

const 生产 = path.join(REPO, 'app.js');
const A = 跑(生产);
console.log('种子 ' + SEEDS.join('/') + '，各 ' + DAYS + ' 天（生产写法）\n');
console.log('目标轮次 ' + A.r.目标数 + '（达成 ' + A.r.达成数 + ' ／ 失败 ' + A.r.失败数 + '，达成率 '
  + (A.r.目标数 ? (A.r.达成数 / (A.r.达成数 + A.r.失败数) * 100).toFixed(1) : '—') + '%）');
console.log('目标类型   轮次   达成   失败   达成率');
for (const G of A.Sim.GOALS) {
  const 轮 = A.r.轮[G.k] || 0, 成 = A.r.达成[G.k] || 0, 败 = A.r.失败[G.k] || 0;
  console.log('  ' + G.k.padEnd(8) + String(轮).padStart(4) + String(成).padStart(7) + String(败).padStart(7)
    + '   ' + (成 + 败 ? (成 / (成 + 败) * 100).toFixed(0) : '—') + '%'
    + '   ' + (G.useful ? '有后果' : '无用小事') + '   目标位:' + (G.knob || '—'));
}
const 无用 = A.Sim.GOALS.filter(G => !G.useful).length;
console.log('\n无用小事占比 ' + 无用 + '/' + A.Sim.GOALS.length + '（硬口径 ≥ 一半）');
console.log('\n每人拿到过哪些目标（workKind × 目标键）');
console.log('       ' + A.Sim.GOALS.map(G => G.k.padStart(8)).join(''));
for (const wk of Object.keys(A.r.人轮)) {
  console.log('  ' + wk.padEnd(6) + A.Sim.GOALS.map(G => String((A.r.人轮[wk] || {})[G.k] || 0).padStart(8)).join(''));
}
const 统计 = a => { if (!a.length) return '—'; const n = a.map(x => x.n).sort((x, y) => x - y);
  return 'n 中位 ' + n[Math.floor(n.length / 2)] + '（' + n[0] + '–' + n[n.length - 1] + '）· 钱中位 '
    + a.map(x => x.money).sort((x, y) => x - y)[Math.floor(a.length / 2)] + ' · 关系中位 '
    + a.map(x => x.rel).sort((x, y) => x - y)[Math.floor(a.length / 2)]; };
console.log('\n结束时的进度（用来定标：目标该设在"多数够得着、少数够不着"的位置）');
console.log('  达成那批：' + 统计(A.r.进度.达成));
console.log('  失败那批：' + 统计(A.r.进度.失败));
// 逐目标印**该目标自己的那把尺**（thrift 看 n＝外食顿数、greet 看 rel＝新增关系、steady 看 bad＝见底次数）
console.log('\n逐目标定标（各看各的尺）：');
for (const G of A.Sim.GOALS) {
  const 取 = (批) => (A.r.分类进度[批] && A.r.分类进度[批][G.k]) || [];
  const 值 = (arr, f) => { const b = arr.map(f).sort((x, y) => x - y); return b.length ? (b[0] + '／' + b[Math.floor(b.length / 2)] + '／' + b[b.length - 1]) : '—'; };
  const f = G.k === 'greet' ? (x => x.rel) : (x => x.n);
  const 尺 = G.k === 'greet' ? '新增关系' : (G.k === 'steady' ? '熬夜晚数' : (G.k === 'thrift' ? '在外吃顿数' : '计时拍'));
  console.log('  ' + G.k.padEnd(8) + '阈值 ' + String(A.Sim.GOAL_TARGETS[G.k]).padStart(4)
    + '  ' + 尺 + '：达成批 ' + 值(取('达成'), f) + '　失败批 ' + 值(取('失败'), f) + '（最小／中位／最大）');
}

/* —— 旋钮 A/B（配对设计）——
   为什么要配对：抹掉旋钮会让**整条世界轨迹**都变（决策不同 ⇒ 后面每拍都不同），
   拿总量比等于拿两个不同的世界比，噪声比效应大（第一版实测：差 −12，方向都是反的）。
   故这里改成：**给同一个人硬挂同一条目标**、同一批种子跑两遍（生产 vs 无旋钮副本），
   只数**那个人自己**的对应行为，逐种子配对后看方向与幅度。 */
const src = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const m = src.match(/<script>([\s\S]*)<\/script>/);
const 裸 = m[1].replace(/\+goalKnob\(ag,'social'\)/, '+0').replace(/\+goalKnob\(ag,'out'\)/, '+0')
              .replace(/-goalKnob\(ag,'sleep'\)/, '-0');
if (裸 === m[1]) { console.log('\n[跳过 A/B] 没找到旋钮调用点（源码形态变了）'); process.exit(0); }
const 临时 = path.join(os.tmpdir(), 'citylife-goal-无旋钮-' + Date.now() + '.cjs');
fs.writeFileSync(临时, 裸);

function 配对(appPath, 目标键, 天数) {
  delete require.cache[require.resolve(appPath)];
  const { PURE, Sim } = require(appPath);
  const 种子 = []; for (let i = 0; i < 8; i++) 种子.push(20260803 + i * 7919);
  Sim.GOAL_TARGETS[目标键] = 1e9;                     // 让这条目标**整段不达成**，旋钮全程有效
  let 社交 = 0, 散步 = 0, 熬夜 = 0;
  for (const seed of 种子) {
    const w = Sim.makeWorld(seed);
    const 我 = w.agents[0];                            // a1＝顾云帆（旋钮与目标挂在同一个人身上）
    我.goal = { k: 目标键, born: 0, until: 1e9, n: 0, bad: 0, wasStroll: false, base: { money: 0, relNotes: 0 } };
    我.flags.goalNext = 1e9;
    let 已读 = 0;
    let 昨晚睡 = false;
    for (let i = 0; i < 天数 * 144; i++) {
      Sim.step(w, 10);
      const 睡 = (我.activity && 我.activity.type === 'sleep');
      if (睡 && !昨晚睡 && 我.rest && 我.rest.bed > 0) {
        const m = PURE.minuteOfDay(我.rest.bed);
        if (m >= 60 && m < 5 * 60) 熬夜++;
      }
      昨晚睡 = 睡;
      for (const e of w.log) {
        if (e.lid <= 已读) continue; 已读 = e.lid;
        if (e.agent !== 我.id) continue;
        if (e.type === 'chat' && !e.with) continue;
        if (e.type === 'chat' && String(e.text || '').indexOf('和') === 0) 社交++;
        if (e.type === 'act' && /出门散步|周末出门逛逛|逛街市/.test(String(e.text || ''))) 散步++;
      }
    }
  }
  return { 社交, 散步, 熬夜 };
}
console.log('\n旋钮 A/B（配对：给 a1 硬挂同一条目标，8 颗种子 × 30 天，只数 a1 自己）');
for (const [键, 名, 字段] of [['greet', '多认识人（旋钮 social）', '社交'], ['sky', '出门看天（旋钮 out）', '散步'],
                              ['steady', '别熬到后半夜（旋钮 sleep）', '熬夜']]) {
  const 有 = 配对(生产, 键, 30), 无 = 配对(临时, 键, 30);
  console.log('  ' + 名 + '：' + 字段 + ' 有旋钮 ' + 有[字段] + ' ／ 无旋钮 ' + 无[字段]
    + '（' + (有[字段] - 无[字段] >= 0 ? '+' : '') + (有[字段] - 无[字段])
    + '，' + (无[字段] ? ((有[字段] / 无[字段] - 1) * 100).toFixed(1) : '—') + '%）');
}
fs.unlinkSync(临时);
