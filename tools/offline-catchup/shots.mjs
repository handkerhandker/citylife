// 第 26 单·离线追帧实机取证：在**真浏览器**里造一份「上次关页在 N 分钟前」的存档，
// 开页，看城市有没有自己往前走、剪辑页有没有被推到眼前、横幅写了什么、AI 调用是不是 0。
//
// 保真度要点（照第 25 单 pageswitch_shots.mjs 的口径）：
//   ① 存档是**生产的 Sim.serialize 自己吐出来的**（先开一趟页把世界跑起来，走生产的落盘路径写盘再取出），
//      不是脚本手捏的 JSON；
//   ② 「离开了多久」只靠改存档 meta.at 这一个数来造，**页面代码一行没动**；
//   ③ 改过的存档用 addInitScript 在**新开的浏览器上下文**里先于页面脚本写进 localStorage —— 必须如此：
//      同一个页面上 goto 会触发旧页的 pagehide，而生产代码在 pagehide 里 saveNow()，
//      会把刚改好的 meta.at 原地盖回「此刻」，取证前提当场失效（首次编写时实测踩中）；
//   ④ 补算发生在页面自己的开机路径里，脚本只在之后读结果：读的是生产行为，不是脚本模拟；
//   ⑤ AI 调用数一读生产的「设置·AI」统计行，二用路由拦截独立数一遍出网请求，两边对账。
//
// 用法：CITYLIFE_CHROME=/opt/pw-browsers/chromium node tools/offline-catchup/shots.mjs <输出目录>
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const OUT = process.argv[2] || path.resolve('docs/交付/第26单-图');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PORT = 18926;
const MIME = {'.html':'text/html;charset=utf-8', '.png':'image/png', '.js':'text/javascript', '.json':'application/json'};

const srv = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'});
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => srv.listen(PORT, r));
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;
fs.mkdirSync(OUT, {recursive: true});

// 沙箱里 playwright 自带的 chromium 与预置浏览器版本号不一定对得上，故允许用环境变量指路。
const exe = process.env.CITYLIFE_CHROME || '';
const browser = await chromium.launch(exe ? {executablePath: exe} : {});

function guard(ctx, counter) {   // 站内资源放行，其余一律记账并拦掉（独立于页面自己的统计）
  return ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(`http://127.0.0.1:${PORT}/`)) return route.continue();
    counter.n++; counter.urls.push(u); return route.abort();
  });
}
const read = page => page.evaluate(() => {
  const scr = [...document.querySelectorAll('.screen')].find(s => s.classList.contains('active'));
  const bk = document.querySelector('#clip-back');
  const save = JSON.parse(localStorage.getItem('citylife-save-v1') || 'null');
  return {
    screen: scr ? scr.id : '(无)',
    bannerShown: bk ? !bk.hidden : false,
    banner: bk ? bk.textContent : '',
    clipCards: document.querySelectorAll('#clip-list .clip').length,
    llmStat: (document.querySelector('#set-llm-stat') || {}).textContent || '',
    // 世界当前时刻直接读生产顶栏（localStorage 里那份要等 15 秒自动落盘才会更新，读它会读到旧值）
    clock: ((document.querySelector('#tb-day') || {}).textContent || '') + ' ' + ((document.querySelector('#tb-clock') || {}).textContent || ''),
    saveLine: (document.querySelector('#sv-stat') || {}).textContent || '',
    seed: (document.querySelector('#set-seed') || {}).textContent || '',
    logN: document.querySelectorAll('#log-list li').length,
    logTail: [...document.querySelectorAll('#log-list li')].slice(-4).map(li => li.textContent),
    diaryN: [...document.querySelectorAll('#log-list li.diary')].length,
    sparkleN: [...document.querySelectorAll('#log-list li')].filter(li => li.textContent.indexOf('✨') >= 0).length,
    t: save && save.world ? save.world.t : null,
    bak: !!localStorage.getItem('citylife-save-v1-bak'),
  };
});

// ── 造基准存档：让生产代码自己开城、自己跑、自己落盘，再把那份存档取出来 ──
// 两份基准，为的是把「跨没跨过夜深了」这条判据的两侧都照到：
//   A＝开城就走（世界停在 D1 08:00 早上）  B＝玩到夜里才走（走生产的 2× 快进推到 21:00 前后）
async function makeBase(waitMs, doubleSpeed, label) {
  const cnt = {n: 0, urls: []};
  const ctx = await browser.newContext({viewport: {width: 900, height: 1250}});
  await guard(ctx, cnt);
  const page = await ctx.newPage();
  await page.goto(URL_);
  if (doubleSpeed) await page.click('#tb-speed');            // 走生产的速度按钮，不改内部状态
  await page.evaluate(ms => new Promise(r => setTimeout(r, ms)), waitMs);
  // 走生产既有的落盘路径（页面隐藏即 saveNow），不额外造一条
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {get: () => 'hidden', configurable: true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const raw = await page.evaluate(() => localStorage.getItem('citylife-save-v1'));
  if (!raw) throw new Error('基准存档没落盘，取证前提不成立');
  const info = await read(page);
  await ctx.close();
  console.log(`基准 ${label}：${info.clock}（${JSON.parse(raw).world.t} 分）· seed ${info.seed} · 出网 ${cnt.n} 次${cnt.urls.length ? ' ' + JSON.stringify(cnt.urls) : ''}`);
  return raw;
}
const BASE_A = await makeBase(900, false, 'A 早上离开');
const BASE_B = await makeBase(40000, true, 'B 夜里离开');

// ── 逐档：把 meta.at 往前拨 N 真实分钟，新上下文里开页 ──
async function trip(SAVE, awayMin, tag) {
  const cnt = {n: 0, urls: []};
  const ctx = await browser.newContext({viewport: {width: 900, height: 1250}});
  await guard(ctx, cnt);
  const doctored = (() => { const d = JSON.parse(SAVE); d.meta.at = Date.now() - awayMin * 60000; return JSON.stringify(d); })();
  await ctx.addInitScript(s => { try { localStorage.setItem('citylife-save-v1', s); } catch (_) {} }, doctored);
  const page = await ctx.newPage();
  await page.goto(URL_);
  await page.evaluate(() => new Promise(r => setTimeout(r, 700)));
  const after = await read(page);
  await page.screenshot({path: path.join(OUT, tag + '.png')});
  await ctx.close();
  return {awayMin, tag, before: JSON.parse(SAVE).world.t, after, netHits: cnt.n, netUrls: cnt.urls};
}

const CASES = [
  [BASE_A, 3,     'A-away-03min'],   // 不足一拍：什么都不该发生
  [BASE_A, 60,    'A-away-60min'],   // 一小时：推 6 拍，未跨夜 ⇒ 不打扰
  [BASE_A, 600,   'A-away-10h'],     // 早上走、10 小时后回：到 18:00，仍未跨夜 ⇒ 不打扰
  [BASE_B, 600,   'B-away-10h'],     // 夜里走、10 小时后回：跨过夜深了 ⇒ 推剪辑页（与上一档只差出发时刻）
  [BASE_B, 60,    'B-away-60min'],   // 边界：跨过夜深了(21:50)但没跨过剪辑结算点(04:00) ⇒ 推了剪辑页却没有新卡
  [BASE_A, 4320,  'A-away-3d'],      // 3 天：恰好到封顶线而不触顶
  [BASE_A, 14400, 'A-away-10d'],     // 10 天：触封顶，须如实告知跳过了多少
];
const rows = [];
for (const [SAVE, away, tag] of CASES) {
  const r = await trip(SAVE, away, tag);
  rows.push(r);
  console.log(`\n【离开 ${away} 分钟】${tag}`);
  console.log(`  世界推进：D${Math.floor(r.before/1440)+1} ${String(Math.floor(r.before%1440/60)).padStart(2,'0')}:${String(r.before%60).padStart(2,'0')} → ${r.after.clock}　（seed ${r.after.seed}，坏档备份 ${r.after.bak ? '有' : '无'}）`);
  console.log(`  开机落在：${r.after.screen}　横幅：${r.after.bannerShown ? '出' : '不出'}　剪辑卡 ${r.after.clipCards} 张`);
  if (r.after.banner) console.log(`  横幅原文：${r.after.banner}`);
  console.log(`  AI：设置页「${r.after.llmStat}」　·　脚本独立计数出网 ${r.netHits} 次${r.netUrls.length ? ' ' + JSON.stringify(r.netUrls) : ''}　·　日志墙 ✨ 条目 ${r.after.sparkleN} 条`);
  console.log(`  日志墙 ${r.after.logN} 条（其中日记 ${r.after.diaryN} 条）　存档行「${r.after.saveLine}」`);
  console.log(`  日志墙末四条：`); for (const l of r.after.logTail) console.log(`    ${l}`);
}

fs.writeFileSync(path.join(OUT, '读数.json'), JSON.stringify(rows, null, 2));
console.log(`\n读数与截图已写入 ${OUT}`);
await browser.close();
srv.close();
