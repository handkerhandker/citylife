// 第 42 单 · 第 32 单两条遗留的取证（**只读诊断**：不改产品代码，不进 gate.yml）
//
// 第 32 单（名牌分道）当时登记了两条遗留：
//   ① **名牌字号写死 10px、不随缩放走**（房间名反倒走 `Math.max(9,Math.min(12,s*0.7))`）；
//   ② **挤满四人时名牌摞到第 3 道、可能压住房间名**。
// 两条都只是「登记」，从没量过。本工具把它们量成数：
//   · 名牌盒 vs 精灵：宽高比、字号占精灵高度的比例——看「字号是不是真的失衡」；
//   · 名牌盒顶 vs 所在房间的房间名盒底：逐锚逐道算，看**到底有没有重叠**。
// 口径与源码同源（照 `chip()` 与人物绘制段逐字复算，不另立一套）：
//   精灵：`dw=s, dh=2s`，顶边 `dy0 = sy(脚底) + 0.5s - dh`；名牌盒 `[y-14, y+1]`，y = `dy0-4`，
//   分道再抬 `lane*15`；名牌宽 = `measureText(名字)`（10px）+ 8。
//   房间名：`chip(sx(r.x+r.w/2), sy(r.y)+16, r.label, …, Math.max(9,Math.min(12,s*0.7)))`。
//
// 用法：node tools/nameplate-audit/audit.mjs <输出目录>
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'docs/交付/第42单-图'));
const PORT = 18942;
fs.mkdirSync(OUT, { recursive: true });

const BEFORE = (process.argv.find(a => a.startsWith('--改前=')) || '').split('=')[1] || '';
const pre = BEFORE ? '改前-' : '';
const rawHtml = BEFORE
  ? execFileSync('git', ['show', `${BEFORE}:city-life-framework.html`], { cwd: REPO, maxBuffer: 1 << 28, encoding: 'utf8' })
  : fs.readFileSync(path.join(REPO, 'city-life-framework.html'), 'utf8');
const html = rawHtml.replace(/\}\)\(\);\s*<\/script>/,
  'window.__pv={get state(){return state},get pix(){return pix},get Sim(){return Sim},get SPOTS(){return STAND_SPOTS},get ctx(){return ctx}};\n})();\n</script>');
if (html === rawHtml) { console.error('注入点没找到'); process.exit(1); }

const MIME = { '.html': 'text/html;charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/' || u.endsWith('city-life-framework.html')) {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); return;
  }
  const p = path.join(REPO, u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(r);
}).listen(PORT);
const URL_ = `http://127.0.0.1:${PORT}/city-life-framework.html`;
const exe = process.env.CITYLIFE_CHROME || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: exe });
const settle = ms => new Promise(r => setTimeout(r, ms));

/* 在页面里按源码公式复算：逐锚 → 逐站位（四人）→ 贪心分道 → 与所在房间的房间名盒比 */
const 复算 = page => page.evaluate(() => {
  const st = __pv.state, Sim = __pv.Sim, SPOTS = __pv.SPOTS, s = st.view.s, ctx = __pv.ctx;
  const ANCH = Sim.ANCHORS, ROOMS = Sim.ROOMS;
  const sx = x => st.view.ox + x * s, sy = y => st.view.oy + y * s;
  const 人 = st.world.agents;
  const 名宽 = n => { ctx.font = '10px system-ui,sans-serif'; return ctx.measureText(n).width + 8; };
  const 结果 = [];
  for (const [锚名, spots] of Object.entries(SPOTS)) {
    const A = ANCH[锚名]; if (!A) continue;
    const room = ROOMS.find(r => r.id === A.room); if (!room) continue;
    // 逐人算「名牌盒」（含分道），贪心同 src:nameChip
    const boxes = [];
    人.forEach((ag, i) => {
      const o = spots[i % spots.length];
      const 脚底y = A.y + 0.5 + o[1];
      const dy0 = sy(脚底y) + 0.5 * s - 2 * s;
      const w = 名宽(ag.name), x = sx(A.x + 0.5 + o[0]);
      let lane = 0;
      while (lane < 人.length) {
        const 撞 = boxes.some(b => b.lane === lane && Math.abs(b.x - x) < (b.w + w) / 2 + 3);
        if (!撞) break;
        lane++;
      }
      const y = dy0 - 4 - lane * 15;               // chip 的 y 参数
      boxes.push({ 人: ag.name, lane, x, w, 盒顶: y - 14, 盒底: y + 1 });
    });
    // 房间名盒
    const fs2 = Math.max(9, Math.min(12, s * 0.7));
    ctx.font = fs2 + 'px system-ui,sans-serif';
    const 名宽2 = ctx.measureText(room.label).width + 8;
    const 名x = sx(room.x + room.w / 2), 名y = sy(room.y) + 16;
    const 名盒 = { 盒顶: 名y - 14, 盒底: 名y + 1, 左: 名x - 名宽2 / 2, 右: 名x + 名宽2 / 2, 宽: 名宽2 };
    const 重叠 = boxes.filter(b => b.盒顶 < 名盒.盒底 && 名盒.盒顶 < b.盒底
      && (b.x - b.w / 2) < 名盒.右 && 名盒.左 < (b.x + b.w / 2));
    结果.push({ 锚: 锚名, 房间: room.id, s, 精灵高: 2 * s, 精灵宽: s,
      字号: 10, 名牌宽: 名宽('顾云帆'), 房间名字号: Math.round(fs2 * 10) / 10, 房间名宽: Math.round(名宽2),
      最上盒顶: Math.min(...boxes.map(b => b.盒顶)), 房间名盒底: Math.round(名盒.盒底),
      盒间隙: Math.round(Math.min(...boxes.map(b => b.盒顶)) - 名盒.盒底),
      重叠人数: 重叠.length, 重叠: 重叠.map(b => b.人 + '·道' + b.lane) });
  }
  return 结果;
});

const 读数 = { 档: [], 截图: [] };
for (const [档名, vp] of [['桌面', { width: 1400, height: 900 }], ['手机竖屏', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(URL_); await settle(2600);
  await page.evaluate(() => { __pv.state.llm.on = false; __pv.state.reduceMotion = true; __pv.state.world.weather.rain = false; });
  // 把四人摆到指定锚（默认客厅餐桌＝第 32 单出事的那处），再复算全部多人锚；
  // **点名厨房**是因为复算显示它才是重叠最狠的那一处（手机档 −39px）
  const 摆 = async (锚) => page.evaluate((A0) => {
    const st = __pv.state, A = __pv.Sim.ANCHORS[A0], sp = __pv.SPOTS[A0];
    st.world.speed = 0; st.cam.manual = true; st.cam.fx = A.x + 0.5; st.cam.fy = A.y + 0.5;
    st.world.agents.forEach((ag, i) => {
      const o = sp[i % sp.length], v = st.vis[ag.id];
      v.x = v.dspX = A.x + 0.5 + o[0]; v.y = v.dspY = A.y + 0.5 + o[1];
      v.path = []; v.moving = false;
    });
  }, 锚);
  await 摆('home_table');
  await settle(500);
  const r = await 复算(page);
  读数.档.push({ 档: 档名, 视口: vp, 复算: r });
  const f = pre + '名牌与房间名-' + 档名 + '.png';
  await page.screenshot({ path: path.join(OUT, f) });
  读数.截图.push(f);
  // 另拍两张**最难看的那两处**（厨房／便利店收银台）——重叠是算出来的，得看一眼才知道多难看
  for (const 锚 of ['kitchen', 'store_counter']) {
    await 摆(锚); await settle(450);
    const g = pre + '重叠现场-' + 锚 + '-' + 档名 + '.png';
    await page.screenshot({ path: path.join(OUT, g) });
    读数.截图.push(g);
  }
  /* ── 帧内普查（本单最硬的那条判据）────────────────────────────────────
     几何重叠只说明「会撞」，真正要验的是**撞了之后有没有画**。故在真页面里给 `fillText` 挂钩子，
     抓一帧的全部落字，看该房间的名字在不在里面：人在那儿 ⇒ 不该出现（让位）；人走开 ⇒ 该出现。 */
  const 帧内落字 = async (锚) => {
    await 摆(锚); await settle(300);
    return page.evaluate(() => new Promise(res => {
      const ctx = __pv.ctx, 原 = ctx.fillText.bind(ctx), 收 = [];
      ctx.fillText = (s, x, y) => { 收.push(String(s)); return 原(s, x, y); };
      setTimeout(() => { ctx.fillText = 原; res(收); }, 260);
    }));
  };
  const 户内 = ['living', 'kitchen', 'bedroom'];   // 公寓三间（有名牌挤在一起的那几处都在其中）
  const 普查 = [];
  for (const 锚 of ['home_table', 'kitchen', 'store_counter', 'home_tv']) {
    const 字 = await 帧内落字(锚);
    const room = await page.evaluate(a => __pv.Sim.ANCHORS[a].room, 锚);
    const 房名 = await page.evaluate(r => __pv.Sim.ROOMS.find(x => x.id === r).label, room);
    const 出现 = 字.includes(房名);
    const 该出现 = !['home_table', 'kitchen', 'store_counter', 'home_tv'].includes(锚) ? true : false;
    普查.push({ 锚, 房间: room, 房名, 房名有没有画出来: 出现, 落字总数: 字.length });
  }
  // 再验一条「不误伤」：把人摆到客厅餐桌（不在厨房），厨房名**应当**画出来
  {
    const 字 = await 帧内落字('home_table');
    const 厨房名 = await page.evaluate(() => __pv.Sim.ROOMS.find(x => x.id === 'kitchen').label);
    普查.push({ 锚: '(人在客厅餐桌)', 房间: 'kitchen', 房名: 厨房名, 房名有没有画出来: 字.includes(厨房名), 落字总数: 字.length, 备注: '不误伤：厨房里没人 ⇒ 厨房名应当照画' });
  }
  读数.档[读数.档.length - 1].帧内普查 = 普查;
  console.log('── 帧内落字普查（' + 档名 + '）──');
  for (const x of 普查) console.log('  ' + x.锚.padEnd(16) + x.房间.padEnd(10) + '「' + x.房名 + '」画出来了吗：' + (x.房名有没有画出来 ? '画了' : '没画') + (x.备注 ? '   ← ' + x.备注 : ''));
  console.log('\n=== ' + 档名 + '（s=' + r[0].s + '）===');
  console.log('锚'.padEnd(14) + '房间'.padEnd(10) + '精灵宽×高   名牌宽  房间名字号  最上盒顶−房间名盒底  重叠');
  for (const x of r) {
    console.log(x.锚.padEnd(14) + x.房间.padEnd(10) + (x.精灵宽 + '×' + x.精灵高).padEnd(12)
      + String(x.名牌宽).padEnd(8) + String(x.房间名字号).padEnd(12) + String(x.盒间隙).padEnd(20)
      + (x.重叠人数 ? (x.重叠人数 + ' 人：' + x.重叠.join('、')) : '无'));
  }
  await ctx.close();
}
fs.writeFileSync(path.join(OUT, pre + '读数.json'), JSON.stringify(读数, null, 2), 'utf8');
await browser.close(); srv.close();
const 总重叠 = 读数.档.reduce((n, d) => n + d.复算.reduce((m, x) => m + x.重叠人数, 0), 0);
console.log('\n两个视口合计重叠：' + 总重叠 + ' 处');
console.log('完成：', OUT);
