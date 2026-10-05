// 第 228 单·桌面图标一致性检查（纯 node、零依赖，进冒烟档 1）
//
// 查三件：
//   ① `apk/icon-scheme.json` 台账在、方案合法（A/B/C/D）；
//   ② 台账里每个资产的 sha256 与磁盘现文件逐字节相等（防止"手改了一张图不记录"）；
//   ③ **复算**：拿本仓库生成器按同一方案重算 5 档密度的 4 张图＋两个自适应 XML＋背景色 XML，
//      与磁盘逐字节比对（生成器零依赖、同输入逐字节同输出，故这一条就是"图上得来路"的证明）。
// 退出码：0＝全绿；1＝有对不上的。
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../..');
const RES = path.join(REPO, 'apk/android/app/src/main/res');
const gen = require('./make-icons.cjs');

let 红 = 0;
const 判 = (名, ok, 注) => { if (!ok) 红++; console.log((ok ? ' ok ' : ' FAIL') + ' ' + 名 + (注 ? ('  ' + JSON.stringify(注)) : '')); };

// ① 台账
const 台账路径 = path.join(REPO, 'apk/icon-scheme.json');
let 台账 = null;
try { 台账 = JSON.parse(fs.readFileSync(台账路径, 'utf8')); } catch (e) { }
判('① icon-scheme.json 在且方案合法', !!台账 && !!gen.方案名[台账.方案],
  { 方案: 台账 && 台账.方案, 名称: 台账 && 台账.名称 });
const 方案 = 台账 && 台账.方案;

// ② 台账哈希 vs 磁盘
if (方案) {
  const 坏 = [];
  for (const [相对, 记] of Object.entries(台账.资产 || {})) {
    const p = path.join(REPO, 相对);
    if (!fs.existsSync(p)) { 坏.push(相对 + '（缺文件）'); continue; }
    if (gen.hash(fs.readFileSync(p)) !== 记) 坏.push(相对 + '（哈希不符）');
  }
  判('② 台账 23 个资产的 sha256 与磁盘逐字相等', 坏.length === 0, { 对不上: 坏.slice(0, 3) });
}

// ③ 复算：5 档 × 4 张图 + 两个自适应 XML + 背景色 XML
if (方案) {
  const 坏 = [];
  for (let i = 0; i < gen.密度.length; i++) {
    const dir = path.join(RES, 'mipmap-' + gen.密度[i][0]);
    const 四 = [
      ['ic_launcher.png', gen.png(gen.传统尺寸[i], gen.传统尺寸[i], gen.取传统(方案, gen.传统尺寸[i], 'squircle'))],
      ['ic_launcher_round.png', gen.png(gen.传统尺寸[i], gen.传统尺寸[i], gen.取传统(方案, gen.传统尺寸[i], 'round'))],
      ['ic_launcher_background.png', gen.png(gen.自适应尺寸[i], gen.自适应尺寸[i], gen.取自适应底(方案, gen.自适应尺寸[i]))],
      ['ic_launcher_foreground.png', gen.png(gen.自适应尺寸[i], gen.自适应尺寸[i], gen.取自适应前(方案, gen.自适应尺寸[i]))],
    ];
    for (const [名, 期望] of 四) {
      const p = path.join(dir, 名);
      if (!fs.existsSync(p) || !fs.readFileSync(p).equals(期望)) 坏.push(gen.密度[i][0] + '/' + 名);
    }
  }
  const XML = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n';
  for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const p = path.join(RES, 'mipmap-anydpi-v26', f);
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== XML) 坏.push('mipmap-anydpi-v26/' + f);
  }
  const COLOR = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#16233A</color>\n</resources>\n';
  const cp = path.join(RES, 'values/ic_launcher_background.xml');
  if (!fs.existsSync(cp) || fs.readFileSync(cp, 'utf8') !== COLOR) 坏.push('values/ic_launcher_background.xml');
  判('③ 复算：20 张图 + 2 个自适应 XML + 背景色 XML 与生成器逐字节一致', 坏.length === 0, { 对不上: 坏.slice(0, 3) });
}

console.log('图标一致性：' + 红 + ' 条不过');
process.exit(红 ? 1 : 0);
