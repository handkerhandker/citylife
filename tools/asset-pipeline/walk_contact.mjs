// 第 20 单·前后对照拼版：把 walk_shots.mjs 逐帧截下的画面拼成一张可读的对照图，
// 每帧标注实测显示坐标，帧间标注单帧位移 —— 「瞬移」这件事要让人一眼看见数值，不能只看图猜。
// 用法: node walk_contact.mjs <图目录>
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const DIR = process.argv[2] || 'docs/交付/第20单-图';
const rd = t => JSON.parse(fs.readFileSync(path.join(DIR, `${t}-读数.json`), 'utf8'));
const B = rd('before'), A = rd('after');
const b64 = f => 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64');
const has = f => fs.existsSync(path.join(DIR, f));

const CSS = `
*{box-sizing:border-box;margin:0}
body{background:#11151d;color:#dde3ee;font:14px/1.5 "Noto Sans CJK SC","Source Han Sans SC",sans-serif;margin:0}
#sheet{padding:22px;width:max-content}
h1{font-size:20px;margin-bottom:4px;color:#ece5d0}
.sub{color:#93a0b5;font-size:13px;margin-bottom:18px;max-width:1100px}
.band{margin-bottom:20px}
.tag{display:inline-block;font-size:13px;font-weight:700;padding:3px 10px;border-radius:4px;margin-bottom:8px}
.bad{background:#5a2733;color:#ffc9d2}.good{background:#1f4634;color:#b8f0d0}
.row{display:flex;align-items:flex-start;gap:0}
.cell{text-align:center}
.cell img{display:block;border:1px solid #2c3546;border-radius:3px}
.cap{font-size:11px;color:#93a0b5;margin-top:5px;font-variant-numeric:tabular-nums}
.cap b{color:#dde3ee;font-weight:600}
.gap{align-self:center;padding:0 7px;font-size:11px;text-align:center;font-variant-numeric:tabular-nums;color:#7d8ba1;white-space:nowrap}
.gap .jump{color:#ff8fa3;font-weight:700}
.gap .ok{color:#7fd6a6}
.note{color:#93a0b5;font-size:12px;margin-top:7px}
`;
const dist = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);

function strip(rec, prefix, w, capLabel, stride) {
  const frames = rec.out.map((o, i) => ({ o, f: `${prefix}-f${String(i).padStart(2, '0')}.png` })).filter(x => has(x.f));
  const span = stride || 1;
  const budget = 5.5 / 60 * span;                    // 该帧距内「靠腿走」最多能走多远＝行走速率×帧数
  let h = '<div class="row">';
  frames.forEach((x, i) => {
    if (i) {
      const d = dist(frames[i - 1].o, x.o);
      const jump = d > budget * 1.08;                // 超过腿力上限＝这一段里有跳变
      h += `<div class="gap">Δ${span > 1 ? `(${span}帧)` : ''}<br><span class="${jump ? 'jump' : 'ok'}">${d.toFixed(2)}</span><br>格`
        + `<br><span style="color:#5d6b80">上限${budget.toFixed(2)}</span></div>`;
    }
    h += `<div class="cell"><img src="${b64(x.f)}" style="width:${w}px">`
      + `<div class="cap"><b>${capLabel}${x.o.f}</b><br>(${x.o.x.toFixed(2)}, ${x.o.y.toFixed(2)})</div></div>`;
  });
  return h + '</div>';
}

function page(title, sub, bands) {
  return `<style>${CSS}</style><div id="sheet"><h1>${title}</h1><div class="sub">${sub}</div>` + bands.join('') + '</div>';
}
function band(cls, tag, body, note) {
  return `<div class="band"><span class="tag ${cls}">${tag}</span>${body}`
    + (note ? `<div class="note">${note}</div>` : '') + '</div>';
}

const JOBS = [
  { out: '对照-病症一-家具遮挡.png',
    title: '病症一 · 家具遮挡人物（餐桌左席）',
    sub: '四位住户同处 home_table。左席站位的精灵包围盒与餐桌绘制矩形 x[2.604,4.979] y[8.500,10.813] 相交，'
       + '而站位脚底 y=10.0 小于餐桌脚底 y=10.813 —— 按脚底 y 排序时餐桌后画，于是把人盖住。'
       + '深度排序本身是好的（其余 7 处相交站位都正确画在家具之前），错的是选点：左席被选在了餐桌的「身后」。',
    pair: ['before-sym1-home_table.png', 'after-sym1-home_table.png'], w: 470,
    noteB: '改前：沈小满（左）身体下半被桌面盖掉，包围盒 29.7% 被覆盖。',
    noteA: '改后：站位由 [-3,0] 下压至 [-3,1.5]，脚底 y=11.5 > 10.813，人画在桌之前，全身可见。' },
  { out: '对照-病症二-厨房就位.png', key: 'sym2', prefix: 'sym2-kitchen-arrive', w: 260,
    title: '病症二 · 瞬移：厨房就位（连续帧）',
    sub: '白一鸣走到 kitchen。改前：走到锚点、v.path 清空的那一帧，渲染期把 [4.5,1] 的站位偏移整个贴上，'
       + '位移 4.61 格 > 平滑器「>3 格即直置」的旁路阈值，于是一帧到位 —— 这就是决策者说的瞬移。'
       + '改后：站位是寻路的真终点，人一路走过去，逐帧位移恒等于行走速率。',
    noteB: '改前：f101→f102 一帧位移 <b>4.61 格</b>（14.10,9.51 → 18.60,10.50）。',
    noteA: '改后：全程峰值单帧位移 <b>0.092 格</b>＝5.5 格/秒 ÷ 60 帧，一步不多走。' },
  { out: '对照-病症二-上座.png', key: 'sym2b', prefix: 'sym2-table-arrive', w: 260,
    title: '病症二 · 瞬移：上座（连续帧）',
    sub: '沈小满走到 home_table 左席。改前同理：落位那一帧把 [-3,0] 贴上，'
       + '再加上本帧行走的一小段，合计刚好越过 3 格旁路，一帧横移到位。',
    noteB: '改前：f188→f189 一帧位移 <b>3.07 格</b>（5.57,9.51 → 2.50,9.50）。',
    noteA: '改后：全程峰值单帧位移 <b>0.092 格</b>。' },
  { out: '对照-病症三-离座穿桌.png', key: 'sym3', prefix: 'sym3-table-leave', w: 200, stride: 5,
    title: '病症三 · 离座直线穿过餐桌（连续帧，每 5 帧取一张）',
    sub: '沈小满离开餐桌去沙发。这一段起讫同在客厅，buildPath 只给一根直线，'
       + '而这根直线的脚底轨迹正压过餐桌实体格（3,8 / 4,8 / 4,9 / 5,9）。'
       + '注意此病症与站位偏移无关 —— 把偏移整个关掉照样发生，是第 19 单之前就有的老账（对照读数见交付件二.3）。',
    noteB: '改前：f0 起步先瞬移回锚点中心，随后自 (4.36,9.11)→(4.57,8.49) 一路压过桌面。',
    noteA: '改后：走线自己绕开实体格，沿餐桌西侧上行（x 恒在 1.5–2.5），全程零穿实体；起步亦无跳变。' },
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const pg = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
for (const j of JOBS) {
  let bands;
  if (j.pair) {
    bands = [
      band('bad', '改前 · v30（origin/main）', `<div class="row"><div class="cell"><img src="${b64(j.pair[0])}" style="width:${j.w}px"></div></div>`, j.noteB),
      band('good', '改后 · 本单', `<div class="row"><div class="cell"><img src="${b64(j.pair[1])}" style="width:${j.w}px"></div></div>`, j.noteA),
    ];
  } else {
    bands = [
      band('bad', '改前 · v30（origin/main）', strip(B[j.key], `before-${j.prefix}`, j.w, '帧 ', j.stride), j.noteB),
      band('good', '改后 · 本单', strip(A[j.key], `after-${j.prefix}`, j.w, '帧 ', j.stride), j.noteA),
    ];
  }
  await pg.setContent(page(j.title, j.sub, bands));
  await pg.waitForTimeout(180);
  const el = await pg.$('#sheet');
  await el.screenshot({ path: path.join(DIR, j.out) });
  console.log(j.out);
}
await browser.close();
process.exit(0);
