// 第 248 单·启动图生成器（纯 node、零依赖；**复用图标生成器的画与 PNG 编码**——D 款一处定义）
//
// 为什么：默认启动图还是 Capacitor 模板的"白底蓝图"（每次开 App 第一眼），与 228 单换掉的
//   D 款图标不是一个东西。本工具把启动图换成：**与 AppTheme 同色（#171c26）的深色底 + 中央
//   那枚圆版 D 款图标**（星点是确定性的、不走 Math.random）。
// 用法：
//   node tools/icon-lab/make-splash.cjs --预览=F:\临时\<日期>\启动图
//   node tools/icon-lab/make-splash.cjs --安装        （写进 apk/android 的 res，并落 apk/splash-scheme.json）
// 口径：所有图都由本文件**现算**（同输入逐字节同输出）——check-splash.cjs 靠这一点做复算比对。
const fs = require('fs');
const path = require('path');
const gen = require('./make-icons.cjs');          // png／hash／取传统：与图标同一处定义

const REPO = path.resolve(__dirname, '../..');
const RES = path.join(REPO, 'apk/android/app/src/main/res');
const 底色顶 = [0x1c, 0x24, 0x34];                // 顶：比主题底 (#171c26) 略亮一档
const 底色底 = [0x15, 0x1a, 0x24];                // 底：与主题底同族
const 星色   = [0x2e, 0x3b, 0x55];

/* 11 张的目标尺寸＝壳里现存的 11 个 splash.png 的实际尺寸（照抄，不另立一套） */
const 目标s = [
  ['drawable',               480, 320],
  ['drawable-land-mdpi',     480, 320],
  ['drawable-land-hdpi',     800, 480],
  ['drawable-land-xhdpi',   1280, 720],
  ['drawable-land-xxhdpi',  1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable-port-mdpi',     320, 480],
  ['drawable-port-hdpi',     480, 800],
  ['drawable-port-xhdpi',    720, 1280],
  ['drawable-port-xxhdpi',   960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
];

function 画启动图(w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const t = h <= 1 ? 0 : y / (h - 1);
    const r = Math.round(底色顶[0] + (底色底[0] - 底色顶[0]) * t);
    const g = Math.round(底色顶[1] + (底色底[1] - 底色顶[1]) * t);
    const b = Math.round(底色顶[2] + (底色底[2] - 底色顶[2]) * t);
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255; }
  }
  /* 星点：xorshift 确定性取位（与 136 单环境音的噪声同款"零 Math.random"口径），
     尺寸随画面走（大图 3×3、小图 2×2），亮度只比底色高一档——是"夜空的颗粒"，不是噪点。 */
  const k = Math.min(w, h) >= 1000 ? 3 : 2;
  const 星数 = Math.round(w * h / 52000);
  let s = 0x9e3779b9 >>> 0;
  for (let i = 0; i < 星数; i++) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    const x = s % w;
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    const y = s % h;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= w || yy >= h) continue;
      const o = (yy * w + xx) * 4;
      out[o] = 星色[0]; out[o + 1] = 星色[1]; out[o + 2] = 星色[2];
    }
  }
  /* 中央：圆版 D 款图标（与桌面图标同一处画法），占短边 42%，四周留足呼吸 */
  const size = Math.round(Math.min(w, h) * 0.42);
  const art = gen.取传统('D', size, 'round');
  const ox = Math.round((w - size) / 2), oy = Math.round((h - size) / 2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const so = (y * size + x) * 4, a = art[so + 3] / 255;
    if (a <= 0) continue;
    const d = ((oy + y) * w + (ox + x)) * 4;
    out[d]     = Math.round(art[so]     * a + out[d]     * (1 - a));
    out[d + 1] = Math.round(art[so + 1] * a + out[d + 1] * (1 - a));
    out[d + 2] = Math.round(art[so + 2] * a + out[d + 2] * (1 - a));
    out[d + 3] = 255;
  }
  return out;
}

function 安装启动图() {
  const 记录 = { 方案: 'D', 名称: '简约昼夜·启动图', 资产: {} };
  for (const [dir, w, h] of 目标s) {
    const d = path.join(RES, dir);
    fs.mkdirSync(d, { recursive: true });
    const 文件 = path.join(d, 'splash.png');
    const 字节 = gen.png(w, h, 画启动图(w, h));
    fs.writeFileSync(文件, 字节);
    记录.资产[path.relative(REPO, 文件).replace(/\\/g, '/')] = gen.hash(字节);
  }
  fs.writeFileSync(path.join(REPO, 'apk/splash-scheme.json'), JSON.stringify(记录, null, 2) + '\n');
  return 记录;
}

function 主() {
  const 参 = {}; for (const a of process.argv.slice(2)) { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) 参[m[1]] = m[2]; else if (/^--/.test(a)) 参[a.slice(2)] = true; }
  if (参['安装']) { const r = 安装启动图(); console.log('已安装启动图（' + r.名称 + '）：' + Object.keys(r.资产).length + ' 个文件已登记到 apk/splash-scheme.json'); }
  if (参['预览']) {
    const dir = path.resolve(参['预览']); fs.mkdirSync(dir, { recursive: true });
    for (const [名, w, h] of [['启动图-land-1920x1280', 1920, 1280], ['启动图-port-1280x1920', 1280, 1920], ['启动图-land-800x480', 800, 480]]) {
      fs.writeFileSync(path.join(dir, 名 + '-预览.png'), gen.png(w, h, 画启动图(w, h)));
    }
    console.log('预览已写入 ' + dir);
  }
  if (!参['安装'] && !参['预览']) console.log('（什么都没做：加 --安装 或 --预览=<目录>）');
}
if (require.main === module) 主();
module.exports = { 画启动图, 目标s, 安装启动图 };
