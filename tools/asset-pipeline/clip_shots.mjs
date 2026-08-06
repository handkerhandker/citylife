// 每日剪辑页实机截图（第 21 单）：把世界快进若干天攒出剪辑，再切到「剪辑」页拍图，
// 供决策者目验（双道验收制度：机器自检管几何/口径，决策者目验管观感）。
// 用法: node clip_shots.mjs <仓库根目录> <输出目录>
// 依赖: playwright（浏览器用预装 Chromium，PLAYWRIGHT_BROWSERS_PATH 已配环境可直接跑）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const REPO = process.argv[2] || '.';
const OUT = process.argv[3] || '.';
const PORT = 18901;

const html = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8')
  .replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state}, Sim, PURE};\n})();\n</script>');

const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u.startsWith('/assets/')) {
    const f = path.join(REPO, 'assets', path.basename(u));
    if (!fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': 'image/png' });
    r.end(fs.readFileSync(f));
    return;
  }
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(html);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });

// 用固定种子进城（?seed 走 ephemeral 态，不写档），AI 关掉——本单一个字都不许过 AI，
// 截图里出现的每一句都必须是模板或日志原文，故连挂点都不给它开。
const SEED = 20260803;

async function shoot(name, w, h, days, tab) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html?seed=${SEED}`);
  // 抢在第一次 AI 挂点之前关掉 AI：沙箱不通网，晚一步日志墙上就会留一条 ⚠ 连线失败，
  // 那是环境噪声不是产品行为，会干扰目验。本单要验的恰恰是「一个字都不过 AI」。
  await page.waitForFunction(() => !!window.__pv);
  await page.evaluate(() => { __pv.state.llm.on = false; __pv.state.world.speed = 0; });
  await new Promise(r => setTimeout(r, 700));
  await page.evaluate((d) => {
    for (let i = 0; i < d * 144; i++) __pv.Sim.step(__pv.state.world, 10);
  }, days);
  await page.evaluate((t) => { document.querySelector('[data-tab="' + t + '"]').click(); }, tab);
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false });
  await page.close();
  console.log('  ✓', name);
}

// 往回翻历史：本页的可翻性是任务书口径「可往回翻看历史」的目验证据。
// 注意 fullPage 对本作无效——#app 是 100dvh 定高、各屏内部自己滚，整页截图与视口截图逐字节相同（实测），
// 故要证明「翻得动」只能真滚一段再拍。
async function shootScrolled(name, w, h, days, px) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html?seed=${SEED}`);
  await page.waitForFunction(() => !!window.__pv);
  await page.evaluate(() => { __pv.state.llm.on = false; __pv.state.world.speed = 0; });
  await new Promise(r => setTimeout(r, 700));
  await page.evaluate((d) => { for (let i = 0; i < d * 144; i++) __pv.Sim.step(__pv.state.world, 10); }, days);
  await page.evaluate(() => { document.querySelector('[data-tab="clip"]').click(); });
  await new Promise(r => setTimeout(r, 900));
  await page.evaluate((y) => { document.querySelector('#scr-clip').scrollTop = y; }, px);
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false });
  await page.close();
  console.log('  ✓', name);
}

fs.mkdirSync(OUT, { recursive: true });
console.log('拍摄中（种子 ' + SEED + '，AI 关闭）…');
await shoot('clip-desktop', 1400, 900, 12, 'clip');       // 桌面宽屏（expanded）
await shoot('clip-phone', 390, 844, 12, 'clip');          // 手机竖屏（compact-portrait）
await shoot('clip-tablet', 820, 1180, 12, 'clip');        // 平板（medium）
await shoot('clip-day1', 390, 844, 2, 'clip');            // 开局头两天：基线未建起的口径
await shoot('clip-empty', 390, 844, 0, 'clip');           // 还没有剪辑时的空态
await shoot('clip-tabbar', 390, 844, 12, 'log');          // 六页并排的页签（对照：日志页）
await shootScrolled('clip-history', 1400, 900, 31, 2600); // 往回翻：30 天后滚到中段看历史卡

await browser.close();
srv.close();
console.log('完成 →', OUT);
