// 复现"手机全屏"两种姿态：基线（不注入 insets）vs 注入（模拟壳里 MainActivity 写 --sa-*）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const REPO = 'F:/资料/codex/云港小事/citylife';
const OUT = 'F:/临时/2026-10-04/repro-fullscreen';
fs.mkdirSync(OUT, { recursive: true });
const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
const PORT = 18971;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });

async function 拍(名, w, h, insets){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.route('**api.anthropic.com**', r => r.abort());
  await page.route('**/relay', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"text":"{}"}' }));
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  if (insets){
    await page.evaluate(v => {
      const s = document.documentElement.style;
      s.setProperty('--sa-t', v.t + 'px'); s.setProperty('--sa-b', v.b + 'px');
      s.setProperty('--sa-l', v.l + 'px'); s.setProperty('--sa-r', v.r + 'px');
    }, insets);
    await page.waitForTimeout(900);
  }
  const 读数 = await page.evaluate(() => {
    const S = window.__pv.state;
    const cs = getComputedStyle(document.documentElement);
    return { 视口: [innerWidth, innerHeight], dpr: devicePixelRatio,
      sa: [cs.getPropertyValue('--sa-t').trim(), cs.getPropertyValue('--sa-b').trim(), cs.getPropertyValue('--sa-l').trim(), cs.getPropertyValue('--sa-r').trim()],
      画布: [S.cvW, S.cvH, S.dpr, S.view.s], 布局: document.getElementById('app').dataset.layout,
      画布CSS: [document.getElementById('cv').clientWidth, document.getElementById('cv').clientHeight] };
  });
  await page.screenshot({ path: path.join(OUT, 名 + '.png') });
  console.log(名, JSON.stringify(读数));
  await ctx.close();
}

await 拍('竖屏-基线', 440, 956, null);
await 拍('竖屏-注入', 440, 956, { t: 11, b: 8, l: 0, r: 0 });
await 拍('横屏-基线', 956, 440, null);
await 拍('横屏-注入', 956, 440, { t: 0, b: 16, l: 37, r: 0 });

await browser.close();
srv.close();
