// 第 25 单·切页取证拼版：把 pageswitch_shots.mjs 出的两串连续帧拼成前后对照的一张图。
//
// 为什么另起一支而不并进 pageswitch_shots.mjs：那支一次只跑一份源码（before 或 after），
// 而对照拼版要同时拿到两串。故分两步：先各跑一次出帧，再由本支拼版。
//
// 拼版走浏览器排版后整页截图（不依赖 Pillow，且中文标注由 Chromium 直接渲染）。
// 用法: node pageswitch_sheet.mjs <图目录>
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const DIR = process.argv[2] || 'docs/交付/第25单-图';
const read = t => JSON.parse(fs.readFileSync(path.join(DIR, `${t}-读数.json`), 'utf8'));
const B = read('before'), A = read('after');
const b64 = f => 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64');

const N = B.连续帧.length, STRIDE = B.stride;
const cell = (tag, view, k, d) => {
  const p = d.连续帧[k].d.a2;
  return `<figure><img src="${b64(`${tag}-p1-切回-${view}f${String(k).padStart(2,'0')}.png`)}">
  <figcaption><b>第 ${k*STRIDE} 帧</b>　沈小满 显示(${p.x.toFixed(1)},${p.y.toFixed(1)})　真实(${p.px.toFixed(1)},${p.py.toFixed(1)})
  　<span class="${Math.hypot(p.px-p.x,p.py-p.y)>0.01?'bad':'good'}">差 ${Math.hypot(p.px-p.x,p.py-p.y).toFixed(2)} 格</span></figcaption></figure>`;
};
const strip = (tag, view, d, title, sub) => `
<section><h2>${title}</h2><p class="sub">${sub}</p>
<div class="grid">${Array.from({length:N},(_,k)=>cell(tag,view,k,d)).join('')}</div></section>`;

const page_html = `<style>
  body{background:#0d1017;color:#e8eaf0;font:14px/1.5 system-ui,"Noto Sans CJK SC",sans-serif;margin:0;padding:24px}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:17px;margin:26px 0 2px}
  .lede{color:#9aa4bb;margin:0 0 8px;max-width:none}
  .sub{color:#9aa4bb;margin:0 0 10px;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  figure{margin:0;background:#141824;border:1px solid #262c3b;border-radius:6px;overflow:hidden}
  img{width:100%;display:block}
  figcaption{font-size:11px;padding:5px 7px;color:#c3c9d8;border-top:1px solid #262c3b}
  .bad{color:#ff8a8a;font-weight:700} .good{color:#7fd88f;font-weight:700}
  b{color:#d9b96c}
</style>
<h1>第 25 单 · 切页返回后人物直线飞越：前后对照连续帧</h1>
<p class="lede">时序（两串逐帧严格对齐，同一份手动驱动）：四人在公寓 → 全部出门去远处 → 看 1 秒 →
切到「日志」页停 ${(B.stallFrames/60).toFixed(1)} 秒 → 切回「现场」，此后每 ${STRIDE} 帧截一张，共 ${N} 张。
标注取 <b>沈小满（a2）</b>：她从卧室出发去滨江公园，路线最长，飞越也最显眼。
「差」＝显示位与真实位之距，治前该值须靠一段直线补掉，治后恒为 0。</p>
${strip('before','', B, '一 · 治前（origin/main）：四人从离开那一刻的旧位置沿直线飞向真实位',
  '看沈小满：显示位从公寓卧室一路斜插到街面，不走门、不沿路——这正是决策者实测到的「飞越」。真实位（括号内第二组）早已在公园小径上。')}
${strip('after','', A, '二 · 治后（本单）：切回时人本来就在该在的地方，照常走路',
  '显示位与真实位逐帧完全重合，差恒为 0。没有跳变、没有补间、没有假动画——因为显示位压根没落后过。')}
${strip('before','公寓-', B, '三 · 治前·公寓特写：直线穿墙穿家具的硬红线违反',
  '同一串帧的公寓取景。沈小满的显示位逐帧压在客厅／卧室之间的墙体上，脚底格落进 PIX_SOLID 实体格——门禁规矩二判违规。')}
`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1.5 });
await page.setContent(page_html);
await page.waitForLoadState('networkidle');
const out = path.join(DIR, '图一-切页返回前后对照连续帧.png');
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('拼版完成 →', out, (fs.statSync(out).size/1024).toFixed(0)+'KB');
process.exit(0);
