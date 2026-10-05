// 第 228 单·桌面图标生成器（纯 node、零依赖；生成"传统方圆两套 + 自适应两件套"）
//
// 用法：
//   node tools/icon-lab/make-icons.cjs --方案=D --预览=F:\临时\<日期>\图标预览
//   node tools/icon-lab/make-icons.cjs --方案=D --安装        （写进 apk/android 的 res，并落 apk/icon-scheme.json）
// 口径：所有图都由本文件**现算**（同输入逐字节同输出）——check-icons.cjs 靠这一点做复算比对。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const REPO = path.resolve(__dirname, '../..');
const RES = path.join(REPO, 'apk/android/app/src/main/res');
const 方案名 = { A: '暖窗', B: '江灯', C: '猫看城', D: '简约昼夜' };

/* ---------- 最小 PNG 编码器 ---------- */
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (~c) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); }
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const hash = b => require('crypto').createHash('sha256').update(b).digest('hex');

/* ---------- 48×48 像素网格（A／B／C 三款像素风）---------- */
const N = 48;
const grid = () => Array.from({ length: N }, () => new Array(N).fill(null));
const px = (g, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < N && y >= 0 && y < N && c) g[y][x] = c; };
const rect = (g, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, c); };
const hline = (g, x0, x1, y, c) => { for (let x = x0; x <= x1; x++) px(g, x, y, c); };
const disc = (g, cx, cy, r, c) => { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(g, x, y, c); };
const ring = (g, cx, cy, r0, r1, c) => { for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) { const d = Math.hypot(x - cx, y - cy); if (d >= r0 && d <= r1) px(g, x, y, c); } };
const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
function renderGrid(g, size, mask) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.min(N - 1, Math.floor(x * N / size)), sy = Math.min(N - 1, Math.floor(y * N / size));
    const c = g[sy][sx];
    let a = 255;
    if (mask === 'round') { const r = size / 2 - 1; a = Math.hypot(x - size / 2 + .5, y - size / 2 + .5) <= r ? 255 : 0; }
    else if (mask === 'squircle') { const p = size * 0.20; const dx = Math.max(p - x, x - (size - p), 0), dy = Math.max(p - y, y - (size - p), 0); a = Math.hypot(dx, dy) <= p ? 255 : 0; }
    const o = (y * size + x) * 4; const [r, gg, b] = c ? hex(c) : [0, 0, 0];
    rgba[o] = r; rgba[o + 1] = gg; rgba[o + 2] = b; rgba[o + 3] = c ? a : 0;
  }
  return rgba;
}
function iconWarmWindow() {
  const g = grid();
  rect(g, 0, 0, 48, 48, '#141d2e'); rect(g, 0, 12, 48, 4, '#172033'); rect(g, 0, 16, 48, 5, '#1a2436');
  for (const [x, y] of [[6, 7], [11, 4], [40, 6], [44, 13], [8, 15], [36, 4], [17, 9], [31, 6], [3, 12], [45, 3]]) px(g, x, y, '#8fa3c0');
  disc(g, 38, 10, 5.4, '#f4efe2'); disc(g, 36.4, 8.6, 4.8, '#141d2e');
  rect(g, 6, 21, 36, 26, '#3b4c66'); rect(g, 6, 21, 36, 1, '#4d6180'); rect(g, 6, 45, 36, 3, '#202c3e');
  rect(g, 6, 21, 1, 26, '#2c3a50'); rect(g, 41, 21, 1, 26, '#2c3a50');
  for (const wx of [9, 21, 33]) { rect(g, wx, 24, 6, 5, '#1b2635'); rect(g, wx, 24, 6, 1, '#14202f'); }
  rect(g, 9, 33, 6, 5, '#1b2635'); rect(g, 33, 33, 6, 5, '#1b2635');
  px(g, 11, 26, '#8a6a45'); px(g, 35, 35, '#8a6a45');
  rect(g, 18, 30, 13, 13, '#6b4f33'); rect(g, 19, 31, 11, 11, '#ffb85c'); rect(g, 20, 32, 9, 9, '#fff3cf');
  px(g, 22, 33, '#1f1f26'); px(g, 25, 33, '#1f1f26'); rect(g, 21, 34, 6, 3, '#1f1f26'); rect(g, 21, 37, 6, 3, '#1f1f26');
  px(g, 22, 35, '#e8c65a'); px(g, 25, 35, '#e8c65a');
  px(g, 27, 38, '#1f1f26'); px(g, 28, 37, '#1f1f26'); px(g, 28, 36, '#1f1f26');
  return g;
}
function iconLanterns() {
  const g = grid();
  rect(g, 0, 0, 48, 48, '#0b1522');
  for (const [x, y] of [[6, 6], [13, 3], [22, 8], [41, 5], [45, 15], [3, 17], [18, 15], [30, 4]]) px(g, x, y, '#8fa3c0');
  ring(g, 34, 11, 5.4, 6.6, '#1c2a3f'); disc(g, 34, 11, 5.2, '#f4efe2');
  rect(g, 0, 29, 48, 3, '#111b29');
  rect(g, 4, 26, 5, 3, '#182436'); px(g, 6, 27, '#ffb85c');
  rect(g, 14, 25, 6, 4, '#182436'); px(g, 16, 26, '#ffb85c');
  rect(g, 40, 27, 5, 2, '#182436'); px(g, 42, 27, '#ffb85c');
  rect(g, 0, 32, 48, 16, '#15324a');
  for (const [x, y] of [[3, 35], [12, 35], [22, 36], [33, 35], [41, 36], [7, 40], [18, 41], [28, 40], [38, 41], [2, 44], [14, 45], [24, 44], [36, 45], [44, 44]]) hline(g, x, x + 3, y, '#1f4763');
  for (let i = 0; i < 13; i++) { const y = 33 + i, w = (i % 3 === 1) ? 3 : 1; for (let k = 0; k < w; k++) px(g, 33 + k - (w - 1) / 2 - (i % 2), y, i % 2 ? '#5f7488' : '#33506c'); }
  const 灯 = (cx, cy, s) => { rect(g, cx - s, cy - s + 1, s * 2, s * 2 - 2, '#e8c65a'); rect(g, cx - s + 1, cy - s + 2, s * 2 - 2, s * 2 - 4, '#fff3cf'); for (let i = 0; i < 3; i++) px(g, cx - 1 + (i % 2), cy + s + 1 + i * 2, '#6a5a2e'); };
  灯(12, 40, 2); 灯(24, 36, 3); 灯(36, 37, 2);
  return g;
}
function iconCatWindow() {
  const g = grid();
  rect(g, 0, 0, 48, 48, '#2a2019'); rect(g, 2, 2, 44, 44, '#5a4028'); rect(g, 2, 2, 44, 1, '#7a5a38');
  rect(g, 4, 4, 40, 40, '#26344e'); rect(g, 4, 20, 40, 10, '#1b2740'); rect(g, 4, 30, 40, 14, '#16202f');
  for (const [x, y] of [[10, 9], [17, 7], [40, 11], [8, 17], [29, 8], [43, 18]]) px(g, x, y, '#8fa3c0');
  disc(g, 36, 13, 3.6, '#f4efe2');
  rect(g, 6, 35, 9, 5, '#1f2c42'); px(g, 8, 37, '#ffb85c'); px(g, 12, 37, '#ffb85c');
  rect(g, 17, 33, 9, 7, '#26344e'); px(g, 19, 35, '#ffb85c'); px(g, 23, 37, '#ffb85c');
  rect(g, 28, 36, 10, 4, '#1f2c42'); px(g, 31, 37, '#ffb85c');
  rect(g, 4, 40, 40, 4, '#8a6a45'); rect(g, 4, 40, 40, 1, '#a8845a');
  px(g, 20, 26, '#0d0d12'); px(g, 24, 26, '#0d0d12'); rect(g, 19, 27, 7, 4, '#0d0d12'); rect(g, 18, 31, 8, 9, '#0d0d12');
  px(g, 26, 34, '#0d0d12'); px(g, 27, 33, '#0d0d12'); px(g, 27, 32, '#0d0d12');
  px(g, 18, 30, '#5a5a6a'); px(g, 18, 31, '#5a5a6a'); px(g, 18, 32, '#5a5a6a'); px(g, 19, 30, '#5a5a6a');
  px(g, 20, 29, '#e8c65a'); px(g, 27, 30, '#5a5a6a');
  return g;
}

/* ---------- D 款·简约昼夜（扁平；太阳=暖金圆盘＋光芒，月亮=冷白月牙）----------
   同一套绘制逻辑同时供三种输出：'legacy'（完整构图）／'bg'（全幅渐变）／'fg'（自适应前景，元素收进安全区）。 */
function renderFlat(kind, size) {
  const SS = 2, S = size * SS;
  const buf = Buffer.alloc(size * size * 4);
  const lerp = (a, b, t) => a + (b - a) * t;
  const 块 = [[0.00, 0.09, 0.72], [0.09, 0.16, 0.60], [0.16, 0.27, 0.68], [0.27, 0.37, 0.56],
              [0.37, 0.48, 0.70], [0.48, 0.585, 0.62], [0.585, 0.70, 0.54], [0.70, 0.82, 0.66],
              [0.82, 0.91, 0.58], [0.91, 1.00, 0.70]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let R = 0, G = 0, B = 0, A = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = (x + (sx + .5) / SS) / size, v = (y + (sy + .5) / SS) / size;
      const day = u < 0.5;
      let r, g, b, a = 255;
      if (kind === 'fg') {
        r = g = b = 0; a = 0;
        const 缩放 = 0.62, 中心 = 0.5;
        const uu = (u - 中心) / 缩放 + 中心, vv = (v - 中心) / 缩放 + 中心;
        const 日 = uu < 0.5;
        // 天际线：**横向用原始坐标铺满整幅**（两头伸到遮罩外），只把"高度"收进安全区
        let 有楼 = false, 楼色 = 日 ? [138, 82, 50] : [11, 19, 32];
        for (const [p0, p1, top] of 块) { const t0 = 中心 + (top - 中心) * 缩放; if (u >= p0 && u < p1 && v > t0) { 有楼 = true; } }
        if (有楼) { r = 楼色[0]; g = 楼色[1]; b = 楼色[2]; a = 255; }
        // 太阳（暖金＋八道光芒）：**光晕用"亮色的半透明"**，绝不能是"不透明的暗色"
        const 日心x = 中心 + (0.21 - 中心) * 缩放, 日心y = 中心 + (0.21 - 中心) * 缩放;
        const 日d = Math.hypot(u - 日心x, v - 日心y) * size;
        if (日d < size * 0.125 * 缩放) { const k = 1 - 日d / (size * 0.125 * 缩放); r = 255; g = 214; b = 130; a = Math.round(255 * Math.min(1, k * 0.5)); }
        if (日d < size * 0.060 * 缩放) { r = 255; g = 202; b = 92; a = 255; }
        if (日d < size * 0.042 * 缩放) { r = 255; g = 232; b = 156; a = 255; }
        { const per = Math.PI / 4, ang = Math.atan2(v - 日心y, u - 日心x); let t = ((ang % per) + per) % per; const 距 = Math.min(t, per - t), d = 日d / (size * 缩放); if (d > 0.068 && d < 0.106 && 距 < 0.20) { r = lerp(r, 255, .9); g = lerp(g, 212, .85); b = lerp(b, 118, .7); a = 255; } }
        // 月亮（冷白月牙）
        const 月心x = 中心 + (0.79 - 中心) * 缩放, 月心y = 中心 + (0.21 - 中心) * 缩放;
        const 月d = Math.hypot(u - 月心x, v - 月心y) * size, 挖d = Math.hypot(u - (月心x + 0.022 * 缩放), v - (月心y - 0.012 * 缩放)) * size;
        if (月d < size * 0.085 * 缩放) { const k = 1 - 月d / (size * 0.085 * 缩放); r = 208; g = 222; b = 248; a = Math.round(255 * Math.min(1, k * 0.4)); }
        if (月d < size * 0.060 * 缩放 && 挖d > size * 0.048 * 缩放) { r = 236; g = 242; b = 252; a = 255; }
        // 亮窗（夜）／暗窗（昼）——与楼群一样，横向用原始坐标
        for (const [wx, wy] of [[0.655, 0.60], [0.735, 0.70], [0.845, 0.62]]) {
          const cy = 中心 + (wy - 中心) * 缩放, wv = Math.max(Math.abs(u - wx), Math.abs(v - cy));
          if (wv < 0.016 * 缩放 && !日) { r = 255; g = 220; b = 150; a = 255; }
          else if (wv < 0.028 * 缩放 && !日) { const k = 1 - (wv - 0.016 * 缩放) / (0.012 * 缩放); r = lerp(r, 255, k * .9); g = lerp(g, 200, k * .8); b = lerp(b, 120, k * .6); a = Math.max(a, Math.round(255 * k * .5)); }
        }
        for (const [wx, wy] of [[0.205, 0.64], [0.335, 0.66]]) {
          const cy = 中心 + (wy - 中心) * 缩放;
          if (日 && Math.max(Math.abs(u - wx), Math.abs(v - cy)) < 0.014 * 缩放) { r = 92; g = 52; b = 32; a = 255; }
        }
      } else {
        if (day) { r = lerp(255, 240, v); g = lerp(208, 150, v); b = lerp(128, 84, v); } else { r = lerp(26, 10, v); g = lerp(40, 16, v); b = lerp(66, 28, v); }
        if (kind === 'legacy') {
          for (const [p0, p1, top] of 块) if (u >= p0 && u < p1 && v > top) { if (day) { r = 138; g = 82; b = 50; } else { r = 11; g = 19; b = 32; } }
          const 日d = Math.hypot(u - 0.21, v - 0.21) * size, 月d = Math.hypot(u - 0.79, v - 0.21) * size;
          if (日d < size * 0.125) { const k = 1 - 日d / (size * 0.125); r = lerp(r, 255, k * .45); g = lerp(g, 205, k * .34); b = lerp(b, 110, k * .22); }
          if (日d < size * 0.060) { r = 255; g = 202; b = 92; }
          if (日d < size * 0.042) { r = 255; g = 232; b = 156; }
          { const per = Math.PI / 4, ang = Math.atan2(v - 0.21, u - 0.21); let t = ((ang % per) + per) % per; const 距 = Math.min(t, per - t), d = 日d / size; if (d > 0.068 && d < 0.106 && 距 < 0.20) { r = lerp(r, 255, .55); g = lerp(g, 212, .5); b = lerp(b, 118, .4); } }
          const 挖d = Math.hypot(u - 0.812, v - 0.198) * size;
          if (月d < size * 0.085) { const k = 1 - 月d / (size * 0.085); r = lerp(r, 205, k * .22); g = lerp(g, 220, k * .22); b = lerp(b, 250, k * .28); }
          if (月d < size * 0.060 && 挖d > size * 0.048) { r = 236; g = 242; b = 252; }
          for (const [wx, wy] of [[0.655, 0.60], [0.735, 0.70], [0.845, 0.62]]) { const wv = Math.max(Math.abs(u - wx), Math.abs(v - wy)); if (wv < 0.016) { r = 255; g = 220; b = 150; } else if (wv < 0.028 && !day) { const k = 1 - (wv - 0.016) / 0.012; r = lerp(r, 255, k * .35); g = lerp(g, 200, k * .35); b = lerp(b, 120, k * .35); } }
          for (const [wx, wy] of [[0.205, 0.64], [0.335, 0.66]]) if (day && Math.max(Math.abs(u - wx), Math.abs(v - wy)) < 0.014) { r = 92; g = 52; b = 32; }
        }
      }
      R += r; G += g; B += b; A += a;
    }
    const n = SS * SS, o = (y * size + x) * 4;
    buf[o] = Math.round(R / n); buf[o + 1] = Math.round(G / n); buf[o + 2] = Math.round(B / n); buf[o + 3] = Math.round(A / n);
  }
  if (kind !== 'fg') {
    const p = size * 0.20;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = Math.max(p - x, x - (size - p), 0), dy = Math.max(p - y, y - (size - p), 0);
      if (Math.hypot(dx, dy) > p) buf[(y * size + x) * 4 + 3] = 0;
    }
  }
  return buf;
}
function renderFlatRound(size) {
  const b = renderFlat('legacy', size);
  const r = size / 2 - 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (Math.hypot(x - size / 2 + .5, y - size / 2 + .5) > r) b[(y * size + x) * 4 + 3] = 0;
  return b;
}

/* ---------- 三档输出的取图器 ---------- */
const 像素图 = { A: iconWarmWindow, B: iconLanterns, C: iconCatWindow };
function 取传统(方案, size, 形) {
  if (方案 === 'D') return 形 === 'round' ? renderFlatRound(size) : renderFlat('legacy', size);
  return renderGrid(像素图[方案](), size, 形 === 'round' ? 'round' : 'squircle');
}
function 取自适应底(方案, size) {
  if (方案 === 'D') return renderFlat('bg', size);
  return renderGrid(像素图[方案](), size, null);   // A／B／C 暂以整幅当底（换款时再按安全区细化）
}
function 取自适应前(方案, size) {
  if (方案 === 'D') return renderFlat('fg', size);
  return Buffer.alloc(size * size * 4);            // A／B／C 前景留空（内容都在底层）
}

/* ---------- 安装到壳 ---------- */
const 密度 = [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]];
const 传统尺寸 = [48, 72, 96, 144, 192];
const 自适应尺寸 = [108, 162, 216, 324, 432];
function 安装2(方案) {
  const 记录 = { 方案, 名称: 方案名[方案], 资产: {} };
  for (let i = 0; i < 密度.length; i++) {
    const dir = path.join(RES, 'mipmap-' + 密度[i][0]);
    fs.mkdirSync(dir, { recursive: true });
    const 传统 = 传统尺寸[i], 自适 = 自适应尺寸[i];
    const 列表 = [
      ['ic_launcher.png', 取传统(方案, 传统, 'squircle'), 传统],
      ['ic_launcher_round.png', 取传统(方案, 传统, 'round'), 传统],
      ['ic_launcher_background.png', 取自适应底(方案, 自适), 自适],
      ['ic_launcher_foreground.png', 取自适应前(方案, 自适), 自适],
    ];
    for (const [名, buf, 尺寸] of 列表) { const 文件 = path.join(dir, 名); const 字节 = png(尺寸, 尺寸, buf); fs.writeFileSync(文件, 字节); 记录.资产[path.relative(REPO, 文件).replace(/\\/g, '/')] = hash(字节); }
  }
  // 自适应 XML：底图与前景都指到 mipmap
  for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const p = path.join(RES, 'mipmap-anydpi-v26', f);
    fs.writeFileSync(p, '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n');
    const 字节 = fs.readFileSync(p); 记录.资产[path.relative(REPO, p).replace(/\\/g, '/')] = hash(字节);
  }
  // 背景色（老系统/兜底引用）跟昼夜中缝的夜色调
  const cp = path.join(RES, 'values/ic_launcher_background.xml');
  fs.writeFileSync(cp, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#16233A</color>\n</resources>\n');
  记录.资产[path.relative(REPO, cp).replace(/\\/g, '/')] = hash(fs.readFileSync(cp));
  fs.writeFileSync(path.join(REPO, 'apk/icon-scheme.json'), JSON.stringify(记录, null, 2) + '\n');
  return 记录;
}

/* ---------- 命令行（被 require 时不执行）---------- */
function 主() {
  const 参 = {}; for (const a of process.argv.slice(2)) { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) 参[m[1]] = m[2]; else if (/^--/.test(a)) 参[a.slice(2)] = true; }
  const 方案 = (参['方案'] || 'D').toUpperCase();
  if (!方案名[方案]) { console.error('方案必须是 A/B/C/D'); process.exit(2); }
  if (参['安装']) { const r = 安装2(方案); console.log('已安装方案 ' + 方案 + '（' + r.名称 + '）：' + Object.keys(r.资产).length + ' 个文件已登记到 apk/icon-scheme.json'); }
  if (参['预览']) {
    const dir = path.resolve(参['预览']); fs.mkdirSync(dir, { recursive: true });
    for (const [形, 名] of [['squircle', '方'], ['round', '圆']]) fs.writeFileSync(path.join(dir, 方案 + '-' + 方案名[方案] + '-' + 名 + '-576.png'), png(576, 576, 取传统(方案, 576, 形)));
    console.log('预览已写入 ' + dir);
  }
  if (!参['安装'] && !参['预览']) console.log('（什么都没做：加 --安装 或 --预览=<目录>）');
}
if (require.main === module) 主();
module.exports = { png, hash, 方案名, 取传统, 取自适应底, 取自适应前, 密度, 传统尺寸, 自适应尺寸 };
