// 第 123 单·坏档容错普查（渲染面；进冒烟档 2）
//
// 为什么还要一支浏览器侧的：`personalLog` 坏元素崩的是**角色卡对话框**、`saidDay` 坏值崩的是
// **页面里的游戏循环**——这两条在无头 sim 里碰不到，必须真开页面点一遍。
// 口径：把畸形存档塞进隔离上下文的 localStorage → 开页 → 点角色页第一张卡 → 换短信页 →
//   · 全程零 pageerror（网络类噪声只印不算）；
//   · 闸该拒的（personalLog／inbox 坏元素）必须走"挪 BAK＋开新城"（`citylife-save-v1-bak` 有值）；
//   · 闸放行的（saidDay 坏值）必须被就地治好、页面照跑。
// 只读：跑在独立浏览器上下文里，碰不到决策者自己的存档。
//
// 用法：node tools/save-fuzz/dom-probe.mjs [输出目录]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const 要 = createRequire(path.join(REPO, 'x.js'));
const { chromium } = 要('playwright');
const { Sim } = 要(path.join(REPO, 'app.js'));
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天(), 'save-fuzz-dom'));
function 今天() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
fs.mkdirSync(OUT, { recursive: true });

const rawHtml = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const PORT = 18942;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(rawHtml); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

function 造档() {
  const w = Sim.makeWorld(20260803);
  for (let d = 1; d <= 400; d++) { w.credits = 99; for (let i = 0; i < 144; i++) Sim.step(w, 10); }
  return w;
}
const 底 = JSON.parse(Sim.serialize(造档(), null));
const 例 = [
  ['对照·原档', s => s, false],
  ['personalLog=[null]', s => (s.world.agents[0].personalLog = [null], s), true],
  ['inbox=[null]', s => (s.world.agents[0].inbox = [null], s), true],
  ['saidDay="x"', s => (s.world.saidDay = 'x', s), false],
  ['personalLog=[{}]', s => (s.world.agents[0].personalLog = [{}], s), true],
  ['clips=[null]', s => (s.world.clips = [null], s), false],
  ['log=[{}]', s => (s.world.log = [{}], s), false],
];

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const 报表 = [];
let 红 = 0;
for (const [名, 变, 期望拒收] of 例) {
  const 档 = 变(JSON.parse(JSON.stringify(底)));
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.addInitScript(`try{localStorage.setItem('citylife-save-v1', ${JSON.stringify(JSON.stringify(档))});}catch(e){}`);
  const page = await ctx.newPage();
  const 错 = [];
  page.on('pageerror', e => 错.push('pageerror: ' + (e && e.message || e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() && m.location().url) || '';
    if (/favicon|\/relay|net::ERR/.test(u) || /Failed to load resource/.test(m.text())
        || /CORS|Failed to fetch|api\.anthropic/i.test(m.text())) return;
    错.push('console: ' + m.text().slice(0, 120));
  });
  let 诊 = null;
  try {
    await page.goto(URL_, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(700);
    await page.click('button.tab[data-tab="roles"]').catch(() => {});
    await page.waitForTimeout(250);
    await page.click('#roles-grid button[data-act]').catch(() => {});
    await page.waitForTimeout(250);
    await page.click('button.tab[data-tab="phone"]').catch(() => {});
    await page.waitForTimeout(250);
    诊 = await page.evaluate(() => ({
      day: (document.body.innerText.match(/D\d+/) || [''])[0],
      拒收: !!localStorage.getItem('citylife-save-v1-bak'),
    })).catch(() => null);
  } catch (e) { 错.push('driver: ' + String(e.message).slice(0, 120)); }
  await ctx.close();
  const 拒收对 = 诊 ? (诊.拒收 === 期望拒收) : false;
  const 好 = 错.length === 0 && 拒收对;
  if (!好) 红++;
  报表.push({ 名, 错, 诊, 期望拒收, 好 });
  console.log((好 ? ' ok  ' : ' FAIL ') + 名.padEnd(22) + (诊 ? '［' + 诊.day + ' 拒收=' + 诊.拒收 + '（期望 ' + 期望拒收 + '）］' : '')
    + (错.length ? '  ← ' + 错.slice(0, 2).join(' ; ') : ''));
}
await browser.close();
srv.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(报表, null, 2), 'utf8');
console.log('渲染面坏档普查：' + 红 + ' 例不过 / 共 ' + 例.length + ' 例；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
