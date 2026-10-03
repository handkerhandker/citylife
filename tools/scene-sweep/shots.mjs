// 第 141 单·目验巡查（真浏览器；只读诊断，进冒烟档 2）
//
// 干什么：把"生产的 draw()"摆到九种典型场景各拍一张，**供人肉眼过一遍**——
//   机器判据管"不越界/不重叠/位移上限"，管不了"看起来对不对"；这一套图就是定期目验的入口。
// 口径：只摆姿势（位置/活动/天气/钟点/相机/选中）＋注入 __pv 读数口；渲染代码零改动；
//   `w.speed=0` 冻结世界，拍到的就是摆好的那一帧（精灵动画相位仍在走，属正常）。
// 用法：node tools/scene-sweep/shots.mjs <输出目录>   （要 CITYLIFE_CHROME）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', new Date().toISOString().slice(0, 10), 'scene-sweep'));
const PORT = 18960;
fs.mkdirSync(OUT, { recursive: true });

const rawHtml = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},get SPOTS(){return STAND_SPOTS},get pix(){return pix}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const 错 = [];

/* 摆姿势原语：把某个人放到（格坐标）上、给活动、给朝向/走停 */
const 把人 = (page, 表) => page.evaluate((列表) => {
  const st = __pv.state, w = st.world;
  w.speed = 0;
  st.llm.on = false;
  for (const 人 of 列表) {
    const ag = w.agents.find(a => a.id === 人.id); if (!ag) continue;
    const v = st.vis[ag.id];
    v.x = v.dspX = 人.位[0]; v.y = v.dspY = 人.位[1];
    v.path = []; v.moving = !!人.走; v.dir = 人.向 === undefined ? 3 : 人.向;
    ag.activity = { type: 人.活[0], label: 人.活[1], think: 人.想 || '' };
  }
}, 表);
const 设景 = (page, o) => page.evaluate((opts) => {
  const st = __pv.state, w = st.world;
  if (opts.t !== undefined) w.t = opts.t;
  w.weather.rain = !!opts.雨;
  if (opts.雨) w.weather.until = w.t + 99999;
  st.reduceMotion = !!opts.减动效;
  st.selected = opts.选中 || 'a1';
  st.cam.manual = true; st.cam.fx = opts.看[0]; st.cam.fy = opts.看[1];
}, o);
const 拍 = async (page, 名) => {
  const 布 = await page.evaluate(() => {
    const r = document.querySelector('#cv').getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  await page.screenshot({ path: path.join(OUT, 名 + '.png'), clip: 布 });
  // 特写：围绕当前相机看点裁 480×360（看不清细节时的目验入口；看点在画布上的位置由 view.ox/oy+s 反算）
  const 特 = await page.evaluate(() => {
    const r = document.querySelector('#cv').getBoundingClientRect(), v = __pv.state.view, st = __pv.state;
    const cx = r.x + v.ox + st.cam.fx * v.s, cy = r.y + v.oy + st.cam.fy * v.s;
    const w = 480, h = 360;
    return { x: Math.max(Math.round(r.x), Math.round(cx - w / 2)), y: Math.max(Math.round(r.y), Math.round(cy - h / 2)), width: w, height: h };
  });
  await page.screenshot({ path: path.join(OUT, 名 + '-特写.png'), clip: 特 });
  console.log('出图 ' + 名 + '.png ＋特写  ' + JSON.stringify(布));
};

const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', e => 错.push(String(e && e.message || e)));
await page.goto(URL_); await page.waitForTimeout(2400);

// ① 四人聚厅·下午（四道名牌＋各自图标＋选中者两行气泡）
await 设景(page, { t: 1440 * 6 + 15 * 60, 雨: false, 看: [6, 7], 选中: 'a1' });
await 把人(page, [
  { id: 'a1', 位: [5.1, 9.3], 活: ['work', '上班'], 想: '这段先跑通再说。' },
  { id: 'a2', 位: [6.6, 9.3], 活: ['eat', '做饭吃'], 想: '锅一响，人就踏实了。' },
  { id: 'a3', 位: [4.1, 9.3], 活: ['chat', '和谁聊天'], 想: '这行情看不懂。' },
  { id: 'a4', 位: [7.6, 9.3], 活: ['write', '写稿'], 想: '标题还差一点。' },
]);
await page.waitForTimeout(500); await 拍(page, '①四人聚厅-下午');

// ② 四人入睡·深夜（💤 指示器 ×4）
await 设景(page, { t: 1440 * 6 + 23 * 60 + 30, 看: [14, 4], 选中: 'a2' });
await 把人(page, [
  { id: 'a1', 位: [14.4, 2.7], 活: ['sleep', '睡觉'] },
  { id: 'a2', 位: [17.4, 2.7], 活: ['sleep', '睡觉'] },
  { id: 'a3', 位: [14.4, 5.3], 活: ['sleep', '睡觉'] },
  { id: 'a4', 位: [17.4, 5.3], 活: ['sleep', '睡觉'] },
]);
await page.waitForTimeout(500); await 拍(page, '②四人入睡-深夜');

// ③ 雨夜街道（伞＋雨幕＋街灯光斑＋夜色）
await 设景(page, { t: 1440 * 6 + 20 * 60, 雨: true, 看: [16, 14], 选中: 'a1' });
await 把人(page, [
  { id: 'a1', 位: [5.5, 7], 活: ['idle', '在家待着'] },
  { id: 'a2', 位: [15.2, 14.2], 走: true, 向: 0, 活: ['stroll', '出门逛逛'], 想: '雨点打在伞面上，像有人轻轻敲门。' },
  { id: 'a3', 位: [18.4, 14.2], 走: true, 向: 2, 活: ['stroll', '出门逛逛'] },
  { id: 'a4', 位: [5.5, 8], 活: ['idle', '在家待着'] },
]);
await page.waitForTimeout(500); await 拍(page, '③雨夜街道');

// ④ 公园·正午（晴天基准）
await 设景(page, { t: 1440 * 6 + 12 * 60, 雨: false, 看: [9, 19], 选中: 'a3' });
await 把人(page, [
  { id: 'a1', 位: [6.5, 10.5], 活: ['idle', '在家待着'] },
  { id: 'a2', 位: [6.5, 19.5], 活: ['stroll', '出门逛逛'], 想: '走一走，脑子里的浆糊沉淀一下。' },
  { id: 'a3', 位: [9.5, 19.5], 走: true, 向: 0, 活: ['stroll', '出门逛逛'] },
  { id: 'a4', 位: [5.5, 11], 活: ['idle', '在家待着'] },
]);
await page.waitForTimeout(500); await 拍(page, '④公园-正午');

// ⑤ 便利店·上班时间（店内布局＋上班图标）
await 设景(page, { t: 1440 * 6 + 10 * 60 + 30, 雨: false, 看: [28, 7], 选中: 'a2' });
await 把人(page, [
  { id: 'a1', 位: [5.5, 7], 活: ['idle', '在家待着'] },
  { id: 'a2', 位: [27.5, 6.5], 活: ['clerk', '上班'], 想: '排面理一理。' },
  { id: 'a3', 位: [5.5, 8], 活: ['idle', '在家待着'] },
  { id: 'a4', 位: [5.5, 9], 活: ['idle', '在家待着'] },
]);
await page.waitForTimeout(500); await 拍(page, '⑤便利店-上班');

// ⑥ 广场集市·上午（摊位＋房间铺装）
await 设景(page, { t: 1440 * 6 + 11 * 60, 雨: false, 看: [21, 18], 选中: 'a4' });
await 把人(page, [
  { id: 'a1', 位: [5.5, 7], 活: ['idle', '在家待着'] },
  { id: 'a2', 位: [5.5, 8], 活: ['idle', '在家待着'] },
  { id: 'a3', 位: [20.5, 17.5], 走: true, 向: 2, 活: ['stroll', '逛吃街市'] },
  { id: 'a4', 位: [21.5, 18.5], 活: ['eat', '逛吃街市'], 想: '捏着两串，钱包不心疼的快乐。' },
]);
await page.waitForTimeout(500); await 拍(page, '⑥广场集市-上午');

// ⑦ 深夜街灯（室内灯＋路灯光斑）
await 设景(page, { t: 1440 * 6 + 23 * 60, 雨: false, 看: [24, 13], 选中: 'a1' });
await 把人(page, [
  { id: 'a1', 位: [24.5, 13.5], 走: true, 向: 2, 活: ['stroll', '出门逛逛'], 想: '路灯一盏一盏数过去。' },
  { id: 'a2', 位: [6.5, 9], 活: ['idle', '在家待着'] },
  { id: 'a3', 位: [14.5, 3], 活: ['sleep', '睡觉'] },
  { id: 'a4', 位: [17.5, 5], 活: ['sleep', '睡觉'] },
]);
await page.waitForTimeout(500); await 拍(page, '⑦深夜街灯');
// ⑨ 公司·上班（第 143 单新陈设：办公桌一排／白板／饮水机）
await 设景(page, { t: 1440 * 6 + 10 * 60, 雨: false, 看: [41, 7], 选中: 'a1' });
await 把人(page, [
  { id: 'a1', 位: [38.5, 6.5], 活: ['work', '上班'], 想: '这段先跑通再说。' },
  { id: 'a2', 位: [5.5, 7], 活: ['idle', '在家待着'] },
  { id: 'a3', 位: [42.5, 6.5], 活: ['work', '上班'] },
  { id: 'a4', 位: [5.5, 8], 活: ['idle', '在家待着'] },
]);
await page.waitForTimeout(500); await 拍(page, '⑨公司-上班');
await page.close();

// ⑧ 手机竖屏·四人聚厅（名牌四道＋气泡在窄屏的观感）
const 手 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
手.on('pageerror', e => 错.push(String(e && e.message || e)));
await 手.goto(URL_); await 手.waitForTimeout(2400);
await 设景(手, { t: 1440 * 6 + 15 * 60, 雨: false, 看: [5.5, 8.5], 选中: 'a3' });
await 把人(手, [
  { id: 'a1', 位: [5.1, 9.3], 活: ['work', '上班'], 想: '先跑通再说。' },
  { id: 'a2', 位: [6.6, 9.3], 活: ['eat', '做饭吃'] },
  { id: 'a3', 位: [4.1, 9.3], 活: ['chat', '和谁聊天'], 想: '这行情看不懂。' },
  { id: 'a4', 位: [7.6, 9.3], 活: ['write', '写稿'] },
]);
await 手.waitForTimeout(500); await 拍(手, '⑧手机竖屏-四人聚厅');
await 手.close();

await browser.close(); srv.close();
fs.writeFileSync(path.join(OUT, '错误.json'), JSON.stringify(错, null, 2), 'utf8');
console.log('目验巡查出图完成：' + OUT + '；页面错误 ' + 错.length);
process.exit(错.length ? 1 : 0);
