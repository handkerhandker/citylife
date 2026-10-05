// 第 251 单·雷雨 实机取证（真浏览器；只读诊断，进冒烟档 2）
//
// 量什么（三个像素读数，都是"同场景对照"）：
//   ① 均亮（0.2126R+0.7152G+0.0722B 的整幅均值）：雷雨 < 普通雨（压暗一档）；
//   ② 蓝斑（b≥r+12 且 b≥110 的像素数）：雷雨 > 普通雨（雨丝更密更亮）；
//   ③ 闪光：把时钟钉在"会闪的那一刻" ⇒ 均亮比同场的雷雨高（整幅淡光）；
//      同一刻换成普通雨／晴 ⇒ 与各自基线相同（不闪）。
//   对照：雷雨·重复 = 雷雨（稳定）；雷雨·减动效 ≈ 晴（雨幕与雷雨一并跳）。
// 保真度：画的都是生产 draw()；脚本只摆姿势（时钟/天气/相机/动效开关），不碰渲染代码。
// 用法：node tools/storm-audit/probe.mjs [输出目录] [--改前=<git-ref>]
//   （--改前 跑旧版作对照：旧版没有雷雨概念 ⇒ ①③ 判红，证明这组判据不是恒绿）
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const OUT = path.resolve(process.argv[2] || path.join('F:/临时', 今天, 'storm-audit'));
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';

const rawHtml = BEFORE
  ? execFileSync('git', ['-C', REPO, 'show', `${BEFORE}:city-life-framework.html`], { maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get Sim(){return Sim},get pix(){return pix},'
  +'get 雷雨场(){try{return (typeof 雷雨场===\'function\')?雷雨场:null}catch(e){return null}},'
  +'get 雷雨闪光(){try{return (typeof 雷雨闪光===\'function\')?雷雨闪光:null}catch(e){return null}}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(2); }

const PORT = 18974;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return; }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;

const browser = await chromium.launch({ executablePath: process.env.CITYLIFE_CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const 错 = [];
page.on('pageerror', e => 错.push('pageerror: ' + ((e && e.message) || e)));
await page.goto(URL_, { waitUntil: 'load' });
await page.waitForTimeout(2400);

const 找until = (要真) => page.evaluate(要真 => {
  let f = null; try { f = __pv.雷雨场; } catch (e) {}
  if (!f) return 要真 ? 100720 : 100719;          // 旧版没有雷雨概念：两景同貌，对照跑会判红
  for (let u = 100000; u < 101000; u++) { if (f({ weather: { rain: true, until: u } }) === 要真) return u; }
  return -1;
}, 要真);
const 真u = await 找until(true), 假u = await 找until(false);

const 找时刻 = (u, 要闪) => page.evaluate(([u, 要闪]) => {
  const st = __pv.state, w = st.world;
  w.weather.rain = true; w.weather.until = u;
  let f = null; try { f = __pv.雷雨闪光; } catch (e) {}
  if (!f) return 720;                              // 旧版：没有闪光
  for (let t = 600; t < 1200; t += 0.25) { w.t = t; const a = f(); if ((a > 0) === 要闪) return t; }
  return -1;
}, [u, 要闪]);
const 不闪刻 = await 找时刻(真u, false), 闪刻 = await 找时刻(真u, true);

const 摆 = (t, u, rm) => page.evaluate(([t, u, rm]) => {
  const st = __pv.state, w = st.world;
  w.speed = 0; st.llm.on = false; st.reduceMotion = rm;
  w.t = t; w.weather.rain = u >= 0; if (u >= 0) w.weather.until = u;
  st.cam.manual = true; st.cam.fx = 24; st.cam.fy = 15; st.selected = 'a1';
}, [t, u, rm]);
/* 量一次：均亮（整幅加权均值）＋蓝斑（b≥r+12 且 b≥110 的像素数）＋帧差（与上一次采样比，
   任一通道差 ≥12 的像素数——速度冻结下**只有雨丝在动**，帧差≈雨丝密度×速度）。 */
const 量 = () => page.evaluate(() => {
  const cv = document.querySelector('#cv'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const prev = window.__lastD;
  let 亮 = 0, 蓝 = 0, 差 = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    亮 += 0.2126 * r + 0.7152 * g + 0.0722 * b; n++;
    if (b >= r + 12 && b >= 110) 蓝++;
    if (prev) {
      const dr = Math.abs(r - prev[i]), dg = Math.abs(g - prev[i + 1]), db = Math.abs(b - prev[i + 2]);
      if (dr >= 12 || dg >= 12 || db >= 12) 差++;
    }
  }
  window.__lastD = d.slice(0);
  return { 均亮: 亮 / n, 蓝斑: 蓝, 差 };
});
const 采样 = async (n = 5) => {
  const 样 = [];
  for (let i = 0; i < n; i++) { await page.waitForTimeout(260); 样.push(await 量()); }
  const 均 = k => 样.reduce((a, x) => a + x[k], 0) / 样.length;
  let 差 = 0; for (let i = 1; i < 样.length; i++) 差 += 样[i].差; 差 /= Math.max(1, 样.length - 1);
  return { 均亮: Math.round(均('均亮') * 100) / 100, 蓝斑: Math.round(均('蓝斑')), 帧差: Math.round(差) };
};
const 一景 = async (名, t, u, rm, 图) => {
  await 摆(t, u, rm); await page.waitForTimeout(600);
  await 量();                                   // 丢弃一帧：把 __lastD 对到本场景，帧差从下一帧起算
  const r = await 采样(5);
  if (图) await page.locator('#cv').screenshot({ path: path.join(OUT, 图 + '.png') });
  console.log('  · ' + 名 + ' ' + JSON.stringify(r));
  return r;
};

console.log('雷雨探针：真u=' + 真u + '／假u=' + 假u + '／不闪刻=' + 不闪刻 + '／闪刻=' + 闪刻);
const 普通雨 = await 一景('普通雨', 不闪刻, 假u, false, '普通雨');
const 雷雨 = await 一景('雷雨', 不闪刻, 真u, false, '雷雨');
const 雷雨重复 = await 一景('雷雨·重复', 不闪刻, 真u, false);
const 晴 = await 一景('晴', 不闪刻, -1, false);
const 雷雨闪光 = await 一景('雷雨·闪光', 闪刻, 真u, false, '雷雨-闪光');
const 普通雨同刻 = await 一景('普通雨·同刻', 闪刻, 假u, false);
const 晴同刻 = await 一景('晴·同刻', 闪刻, -1, false);
const 雷雨减动效 = await 一景('雷雨·减动效', 不闪刻, 真u, true);
await browser.close(); srv.close();

const 断言 = [];
const 判 = (n, ok, 读数_) => { 断言.push({ n, ok, 读数_ }); console.log((ok ? ' ok  ' : ' FAIL ') + n + '  ' + JSON.stringify(读数_)); };
判('① 雷雨比普通雨暗（均亮 ≤ ×0.95）', 雷雨.均亮 <= 普通雨.均亮 * 0.95,
   { 雷雨: 雷雨.均亮, 普通雨: 普通雨.均亮, 比: Math.round(雷雨.均亮 / 普通雨.均亮 * 1000) / 1000 });
判('② 雷雨雨丝更密（帧差 ≥ 普通雨 ×1.25；速度冻结下只有雨丝在动）', 雷雨.帧差 >= 普通雨.帧差 * 1.25,
   { 雷雨: 雷雨.帧差, 普通雨: 普通雨.帧差, 晴: 晴.帧差 });
判('③ 雷雨两次跑稳定（均亮差 ≤0.4、帧差差 ≤25%）',
   Math.abs(雷雨重复.均亮 - 雷雨.均亮) <= 0.4 && Math.abs(雷雨重复.帧差 - 雷雨.帧差) <= 雷雨.帧差 * 0.25,
   { 均亮: [雷雨.均亮, 雷雨重复.均亮], 帧差: [雷雨.帧差, 雷雨重复.帧差] });
判('④ 闪光更亮（≥ 雷雨 ×1.10）', 雷雨闪光.均亮 >= 雷雨.均亮 * 1.10,
   { 闪光: 雷雨闪光.均亮, 雷雨: 雷雨.均亮 });
判('⑤ 普通雨在"闪刻"不闪（与普通雨相同 ≤0.4）', Math.abs(普通雨同刻.均亮 - 普通雨.均亮) <= 0.4,
   { 同刻: 普通雨同刻.均亮, 普通雨: 普通雨.均亮 });
判('⑥ 晴在"闪刻"不闪（与晴相同 ≤0.4）', Math.abs(晴同刻.均亮 - 晴.均亮) <= 0.4,
   { 同刻: 晴同刻.均亮, 晴: 晴.均亮 });
判('⑦ 雷雨·减动效 ≈ 晴（差 ≤1.5）', Math.abs(雷雨减动效.均亮 - 晴.均亮) <= 1.5,
   { 减动效: 雷雨减动效.均亮, 晴: 晴.均亮 });
判('⑧ 全程零 pageerror', 错.length === 0, { 错: 错.slice(0, 3) });

const 结论 = { 版本: BEFORE || '（工作区当前版本）', 真u, 假u, 不闪刻, 闪刻,
  场景: { 普通雨, 雷雨, 雷雨重复, 晴, 雷雨闪光, 普通雨同刻, 晴同刻, 雷雨减动效 }, 断言, 页面错误: 错,
  通过: 断言.every(x => x.ok) };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(结论, null, 2), 'utf8');
const 红 = 断言.filter(x => !x.ok).length;
console.log('\n雷雨探针：' + 红 + ' 条不过 / 共 ' + 断言.length + ' 条；报表在 ' + OUT);
process.exit(红 ? 1 : 0);
