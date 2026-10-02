// 第 34 单 · 行号引用门禁（linegate）——「写死的 html:NNN」的机器 reader
//
// 病根：活文档与门禁脚本里写死了一堆 `html:NNN`，它们**随每一单腐坏**，而全仓零 reader、零断言，
// 错了没有任何机器发现得了（第 30 单正向审计撞到过、第 31 单交付件点名过，只登记没治）。
// 第 34 单开工实测（v41）：活文档里 **12 处已经指错**——例：`html:1474` 声称是「剪辑保留上限」，
// 真身当日在 html:1744；`html:3021` 声称是 `let rainSeed=0;`，真身在 html:3712。
//
// 治法（把易腐的数字换成不腐的锚）：指路一律写 `src:<源码逐字片段>`，本门禁按**锚反查**——
// 断言该片段在 city-life-framework.html 里**逐字存在**。片段变了就判红，
// 而且**不需要人肉数行号**（报错时直接告诉你去搜什么）。
//
// 两条规则：
//   规则一 · `html:NNN` 只许出现在「历史快照块」与历史交付件里。
//            活文档（宪法／交接说明／待办）与门禁脚本里出现裸行号 ⇒ 判红。
//            历史快照块＝用 `【历史快照…】` 起、`【历史快照结束】` 止夹住的一段；
//            历史交付件（docs/交付、docs/规划）整体豁免——它们是**当时**的快照，改了反而失真。
//   规则二 · 每一个 `src:<片段>` 锚都必须能在 HTML 里逐字找到，找不到即判红。
//
// 反向自查（一条恒绿的闸等于没立）：一条坏锚、一条裸行号，必须都当场判红；
// 再喂生产原文，必须零命中。三条都跑，结果印在下面。

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HTML = fs.readFileSync(path.join(ROOT, 'city-life-framework.html'), 'utf8');

const 活文档   = ['宪法.md', '交接说明.md', '待办.md'];
const 门禁脚本 = ['versiongate.js', 'sim30.js', 'walkgate.js', 'harness.js', 'worldsig.js'];
const 豁免目录 = ['docs' + path.sep + '交付', 'docs' + path.sep + '规划'];
const 快照起 = '【历史快照', 快照止 = '【历史快照结束】';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL:', msg); } else console.log(' ok :', msg); };

// ── 抽两句判据，正反两侧喂同一段函数（照第 31／32／33 单先例）──────────────────
function 扫裸行号(text) {                    // 规则一：返回未豁免的 html:NNN
  const out = [];
  text.split(/\r?\n/).forEach((ln, i) => {
    if (ln.includes(快照止)) { return; }
    if (ln.includes(快照起)) { return; }
    const m = ln.match(/html:\d+/g);
    if (m) out.push({ 行: i + 1, 命中: m.join('／') });
  });
  return out;
}
function 扫裸行号带块状态(text) {            // 真跑用的版本：整块跳过
  const out = []; let 在快照 = false;
  text.split(/\r?\n/).forEach((ln, i) => {
    if (在快照) { if (ln.includes(快照止)) 在快照 = false; return; }
    if (ln.includes(快照起)) { 在快照 = true; return; }
    const m = ln.match(/html:\d+/g);
    if (m) out.push({ 行: i + 1, 命中: m.join('／') });
  });
  return out;
}
/* 占位符不是锚：教程／口径说明里要写「`src:<源码逐字片段>`」这种模板，
   尖括号包围或含省略号的**不算真锚**，否则写文档的人每写一次模板就被自己的闸判红一次。
   （代价：拿 `<…>` 去伪装锚可以绕过规则二；锚的用途是「帮人找到位置」，绕它没有收益，故不设防。） */
const 扫锚 = text => [...text.matchAll(/`src:([^`\n]+)`/g)]
  .map(m => m[1])
  // 判据收紧过一版：起初写成「含 < > … 一律算占位符」，结果把 `while(w.clips.length>CLIP_KEEP)`、
  // `(w.t-w.lastSpark)>200` 这两个**真锚**也滤掉了（锚数 19 → 15，覆盖掉了 4 处）。现在的口径是：
  // **整条被尖括号包住**（`<…>`）或含省略号才算占位符——真锚里的 `>` 一律放行。
  .filter(a => !/…/.test(a) && !/^<[^<>]+>$/.test(a));

const 读 = p => fs.readFileSync(p, 'utf8');

// ── 规则一 · 活文档与门禁脚本里不许有裸行号 ────────────────────────────────
{
  const 命中 = [];
  for (const f of 活文档.concat(门禁脚本)) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) { ok(false, '规则一：找不到 ' + f); continue; }
    扫裸行号带块状态(读(p)).forEach(h => 命中.push(f + ':' + h.行 + ' → ' + h.命中));
  }
  ok(命中.length === 0, '规则一·活文档与门禁脚本里零裸 `html:NNN`（实测 ' + 命中.length + ' 处）'
     + (命中.length ? '：\n     ' + 命中.slice(0, 12).join('\n     ') : '')
     + ' —— 指路请写 `src:<源码逐字片段>`，本闸按锚反查');
}

// ── 规则二 · 每个 src: 锚都必须在 HTML 里逐字存在 ──────────────────────────
{
  const 坏 = [], 全 = [];
  const 走 = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      // 本门禁自己跳过自己：文件里那几段是**反面样本**（合成一段坏锚喂给判据），不是「指路」。
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'app.js' || e.name === 'linegate.js') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { 走(p); continue; }
      if (!/\.(md|js|mjs)$/.test(e.name)) continue;
      if (豁免目录.some(d => p.includes(d))) continue;      // 历史交付件不查锚（可能引用当时的写法）
      for (const a of 扫锚(读(p))) {
        全.push(a);
        if (!HTML.includes(a)) 坏.push(path.relative(ROOT, p) + ' → src:' + a);
      }
    }
  };
  走(ROOT);
  ok(坏.length === 0, '规则二·' + 全.length + ' 个 `src:` 锚全部能在 city-life-framework.html 里逐字找到（实测找不到 '
     + 坏.length + ' 个）' + (坏.length ? '：\n     ' + 坏.slice(0, 12).join('\n     ') : ''));
  ok(全.length >= 15, '规则二构造成立：锚不是空表（实测 ' + 全.length + ' 个；太少说明有人把锚删了改回行号去了）');
}

// ── 反向自查 ───────────────────────────────────────────────────────────────
{
  // 病态一 · 裸行号（未豁免）必须被规则一抓到
  const sick1 = '这是一段活文档正文，里面有 html:999 这样的裸行号。';
  ok(扫裸行号带块状态(sick1).length === 1, '反向·规则一：未豁免的裸行号 `html:999` 当场判红');
  // 病态二 · 同一个行号落在豁免块里，必须放行（不误伤）
  const sick1b = 快照起 + '·行号勿按今日读】\n里面有 html:999。\n' + 快照止;
  ok(扫裸行号带块状态(sick1b).length === 0, '反向·规则一不误伤：豁免块内的行号放行');
  // 病态三 · 坏锚必须被规则二抓到
  const sick2 = '请看 `src:这段源码绝对不存在于本仓`。';
  const 坏锚 = 扫锚(sick2).filter(a => !HTML.includes(a));
  ok(坏锚.length === 1, '反向·规则二：指不到源码的坏锚当场判红');
  // 病态四 · 好锚不许误伤
  const good = '请看 `src:while(w.clips.length>CLIP_KEEP)`。';
  ok(扫锚(good).every(a => HTML.includes(a)), '反向·规则二不误伤：真锚照常放行');
  /* 下面两条是**补的**：本闸第一版把「含 < > … 一律算占位符」写成过滤条件，
     结果把 `while(w.clips.length>CLIP_KEEP)`、`(w.t-w.lastSpark)>200` 两个**真锚**滤掉了
     （锚数 19 → 15，4 处覆盖凭空消失，而闸照样全绿）。最坏样本补进门禁，免得再犯。 */
  ok(扫锚('`src:while(w.clips.length>CLIP_KEEP)`').length === 1,
     '反向·占位符判据不误伤：**含 `>` 的真锚照常入账**（本闸第一版正是栽在这里，锚数 19→15 而闸全绿）');
  ok(扫锚('`src:<源码逐字片段>`').length === 0 && 扫锚('`src:…`').length === 0,
     '反向·占位符判据：整条被尖括号包住的模板、以及含省略号的省略写法，都不算锚（写文档不必被自己的闸判红）');
}

console.log(fails ? ('\n' + fails + ' FAILURES') : '\n行号门禁 ALL PASS');
process.exit(fails ? 1 : 0);
