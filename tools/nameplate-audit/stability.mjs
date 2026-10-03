// 第 125 单·名牌分道稳定性探针（真浏览器；只读诊断，进冒烟档 2）
//
// 量什么：8 秒 × 160 帧（每 50ms）采样名牌登记表与各人显示位，判据——
//   ① **同层重叠违规 = 0**：同一道上两块名牌的横向范围不得相交（字压字是硬红线）；
//   ② **换道不许瞬移**：把"道号×盒高"折算成视觉位移，任意相邻两帧位移 ≤0.6 道（改前实测最大 2.0 道）；
//   ③ 全程零 pageerror。
// 说明：本工具只断言"不跳、不压字"，不断言"换道次数"——真人在屋里走动时换道本身是合理的。
// 用法：node tools/nameplate-audit/stability.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'nameplate-stability'));
fs.mkdirSync(OUT, { recursive: true });

const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get chips(){return nameChipBoxes},get vis(){return state.vis},get sx(){return sx},get sy(){return sy},get gap(){return NAME_CHIP_GAP},get laneF(){return 名牌浮道},get boxH(){return 名盒高()}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18945;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push('pageerror: ' + (e && e.message || e)));
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const 采样 = [];
for (let i = 0; i < 160; i++) {
  采样.push(await page.evaluate(() => ({
    chips: (window.__pv.chips || []).map(b => ({ x: b.x, w: b.w, lane: b.lane })),
    vis: Object.entries(window.__pv.vis || {}).map(([id, v]) => ({ id, px: window.__pv.sx(v.dspX) })),
    laneF: Object.assign({}, window.__pv.laneF || {}),
  })));
  await page.waitForTimeout(50);
}
await ctx.close(); await browser.close(); srv.close();

let 重叠 = 0;
for (const s of 采样) for (let i = 0; i < s.chips.length; i++) for (let j = i + 1; j < s.chips.length; j++) {
  const a = s.chips[i], b = s.chips[j];
  if (a.lane === b.lane && Math.abs(a.x - b.x) < (a.w + b.w) / 2) 重叠++;
}
const 道序 = {};
for (const s of 采样) for (const v of s.vis) (道序[v.id] = 道序[v.id] || []).push(s.laneF[v.id]);
let 最大位移 = 0, 超半道 = 0;
for (const id of Object.keys(道序)) {
  const seq = 道序[id];
  for (let i = 1; i < seq.length; i++) {
    if (typeof seq[i] !== 'number' || typeof seq[i - 1] !== 'number') continue;
    const dv = Math.abs(seq[i] - seq[i - 1]);
    if (dv > 最大位移) 最大位移 = dv;
    if (dv > 0.5) 超半道++;
  }
}
const 结论 = { 同层重叠违规: 重叠, 每50ms最大位移道: Math.round(最大位移 * 1000) / 1000, 超半道样本: 超半道, 错误: 错 };
结论.通过 = (重叠 === 0 && 最大位移 <= 0.6 && 超半道 === 0 && 错.length === 0);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
console.log((结论.通过 ? '✔' : '✘') + ' 名牌分道稳定性：' + JSON.stringify(结论));
process.exit(结论.通过 ? 0 : 1);
