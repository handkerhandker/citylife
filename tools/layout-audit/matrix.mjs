// 第 127 单·排版 × 设置矩阵巡查（真浏览器；只读诊断，进冒烟档 2）
//
// 为什么做：全按钮扫描只跑过**两种视口**（1400×900 与 390×844）与**默认设置**
// （减少动效＝关、像素画风＝开）。中间的 medium、横屏手机的 compact-landscape、
// 以及两条备用渲染路径（动效关×像素关的四种组合）从没被系统走过。本工具把它们补全：
//   A 段·排版四档：expanded / medium / compact-portrait / compact-landscape
//   B 段·设置四组合：{减少动效 开/关} × {像素画风 开/关}（在 900×700 上）
// 每档判据：① 布局判定与视口相符；② 无横向溢出；③ 六个页签都在屏内；④ 现场页名牌 4 块、同层零重叠；⑤ 零 pageerror。
// 用法：node tools/layout-audit/matrix.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'layout-matrix'));
fs.mkdirSync(OUT, { recursive: true });

const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get chips(){return nameChipBoxes},get 名盒高(){return 名盒高()},get state(){return state},get vis(){return state.vis}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18949;   // 第 270 单批后自查：原 18948 与 firework-audit/probe.mjs 撞车 ⇒ 改号
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const 页 = ['roles', 'log', 'clip', 'phone', 'settings', 'live'];
async function 跑一档(browser, 名, 视口, 设置) {
  const ctx = await browser.newContext({ viewport: 视口 });
  const page = await ctx.newPage();
  const 错 = [];
  page.on('pageerror', e => 错.push('pageerror: ' + (e && e.message || e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() && m.location().url) || '';
    if (/favicon|\/relay|net::ERR/.test(u) || /Failed to load resource|CORS|Failed to fetch|api\.anthropic/i.test(m.text())) return;
    错.push('console: ' + m.text().slice(0, 120));
  });
  let 诊 = {};
  try {
    await page.goto(URL_, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(700);
    if (设置.motion || !设置.pix) {
      await page.click('button.tab[data-tab="settings"]').catch(() => {});
      await page.waitForTimeout(200);
      if (设置.motion) await page.click('#set-motion').catch(() => {});
      if (!设置.pix) await page.click('#set-pix').catch(() => {});
      await page.waitForTimeout(400);
    }
    for (const t of 页) { await page.click(`button.tab[data-tab="${t}"]`).catch(() => {}); await page.waitForTimeout(110); }
    await page.waitForTimeout(400);
    诊 = await page.evaluate(() => {
      const doc = document.documentElement;
      const tabs = [...document.querySelectorAll('button.tab')].map(b => {
        const r = b.getBoundingClientRect();
        return r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1;
      });
      const chips = window.__pv.chips || [];
      /* 第 181 单·口径对齐（与第 149 单的立法一致）："名字盒重叠"要求 **x、y 两轴都近** ——
         只判 x 会把"同一道但上下差出盒高、视觉根本不叠"的对子误判成重叠（真机/大视口下实测到：
         dx=16、dy=99 也被算重叠）。判据仍不许松：同一道 ＋ x 相触 ＋ y 差小于一个盒高 = 真叠。 */
      const 盒高 = window.__pv.名盒高 || 15;
      let 重叠 = 0;
      for (let i = 0; i < chips.length; i++) for (let j = i + 1; j < chips.length; j++) {
        const a = chips[i], b = chips[j];
        if (a.lane === b.lane && Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < 盒高) 重叠++;
      }
      return {
        视口读数: (document.querySelector('#set-viewport') || {}).textContent || '',
        横向溢出: doc.scrollWidth - window.innerWidth,
        页签: tabs.length, 页签全在屏内: tabs.every(Boolean),
        名牌数: chips.length, 同层重叠: 重叠,
        动效: !!window.__pv.state.reduceMotion,
        像素: document.querySelector('#set-pix').textContent === '开',
      };
    });
  } catch (e) { 错.push('driver: ' + String(e.message).slice(0, 140)); }
  await ctx.close();
  const 好 = 错.length === 0 && 诊.横向溢出 <= 1 && 诊.页签 === 6 && 诊.页签全在屏内
    && 诊.名牌数 >= 4 && 诊.同层重叠 === 0 && 诊.动效 === 设置.motion && 诊.像素 === 设置.pix;
  return { 名, 视口, 设置, 诊, 错, 好 };
}

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const 报 = [];
for (const [名, w, h, 期望] of [
  ['A·expanded', 1400, 900, 'expanded'],
  ['A·medium', 800, 900, 'medium'],
  ['A·compact-portrait', 390, 844, 'compact-portrait'],
  ['A·compact-landscape', 844, 390, 'compact-landscape'],
]) {
  const r = await 跑一档(browser, 名, { width: w, height: h }, { motion: false, pix: true });
  r.好 = r.好 && r.诊.视口读数.indexOf(期望) >= 0;
  报.push(r);
  console.log((r.好 ? ' ok  ' : ' FAIL ') + 名.padEnd(22) + JSON.stringify(r.诊) + (r.错.length ? ' ← ' + r.错.slice(0, 2).join(' ; ') : ''));
}
for (const motion of [false, true]) for (const pix of [true, false]) {
  const 名 = `B·动效${motion ? '减' : '全'}／像素${pix ? '开' : '关'}`;
  const r = await 跑一档(browser, 名, { width: 900, height: 700 }, { motion, pix });
  报.push(r);
  console.log((r.好 ? ' ok  ' : ' FAIL ') + 名.padEnd(22) + JSON.stringify(r.诊) + (r.错.length ? ' ← ' + r.错.slice(0, 2).join(' ; ') : ''));
}
await browser.close(); srv.close();
const 红 = 报.filter(r => !r.好).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(报, null, 2), 'utf8');
console.log('排版×设置矩阵：' + 红 + ' 档不过 / 共 ' + 报.length + ' 档；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
