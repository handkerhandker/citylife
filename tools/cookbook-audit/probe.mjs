// 第 188 单·菜谱本探针（真浏览器；只读诊断，进冒烟档 2）
//
// 为什么要有它：第 170 单把"试新菜"做进世界（`ag.dishes` 逐人一本、零重样），但角色页原先
//   只显示**最新一道**——整本藏在字段里，玩家看不到。本单把整本摆出来，探针逐条钉：
//   ① 有菜：角色弹窗里「菜谱本」一行把 `ag.dishes` **按顺序**全列出来（几道就几片）；
//   ② 空账：`dishes` 为空 ⇒ 照实说"还是空的"（不许空白、不许造假）；
//   ③ 只读：摆一遍之后 `ag.dishes` 逐字节不变、世界序列化逐字节不变；
//   ④ 零 pageerror。
// 用法：node tools/cookbook-audit/probe.mjs [输出目录]   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'cookbook-audit'));
fs.mkdirSync(OUT, { recursive: true });
const raw = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = raw.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim}};\n})();\n</script>');
if (html === raw) { console.error('注入点没找到'); process.exit(2); }
const PORT = 18982;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const page = await ctx.newPage();
const 错 = [];
page.on('pageerror', e => 错.push(String(e && e.message || e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const u = (m.location() && m.location().url) || '';
  if (/favicon|\/relay|net::ERR/.test(u) || /Failed to load resource|CORS|Failed to fetch|api\.anthropic/i.test(m.text())) return;
  错.push('console: ' + m.text().slice(0, 120));
});
await page.route('**api.anthropic.com**', r => r.abort());
await page.route('**/relay', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: '{}' }) }));
await page.goto(`http://127.0.0.1:${PORT}/city-life-framework.html`, { waitUntil: 'load' });
await page.waitForTimeout(900);

let 红 = 0;
const 判 = (名, ok, 读) => { if (!ok) 红++; console.log((ok ? ' ok  ' : ' FAIL ') + 名 + '：' + JSON.stringify(读)); };
/* 开某个人的角色弹窗（走真 UI：角色页点他的卡），再读「菜谱本」那一行 */
const 开弹窗读菜谱本 = async (id) => {
  await page.click('button.tab[data-tab="roles"]').catch(() => {});
  await page.waitForTimeout(250);
  /* 角色卡上的「详情」按钮才是入口（卡身点击不弹窗——第 188 单第一版探针就栽在这） */
  await page.click(`#roles-grid [data-role="${id}"] button[data-act="detail"]`).catch(() => {});
  await page.waitForTimeout(250);
  return await page.evaluate(() => {
    const 对 = [...document.querySelectorAll('#dialog-root .kv')].find(k => /菜谱本/.test(k.textContent || ''));
    return 对 ? (对.textContent || '').replace('菜谱本', '').trim() : '（没有这一行）';
  });
};
const 关弹窗 = async () => { await page.click('#dialog-root [data-close]').catch(() => {}); await page.waitForTimeout(150); };

/* ① 有菜：给 a4 塞三道，按顺序全列出来 */
await page.evaluate(() => { window.__pv.state.world.agents.find(a => a.id === 'a4').dishes = ['蛋炒饭', '红烧肉', '酒酿圆子']; });
const 文1 = await 开弹窗读菜谱本('a4');
判('① 有菜 ⇒ 按顺序全列（三道都在、顺序对）',
  /蛋炒饭/.test(文1) && /红烧肉/.test(文1) && /酒酿圆子/.test(文1)
  && 文1.indexOf('蛋炒饭') < 文1.indexOf('红烧肉') && 文1.indexOf('红烧肉') < 文1.indexOf('酒酿圆子'),
  { 菜谱本: 文1 });
await 关弹窗();

/* ② 空账：照实说"还是空的" */
await page.evaluate(() => { window.__pv.state.world.agents.find(a => a.id === 'a4').dishes = []; });
const 文2 = await 开弹窗读菜谱本('a4');
判('② 空账 ⇒ 照实说"还是空的"（不空白、不造假）', /还是空的/.test(文2), { 菜谱本: 文2 });
await 关弹窗();

/* ③ 只读：摆一遍之后字段与整世界序列化逐字节不变（先把世界按停，免得"时间在走"把判据搞假） */
await page.evaluate(() => { window.__pv.state.world.speed = 0; });
await page.evaluate(() => { window.__pv.state.world.agents.find(a => a.id === 'a4').dishes = ['蛋炒饭', '红烧肉']; });
const 前 = await page.evaluate(() => JSON.stringify([window.__pv.state.world.agents.find(a => a.id === 'a4').dishes, window.__pv.Sim.serialize(window.__pv.state.world, null)]));
await 开弹窗读菜谱本('a4'); await 关弹窗();
const 后 = await page.evaluate(() => JSON.stringify([window.__pv.state.world.agents.find(a => a.id === 'a4').dishes, window.__pv.Sim.serialize(window.__pv.state.world, null)]));
判('③ 只读：摆一遍之后 `dishes` 与世界序列化逐字节不变', 前 === 后, { 变没变: 前 !== 后 });
判('④ 全程零 pageerror', 错.length === 0, 错.slice(0, 3));

await page.screenshot({ path: path.join(OUT, '菜谱本.png') }).catch(() => {});
await browser.close();
srv.close();
console.log(红 ? `菜谱本探针：${红} 条不过（图在 ${OUT}）` : '菜谱本探针：全绿');
process.exit(红 ? 1 : 0);
