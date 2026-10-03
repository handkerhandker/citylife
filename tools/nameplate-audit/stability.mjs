// 名牌分道稳定性探针（真浏览器；只读诊断。第 125 单立；第 149 单升级）——
//   旧判据只抓「瞬跳」＋「同行压字」，且压字口径只看 x，也从不拦「站定者被路过的人牵连升道」。
//   升级后量三件事（同 seed・江灯节 19:30 场景，600 样本 @50ms ≈ 30 秒）：
//   ① **同道盒相交 = 0**：同一条道上的两块名牌**二维盒**（x±w/2 × 顶..顶+盒高）不得相交
//      —— 沿用第 32 单「名字不许叠」的老红线，口径修正为真二维（旧口径只看 x，会把 y 隔一整行
//      的人也算成压字，第 149 单实测 91.6% 的假对即出自这里）。
//      「跨道过渡叠」（两人已判定分道、浮道缓动尚未到位的路上盒子相交）另列参考读数、不判——
//      第 149 单实测改前 59 帧／改后 65 帧（同 seed 同场景），是浮道缓动的固有滞后，
//      不是本单引入；治它要动「滑动速度换清晰的平衡」，登记为下一单候选；
//   ② **站定升道 = 0**：连续站定 ≥30 个样本（约 1.8 秒）的人，道号只许回落不许升
//      （升＝被旁人牵连，就是决策者说的「站着没动、名字自己往上跳」）；回落＝归位，不算；
//   ③ **每 50ms 视觉位移 ≤0.6 道**（沿第 125 单旧判据，防瞬跳）＋零 pageerror。
// 用法：node tools/nameplate-audit/stability.mjs [输出目录]        （要 CITYLIFE_CHROME）
//   对照跑旧版：node tools/nameplate-audit/stability.mjs [输出目录] --改前=<git-ref>
//   （旧版应报出「站定升道 >0」＝本探针抓得住旧病；正式版应全零）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'nameplate-stability'));
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
fs.mkdirSync(OUT, { recursive: true });

const raw = BEFORE
  ? execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:city-life-framework.html`], { maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
/* 给 nameChip 的落账补两个字段（只改探针内存里的 HTML，产品文件不动）：最终盒顶与盒高——
   真二维相交判据要的就是这两个。 */
let html = raw.replace('const 顶=y-高+1-浮*道距;',
  'const 顶=y-高+1-浮*道距; if(nameChipBoxes.length){ nameChipBoxes[nameChipBoxes.length-1].顶=顶; nameChipBoxes[nameChipBoxes.length-1].盒高=高; }');
if (html === raw) { console.error('「顶」注入点没找到'); process.exit(2); }
html = html.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get chips(){return nameChipBoxes},get vis(){return state.vis},get sx(){return sx},get sy(){return sy},get gap(){return NAME_CHIP_GAP},get lane(){return 名牌道},get laneF(){return 名牌浮道}};\n})();\n</script>');

const SEED = 20261004;                     // 与第 149 单取证同一颗种子：同场景可复核对账
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
page.on('pageerror', e => 错.push('pageerror: ' + ((e && e.message) || e)));
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html?seed=${SEED}`, { waitUntil: 'load' });
await page.waitForTimeout(1800);
await page.evaluate(() => { const st = __pv.state; st.world.t = 64530; st.llm.on = false; st.world.weather.rain = false; });   // D45·江灯节 19:30
await page.waitForTimeout(400);
const 采样 = [];
for (let i = 0; i < 600; i++) {
  采样.push(await page.evaluate(() => ({
    t: __pv.state.world.t,
    agents: __pv.state.world.agents.map(ag => {
      const v = __pv.vis[ag.id];
      return {
        id: ag.id, mv: !!v.moving,
        lane: (typeof __pv.lane[ag.id] === 'number') ? __pv.lane[ag.id] : null,
        laneF: (typeof __pv.laneF[ag.id] === 'number') ? __pv.laneF[ag.id] : null,
      };
    }),
    chips: (__pv.chips || []).map(b => ({
      x: b.x, w: b.w, lane: b.lane,
      顶: (typeof b.顶 === 'number') ? b.顶 : null, 高: (typeof b.盒高 === 'number') ? b.盒高 : null,
    })),
  })));
  await page.waitForTimeout(50);
}
await ctx.close(); await browser.close(); srv.close();

// ① 分道失败（同道盒相交，判）＋ 跨道过渡叠（参考读数，不判）＋ 旧口径（参考读数）
let 同道真叠 = 0, 过渡叠 = 0, 参考同层x相交 = 0;
for (const s of 采样) {
  const bs = s.chips.filter(c => c.顶 !== null && c.高 !== null);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    if ((a.x - a.w / 2) < (b.x + b.w / 2) && (b.x - b.w / 2) < (a.x + a.w / 2)
      && a.顶 < (b.顶 + b.高) && b.顶 < (a.顶 + a.高)) {
      if (a.lane === b.lane) 同道真叠++; else 过渡叠++;
    }
    if (a.lane === b.lane && Math.abs(a.x - b.x) < (a.w + b.w) / 2) 参考同层x相交++;
  }
}
// ② 站定升道 ＋ ③ 每 50ms 位移
const 序 = {};
let 最大位移 = 0, 超半道 = 0;
for (const s of 采样) for (const a of s.agents) {
  const st = 序[a.id] || (序[a.id] = { run: 0, lane: null, f: null, 升: [] });
  if (a.mv) st.run = 0;
  else {
    st.run++;
    if (st.lane !== null && a.lane !== null && a.lane > st.lane && st.run >= 30)
      st.升.push({ t: s.t, from: st.lane, to: a.lane, 连续站定样本: st.run });
  }
  st.lane = a.lane;
  if (typeof a.laneF === 'number') {
    if (st.f !== null) { const dv = Math.abs(a.laneF - st.f); if (dv > 最大位移) 最大位移 = dv; if (dv > 0.5) 超半道++; }
    st.f = a.laneF;
  } else st.f = null;
}
const 站定升道 = [].concat(...Object.entries(序).map(([id, v]) => v.升.map(x => ({ id, ...x }))));
const 结论 = {
  同道盒相交违规: 同道真叠,
  过渡叠_参考不计判: 过渡叠,
  参考_同层x相交: 参考同层x相交,
  站定升道人次: 站定升道.length,
  站定升道明细: 站定升道.slice(0, 20),
  每50ms最大位移道: Math.round(最大位移 * 1000) / 1000,
  超半道样本: 超半道,
  采样帧: 采样.length,
  错误: 错,
};
结论.通过 = (同道真叠 === 0 && 站定升道.length === 0 && 最大位移 <= 0.6 && 错.length === 0);
fs.writeFileSync(path.join(OUT, 'raw-sample.json'), JSON.stringify(采样), 'utf8');
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
console.log((结论.通过 ? '✔' : '✘') + ' 名牌分道稳定性：' + JSON.stringify(结论));
process.exit(结论.通过 ? 0 : 1);
