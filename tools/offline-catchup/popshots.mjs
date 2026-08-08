// 第 30 单·回城弹窗实机取证：在**真浏览器**里造一份「上次关页在 N 分钟前」的存档，
// 开页，看弹窗弹没弹、弹的是哪一形态、里面逐字写了什么、AI 调用是不是 0。
//
// 保真度要点全部沿用第 26 单 shots.mjs 的口径（同目录，逐条同源）：
//   ① 存档是**生产的 Sim.serialize 自己吐出来的**（先开一趟页把世界跑起来，走生产的落盘路径写盘再取出）；
//   ② 「离开了多久」只靠改存档 meta.at 这一个数来造，**页面代码一行没动**；
//   ③ 改过的存档用 addInitScript 在**新开的浏览器上下文**里先于页面脚本写进 localStorage
//      （同一个页面上 goto 会触发旧页 pagehide → saveNow()，把 meta.at 原地盖回「此刻」）；
//   ④ 弹窗由页面自己的开机路径造出来，脚本只在之后读结果；
//   ⑤ AI 调用数一读生产的「设置·AI」统计行，二用路由拦截独立数一遍出网请求，两边对账。
//
// 用法：CITYLIFE_CHROME=/opt/pw-browsers/chromium node tools/offline-catchup/popshots.mjs <输出目录>
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const OUT = process.argv[2] || path.resolve('docs/交付/第30单-图');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PORT = 18930;
const MIME = {'.html':'text/html;charset=utf-8', '.png':'image/png', '.js':'text/javascript', '.json':'application/json'};

const srv = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'});
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => srv.listen(PORT, r));
/* 不走 `?seed=`：页面对带 seed 参数的会话是**刻意不写档**的（ephemeral 种子试玩态），
   而本取证的前提正是「走生产的落盘路径拿一份真存档」，两者不能兼得。故照第 26 单 shots.mjs
   的原样用随机开局，每次的种子逐档印在下面的读数里——`读数.json` 是**那一次运行**的机读记录，
   复跑会换一批种子、换一批卡，但每一条判读（弹没弹、卡在不在里面、出网几次）都不随种子变。 */
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;
fs.mkdirSync(OUT, {recursive: true});

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
  const root = document.querySelector('#dialog-root');
  const dlg = root && root.querySelector('.dlg');
  const scr = [...document.querySelectorAll('.screen')].find(s => s.classList.contains('active'));
  const bk = document.querySelector('#clip-back');
  return {
    popOpen: !!(root && root.classList.contains('open')),
    popTitle: dlg ? (dlg.querySelector('.dlg-head b') || {}).textContent || '' : '',
    popLead:  dlg ? (dlg.querySelector('.back-lead') || {}).textContent || '' : '',
    popQuiet: dlg ? [...dlg.querySelectorAll('.back-quiet')].map(p => p.textContent) : [],
    popSum:   dlg ? [...dlg.querySelectorAll('.back-sum li')].map(li => li.textContent.trim()) : [],
    popCardN: dlg ? dlg.querySelectorAll('#back-card .clip').length : 0,
    popCardWho:   dlg ? (dlg.querySelector('#back-card .clip-who') || {}).textContent || '' : '',
    popCardScore: dlg ? (dlg.querySelector('#back-card .clip-score') || {}).textContent || '' : '',
    popCardItems: dlg ? [...dlg.querySelectorAll('#back-card .clip-items li')].map(li => li.textContent.trim()) : [],
    popCardFoot:  dlg ? (dlg.querySelector('#back-card .clip-foot') || {}).textContent || '' : '',
    popBtns:  dlg ? [...dlg.querySelectorAll('button')].map(b => b.textContent.trim()) : [],
    screen: scr ? scr.id : '(无)',
    bannerShown: bk ? !bk.hidden : false,
    banner: bk ? bk.textContent : '',
    clipCards: document.querySelectorAll('#clip-list .clip').length,
    llmStat: (document.querySelector('#set-llm-stat') || {}).textContent || '',
    clock: ((document.querySelector('#tb-day') || {}).textContent || '') + ' ' + ((document.querySelector('#tb-clock') || {}).textContent || ''),
    build: (document.querySelector('#set-build') || {}).textContent || '',
    seed: (document.querySelector('#set-seed') || {}).textContent || '',
    sparkleN: [...document.querySelectorAll('#log-list li')].filter(li => li.textContent.indexOf('✨') >= 0).length,
    // 日志墙那条 ⏱ 必须还在（弹窗是新增的一层，不是替换）
    tickLog: [...document.querySelectorAll('#log-list li')].map(li => li.textContent).filter(t => t.indexOf('你不在的时候') >= 0),
  };
});

/* ── 造基准存档：让生产代码自己开城、自己跑、自己落盘，再把那份存档取出来 ──
   两份基准，为的是把本单那条死区判据的两侧都照到：
     A＝白天离开（世界停在 D1 08:00 上下）—— 短离开走「乙·没有新卡」；
     B＝夜里离开（走生产的 2× 快进推到 21:50 之后）—— 正是决策者撞上的那一档：
        当天的「夜深了」已经落过 ⇒ nights 恒为 0，而窗口盖过 04:00 ⇒ 卡照出。 */
async function makeBase(waitMs, doubleSpeed, label) {
  const cnt = {n: 0, urls: []};
  const ctx = await browser.newContext({viewport: {width: 900, height: 1250}});
  await guard(ctx, cnt);
  const page = await ctx.newPage();
  await page.goto(URL_);
  if (doubleSpeed) await page.click('#tb-speed');            // 走生产的速度按钮，不改内部状态
  await page.evaluate(ms => new Promise(r => setTimeout(r, ms)), waitMs);
  await page.evaluate(() => {                                 // 走生产既有的落盘路径（页面隐藏即 saveNow）
    Object.defineProperty(document, 'visibilityState', {get: () => 'hidden', configurable: true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const raw = await page.evaluate(() => localStorage.getItem('citylife-save-v1'));
  if (!raw) throw new Error('基准存档没落盘，取证前提不成立');
  const info = await read(page);
  await ctx.close();
  const w = JSON.parse(raw).world;
  console.log(`基准 ${label}：${info.clock}（${w.t} 分，日内 ${w.t % 1440} 分）· seed ${info.seed} · 构建 ${info.build} · 出网 ${cnt.n} 次`);
  return raw;
}
const BASE_A = await makeBase(900, false, 'A 白天离开');
const BASE_B = await makeBase(46000, true, 'B 夜里离开（21:50 之后）');

// ── 逐档：把 meta.at 往前拨 N 真实分钟，新上下文里开页，照下弹窗 ──
async function trip(SAVE, awayMin, tag, note, vp) {
  const cnt = {n: 0, urls: []};
  const ctx = await browser.newContext({viewport: vp || {width: 900, height: 1250}});
  await guard(ctx, cnt);
  const doctored = (() => { const d = JSON.parse(SAVE); d.meta.at = Date.now() - awayMin * 60000; return JSON.stringify(d); })();
  await ctx.addInitScript(s => { try { localStorage.setItem('citylife-save-v1', s); } catch (_) {} }, doctored);
  const page = await ctx.newPage();
  await page.goto(URL_);
  /* 出网计数分两段读，缘由：goto 在 load 事件上 resolve，而内联脚本是同步跑完的，
     故此刻读到的 netBoot ＝**开机 ＋ 补算 ＋ 造弹窗**这一整段的出网数，本单要的就是它必须为 0。
     之后那 700ms 是页面在正常跑（1×／2× 速度），期间新落的闲聊照旧会送 AI —— 那是在线玩法，
     不是离线期间的调用。两段混在一个数里报，等于把「活着的城市在说话」诬成「补算偷偷花钱」。 */
  const netBoot = cnt.n, netBootUrls = cnt.urls.slice();
  await page.evaluate(() => new Promise(r => setTimeout(r, 700)));
  const after = await read(page);
  await page.screenshot({path: path.join(OUT, tag + '.png')});
  // 关掉弹窗，验「一键关掉且关掉后照常进现场页、不再弹」
  let closed = null;
  if (after.popOpen) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#dialog-root .dlg button')].find(x => x.textContent.trim() === '知道了');
      if (b) b.click();
    });
    await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
    closed = await read(page);
    await page.screenshot({path: path.join(OUT, tag + '-closed.png')});
  }
  await ctx.close();
  return {awayMin, tag, note, before: JSON.parse(SAVE).world.t, after, closed,
          netBoot, netBootUrls, netTotal: cnt.n, netUrls: cnt.urls};
}

/* 视口两种：默认 900×1250（medium 布局，看得全）＋ 390×844（compact-portrait，
   决策者手上就是这一种——竖屏下对话框是底部抽屉、max-height:72dvh，卡长起来靠 body 自己滚，
   按钮钉在抽屉底沿。这一档必须单独照，不能拿宽屏的图代答。） */
const PHONE = {width: 390, height: 844};
const CASES = [
  [BASE_A, 3,    'jia0-below-threshold', '不足一拍（3 分钟）：低于门槛 ⇒ 不该弹'],
  [BASE_A, 60,   'yi1-1h-daytime',       '乙：白天离开 1 小时，没到 04:00 结算点 ⇒ 概括形态'],
  [BASE_A, 600,  'yi2-10h-daytime',      '乙：白天离开 10 小时，仍没跨 04:00 ⇒ 概括形态'],
  [BASE_B, 780,  'jia1-13h-deadzone',    '甲：决策者实测那一档 —— 夜里离开 13 小时，nights=0 而卡照出（改前这一档一声不吭）'],
  [BASE_A, 4320, 'jia2-3d',              '甲：离开 3 天，多张新卡，弹最新那张'],
  [BASE_A, 14400,'jia3-10d-capped',      '甲：离开 10 天触封顶，须如实告知跳过了多少'],
  [BASE_B, 780,  'phone-jia-13h',        '甲·手机竖屏（390×844）：底部抽屉形态', PHONE],
  [BASE_A, 600,  'phone-yi-10h',         '乙·手机竖屏（390×844）：底部抽屉形态', PHONE],
];
const rows = [];
for (const [SAVE, away, tag, note, vp] of CASES) {
  const r = await trip(SAVE, away, tag, note, vp);
  rows.push(r);
  const a = r.after;
  console.log(`\n【${tag}】${note}`);
  console.log(`  离开 ${away} 真实分钟　世界推进：${Math.floor(r.before/1440)+1} 日 ${String(Math.floor(r.before%1440/60)).padStart(2,'0')}:${String(r.before%60).padStart(2,'0')} → ${a.clock}`);
  console.log(`  弹窗：${a.popOpen ? '弹了' : '**没弹**'}${a.popOpen ? `　标题「${a.popTitle}」` : ''}　开机落在 ${a.screen}`);
  if (a.popOpen) {
    console.log(`  头一句：${a.popLead}`);
    for (const q of a.popQuiet) console.log(`  说明行：${q}`);
    for (const s of a.popSum) console.log(`  概括  ：${s}`);
    if (a.popCardN) {
      console.log(`  卡·谁 ：${a.popCardWho}　${a.popCardScore}`);
      for (const it of a.popCardItems) console.log(`  卡·落差：${it}`);
      console.log(`  卡·为什么挑中他：${a.popCardFoot}`);
    } else {
      console.log(`  卡    ：无（乙形态）`);
    }
    console.log(`  按钮  ：${JSON.stringify(a.popBtns)}`);
    console.log(`  关掉后：弹窗 ${r.closed.popOpen ? '仍在（异常！）' : '已关'}　落在 ${r.closed.screen}`);
  }
  console.log(`  日志墙那条 ⏱ ：${a.tickLog.length ? a.tickLog[a.tickLog.length-1] : '（无）'}`);
  console.log(`  剪辑页横幅：${a.bannerShown ? a.banner : '不出'}`);
  console.log(`  AI·开机+补算+造弹窗这一段：出网 ${r.netBoot} 次${r.netBootUrls.length ? ' ' + JSON.stringify(r.netBootUrls) : ''}　←本单的判据`);
  console.log(`  AI·连之后 700ms 在线跑的那段一起算：出网 ${r.netTotal} 次${r.netUrls.length ? ' ' + JSON.stringify(r.netUrls) : ''}（在线闲聊送 AI 属正常玩法）　·　设置页「${a.llmStat}」　·　日志墙 ✨ 条目 ${a.sparkleN} 条`);
}

fs.writeFileSync(path.join(OUT, '读数.json'), JSON.stringify(rows, null, 2));
console.log(`\n读数与截图已写入 ${OUT}`);
await browser.close();
srv.close();
