// 实机预览截图(补充指令四·长期制度;第 11 单甲案版):流水线每次产出后必跑,
// 输出 全地图全景 + 公寓全景 + 客厅/厨房/卧室 三区含人物在场的实机截图,呈决策者前置目验;
// 决策者点头后方可开/更新 PR。机器自检管几何,决策者目验管观感,两道都过才算过。
// 用法: node preview_shots.mjs <仓库根目录> <输出目录>
// 依赖: npm i playwright(浏览器用预装 Chromium,PLAYWRIGHT_BROWSERS_PATH 已配环境可直接跑)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const REPO = process.argv[2] || '.';
const OUT = process.argv[3] || '.';
const PORT = 18899;

const html = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8')
  .replace(/\}\)\(\);\s*<\/script>/, 'window.__pv={get state(){return state}};\n})();\n</script>');

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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 3 });  // 3x 渲染率,便于目验
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`);
await new Promise(r => setTimeout(r, 2600));

// 把四住户分别摆进三间房(仅显示态,便于目验人物与家具关系;世界照常)
await page.evaluate(() => {
  const put = (id, x, y) => { const v = __pv.state.vis[id]; v.x = x; v.y = y; v.path = []; v.moving = false; };
  put('a1', 5.5, 9.5);    // 顾:客厅餐桌旁(home_table 站位)
  put('a2', 14.1, 9.5);   // 沈:灶台前(kitchen 站位)
  put('a3', 12.1, 4.5);   // 陆:卧室门厅走道(净道中线,零贴墙)
  put('a4', 17.5, 5.3);   // 白:卧室东下床位(毯面就寝位)
  __pv.state.world.speed = 0;
  __pv.state.cam.manual = true;
});
await new Promise(r => setTimeout(r, 700));

async function shotRegion(name, wx0, wy0, wc, hc) {
  const reg = await page.evaluate(([x0, y0, w, h]) => {
    const r = document.querySelector('#cv').getBoundingClientRect();
    const s = __pv.state.view.s;
    return { x: r.x + __pv.state.view.ox + x0 * s, y: r.y + __pv.state.view.oy + y0 * s, width: w * s, height: h * s };
  }, [wx0, wy0, wc, hc]);
  await page.screenshot({ path: path.join(OUT, `preview_${name}.png`), clip: reg });
  console.log(`preview_${name}.png 已输出`);
}
await shotRegion('map', 0, 0, 47, 24);              // 全地图全景(全部房区+街道,不裁边,第 11 单)
await shotRegion('full', 0.6, 0.6, 19.8, 11.8);     // 公寓全景(19×11 包围盒,不裁边)
await shotRegion('living', 0.7, 2.7, 10.6, 9.6);    // 客厅(含底缘门洞)
await shotRegion('kitchen', 10.6, 6.7, 9.8, 5.8);   // 厨房+纵廊(含隔墙门洞与街口)
await shotRegion('bedroom', 10.6, 0.7, 9.8, 6.6);   // 卧室(含门厅走道与隔墙门洞)

await browser.close();
srv.close();
console.log('全景与三区预览截图完成,呈决策者目验;点头后方可开/更新 PR');
process.exit(0);
