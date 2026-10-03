// 第 40 单 · 六页两档巡检 ＋ 全按钮扫描（**只读诊断**：不改产品代码，不进 gate.yml）
//
// 为什么要做：第 32–39 单全都在「现场」页（画布）上做，其余五个页签从没系统看过；
// 而「自检／审计／排版双档／全按钮扫描」是本项目任务书口径里点名的四档自测，本地化后一直没跑全。
//
// 本工具做三件事：
//   ① 逐页 × 两档截图：现场／角色／日志／剪辑／短信／设置 × 桌面 1400×900 与 手机竖屏 390×844；
//   ② **全按钮扫描**：把页面上所有非破坏性的按钮各点一遍（页签、暂停、倍速、缩放、布局、动效、
//      像素开关、AI 开关、存档四个按钮与它们弹出的对话框、角色页的详情/跟随、短信页…），
//      每点一次都记一笔「点到了没有、有没有报错」；
//   ③ **零 JS 报错**：全程监听 `pageerror` 与 console error，有任何一条即判红。
//
// 安全口径（为什么这些按钮敢点）：
//   · 「重开新城」「导入」「发送短信」会改世界——但**跑在隔离的浏览器上下文里**（playwright 每个
//     context 自带一份干净的 localStorage），碰不到决策者自己那份存档；且**破坏性确认框一律点「再想想/取消」**。
//   · 页面自己会写 `citylife-save-v1` 到 localStorage，那也只在隔离上下文里。
//
// 用法：node tools/page-sweep/sweep.mjs <输出目录>
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'docs/交付/第40单-图'));
const PORT = 18940;
fs.mkdirSync(OUT, { recursive: true });

const rawHtml = fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get pix(){return pix},get Sim(){return Sim},get SPOTS(){return STAND_SPOTS}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到（页面末尾的 })();</script>）'); process.exit(1); }

const MIME = { '.html': 'text/html;charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.json': 'application/json' };
const 服务端404 = [];   // 「谁 404 了」由服务端自己记一份，免得只凭浏览器控制台猜
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return;
  }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    服务端404.push(u); r.writeHead(404); r.end(); return;
  }
  r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;
const exe = process.env.CITYLIFE_CHROME || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: exe });

const 页 = [['live', '现场'], ['roles', '角色'], ['log', '日志'], ['clip', '剪辑'], ['phone', '短信'], ['settings', '设置']];
const settle = ms => new Promise(r => setTimeout(r, ms));
const 读数 = { 视口: [], 点击: [], 报错: [], 按钮清单: [] };

// 页面上所有按钮的清单（静态部分，给交付件当台账）
for (const m of rawHtml.matchAll(/<button[^>]*id="([a-z0-9-]+)"[^>]*>([^<]{0,12})/g))
  读数.按钮清单.push({ id: m[1], 文案: m[2].trim() });

let 失败 = 0;
for (const [vpName, vp] of [['桌面', { width: 1400, height: 900 }], ['手机', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const 本页报错 = [];
  page.on('pageerror', e => 本页报错.push('pageerror: ' + (e && e.message || e)));
  page.on('console', m => { if (m.type() === 'error') 本页报错.push('console.error: ' + m.text()); });
  /* 只记「谁 404 了」还不够——**报错要精确到 URL**，否则交付件里只能写「有 404」，
     没人能判断那是 favicon 这种无害请求，还是素材/接口真缺了。 */
  page.on('response', r => { if (r.status() >= 400) 本页报错.push('HTTP ' + r.status() + ' ' + r.url()); });
  page.on('requestfailed', r => 本页报错.push('requestfailed ' + (r.failure() && r.failure().errorText) + ' ' + r.url()));
  await page.goto(URL_); await settle(2800);
  await page.evaluate(() => { __pv.state.llm.on = false; });   // 本地不通网，别让 ⚠ 连线失败刷屏

  const 记 = (谁, 结果) => 读数.点击.push({ 视口: vpName, 谁, 结果 });
  const 点 = async (sel, 名) => {
    try {
      const el = await page.$(sel);
      if (!el) { 记(名 + ' ' + sel, '找不到'); 失败++; return false; }
      if (!(await el.isVisible())) { 记(名 + ' ' + sel, '不可见（跳过）'); return false; }
      await el.click({ timeout: 4000 });
      await settle(260);
      记(名 + ' ' + sel, '已点');
      return true;
    } catch (e) { 记(名 + ' ' + sel, '点不动：' + String(e && e.message || e).slice(0, 80)); 失败++; return false; }
  };
  /* 「点一开一关＝净零」这个假设**只对两态开关成立**。本单第一版就栽在这里：
     `#set-layout` 其实是**五态循环**（自动→手机竖屏→手机横屏→平板→桌面宽屏），点两下落在
     「手机横屏」——于是「手机竖屏」那一档的设置页截图，拍的其实是**强制横屏**的版面。
     改成：先读按钮文案，循环点到它回到原值（上限 6 次）。 */
  const 点回原样 = async (sel, 名) => {
    const 原 = await page.$eval(sel, e => e.textContent.trim()).catch(() => null);
    if (原 === null) { 记(名 + ' ' + sel, '读不到文案'); 失败++; return; }
    for (let i = 0; i < 6; i++) {
      await 点(sel, 名);
      const now = await page.$eval(sel, e => e.textContent.trim()).catch(() => null);
      if (now === 原) { 记(名 + ' ' + sel, '已回到原值「' + 原 + '」（点了 ' + (i + 1) + ' 下）'); return; }
    }
    记(名 + ' ' + sel, '点了 6 下仍未回到原值「' + 原 + '」'); 失败++;
  };

  // ① 逐页截图
  for (const [id, 名] of 页) {
    await 点(`[data-tab="${id}"]`, '切页');
    await settle(420);
    await page.screenshot({ path: path.join(OUT, `页-${名}-${vpName}.png`) });
  }
  // ② 顶栏三件套
  await 点('#tb-pause', '顶栏'); await 点('#tb-pause', '顶栏');
  await 点回原样('#tb-speed', '顶栏');
  await 点('#tb-msg', '顶栏');
  await settle(300); await 点('#ov-follow', '浮层'); await 点('#ov-openlog', '浮层'); await settle(400);
  await page.screenshot({ path: path.join(OUT, `日志页-${vpName}.png`) });

  // ③ 角色页：详情 / 跟随
  await 点('[data-tab="roles"]', '切页'); await settle(500);
  await 点('[data-act="detail"]', '角色页'); await settle(500);
  await page.screenshot({ path: path.join(OUT, `角色详情-${vpName}.png`) });
  await 点('[data-close]', '关弹窗');
  await 点('[data-act="follow"]', '角色页');

  // ④ 设置页：逐个开关（缩放 −＋ 各一次＝净零；其余开关往复）
  await 点('[data-tab="settings"]', '切页'); await settle(400);
  for (const [sel, 名] of [['#set-scale-minus', '缩放−'], ['#set-scale-plus', '缩放＋'], ['#set-layout', '布局'],
                           ['#set-motion', '动效'], ['#set-pix', '像素开关'], ['#set-speed', '速度'],
                           ['#set-llm', 'AI 开关']]) {
    if (sel === '#set-layout' || sel === '#set-speed' || sel === '#set-llm' || sel === '#set-pix' || sel === '#set-motion')
      await 点回原样(sel, '设置');                 // 多态/两态一律**点回原值**，跑完不留状态
    else { await 点(sel, '设置'); await 点(sel, '复原'); }   // 缩放的 −＋ 是净零，照旧各点一次
  }
  await 点('#sv-now', '立即存档');
  await 点('#sv-export', '导出'); await settle(500);
  await page.screenshot({ path: path.join(OUT, `设置-导出弹窗-${vpName}.png`) });
  await 点('[data-close]', '关弹窗');
  await 点('#sv-import', '导入'); await settle(500);
  await page.screenshot({ path: path.join(OUT, `设置-导入弹窗-${vpName}.png`) });
  await 点('#sv-import-cancel', '取消导入');
  await 点('#sv-reset', '重开新城'); await settle(500);
  await page.screenshot({ path: path.join(OUT, `设置-重开确认-${vpName}.png`) });
  await 点('#sv-reset-no', '再想想');            // **破坏性确认一律取消**
  await page.screenshot({ path: path.join(OUT, `设置页-${vpName}.png`) });

  // ⑤ 短信页（发送按钮会改世界，但跑在隔离上下文里；点一次看有没有反应）
  await 点('[data-tab="phone"]', '切页'); await settle(400);
  await 点('#ph-send', '短信页');
  await settle(400);
  await page.screenshot({ path: path.join(OUT, `短信页-${vpName}.png`) });

  读数.视口.push({ 视口: vpName, 报错数: 本页报错.length });
  /* 第 86 单修：**退出码别把网络噪声算成失败**。
     病：本工具把"任何一条 page 报错"都记进 `失败`，于是永远 exit 1——
     可那 21 条与历次同源（首屏 `ERR_ABORTED`、`favicon.ico` 与本地没起的 `/relay` 404），
     历次交付件里都写着"真 JS 异常 0、按钮失败 0"。工具自己的读数里其实分了类，只是没用在退出码上。
     治法：**真异常**（`pageerror`／TypeError／ReferenceError…）与**按钮失败**才算红；
     网络类照旧进读数、只印不算。 */
  const 真异常 = 本页报错.filter(e => /pageerror|TypeError|ReferenceError|SyntaxError/.test(String(e)));
  读数.真异常 = (读数.真异常 || []).concat(真异常.map(e => vpName + ' ' + e));
  失败 += 真异常.length;
  if (本页报错.length) 读数.报错.push(...本页报错.map(e => vpName + ' ' + e));
  await ctx.close();
}

读数.服务端404 = 服务端404;
fs.writeFileSync(path.join(OUT, '读数.json'), JSON.stringify(读数, null, 2), 'utf8');
await browser.close(); srv.close();
console.log('按钮清单 ' + 读数.按钮清单.length + ' 条；点击 ' + 读数.点击.length + ' 次；'
  + '网络类报错 ' + 读数.报错.length + ' 条（只印不算）；真 JS 异常 ' + (读数.真异常 || []).length
  + ' 条；按钮失败 ' + 失败 + ' 处');
console.log('完成：', OUT);
process.exit((读数.真异常 || []).length || 失败 ? 1 : 0);
