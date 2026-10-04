// 临时诊断：v145（铺满前）vs 当前（铺满后）——画布多大、星星多密、两条背景带里星色像素多少
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';
const REPO = 'F:/资料/codex/云港小事/citylife';
const 版 = process.argv[2] || '当前';
const ref = process.argv[3] || '';
const raw = ref
  ? execFileSync('git', ['show', `${ref}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
const PORT = 18981;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.route('**api.anthropic.com**', r => r.abort());
await page.route('**/relay', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: '{}' }) }));
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html?seed=20261004`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
const 读 = await page.evaluate(() => {
  const cv = document.querySelector('#cv'), st = __pv.state;
  const 顶带 = Math.max(4, Math.round(st.view.oy) - 2);
  const 底起 = Math.max(顶带 + 1, Math.round(st.view.oy + __pv.Sim.MAPH * st.view.s) + 2);
  const 面积 = (顶带 * cv.width) + (Math.max(0, cv.height - 底起) * cv.width);
  return { cvW: st.cvW, cvH: st.cvH, s: +st.view.s.toFixed(2), oy: Math.round(st.view.oy),
           画布面积: cv.width * cv.height, 带面积: 面积,
           带占画布: +(面积 / (cv.width * cv.height) * 100).toFixed(1) + '%',
           STAR_N: (typeof STAR_N !== 'undefined') ? STAR_N : '未暴露' };
});
console.log(版, JSON.stringify(读));
await browser.close();
srv.close();
