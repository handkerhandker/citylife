// 把游戏仓库的成品同步进 APK 壳的 www/（只拷玩家要的东西：HTML ＋ assets）
// 用法：node sync-www.cjs
const fs = require('fs');
const path = require('path');

// 游戏仓库在中文路径下（AGP 不许**工程目录**带非 ASCII，但读那里没问题）；
// 本壳必须在纯 ASCII 路径（F:\codex\citylife-apk）——2026-10-04 打 APK 时实测踩出来的。
const 源 = 'F:\\资料\\codex\\云港小事\\citylife';
const 壳 = path.resolve(__dirname, 'www');

if (!fs.existsSync(path.join(源, 'city-life-framework.html'))) {
  console.error('找不到游戏仓库：' + 源);
  process.exit(1);
}
fs.rmSync(壳, { recursive: true, force: true });
fs.mkdirSync(壳, { recursive: true });
fs.copyFileSync(path.join(源, 'city-life-framework.html'), path.join(壳, 'index.html'));
fs.cpSync(path.join(源, 'assets'), path.join(壳, 'assets'), { recursive: true });

const 版本 = (fs.readFileSync(path.join(源, 'city-life-framework.html'), 'utf8').match(/id="set-build">([^<]*)</) || [])[1] || '?';
const 大小 = fs.readdirSync(壳).map(n => {
  const p = path.join(壳, n);
  const st = fs.statSync(p);
  return n + (st.isDirectory() ? '/' : ' ' + Math.round(st.size / 1024) + 'KB');
}).join('，');
console.log('已同步成品：版本 ' + 版本 + ' ⇒ ' + 壳 + '（' + 大小 + '）');
