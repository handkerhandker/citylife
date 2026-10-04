// 第 191 单·把游戏版本写进 APK 的 versionCode / versionName。
//
// 为什么：从 v145 到 v155，每个包的 versionCode 都是 **1**（Capacitor 模板默认值从没动过）——
// 有些安装器/系统会把"同版本号"当成"已安装、不替换"，装来装去还是老包
// （真机反馈"装了新版啥变化都没有"的头号嫌疑；用 aapt 拆包实证：v155 包 versionCode='1'）。
// 口径：versionCode = 1000 + 游戏版本号（v155 ⇒ **1155**，随版本单调增长）；versionName = "vN"。
// 读不到版本号就**报错退出**（宁可构建失败，不要又出一个 versionCode=1 的包）。
//
// 用法：node set-version.cjs    （在 APK 壳目录里跑：仓库 apk/ 或 ASCII 镜像；读 www/index.html）
const fs = require('fs');
const path = require('path');

const 壳根 = __dirname;
const html路径 = path.join(壳根, 'www', 'index.html');
const gradle路径 = path.join(壳根, 'android', 'app', 'build.gradle');

const html = fs.readFileSync(html路径, 'utf8');
const m = /id="set-build">v(\d+)</.exec(html);
if (!m) { console.error('[set-version] 找不到游戏版本号（id="set-build">vN）'); process.exit(1); }
const N = parseInt(m[1], 10);
const 码 = 1000 + N, 名 = 'v' + N;

let g = fs.readFileSync(gradle路径, 'utf8');
if (!/versionCode\s+\d+/.test(g) || !/versionName\s+"[^"]*"/.test(g)) {
  console.error('[set-version] build.gradle 里找不到 versionCode/versionName'); process.exit(1);
}
g = g.replace(/versionCode\s+\d+/, 'versionCode ' + 码)
     .replace(/versionName\s+"[^"]*"/, 'versionName "' + 名 + '"');
fs.writeFileSync(gradle路径, g);
console.log('[set-version] 已写入构建版本：versionCode ' + 码 + ' · versionName ' + 名);
