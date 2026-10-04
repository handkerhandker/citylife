// 第 194 单·出包链的第三道闸：**cap sync 有没有把页面真拷进壳**。
//
// 为什么：这一链上有过两次"静默不生效"的教训——
//   ① v145–v155 的 versionCode 一直是模板默认 1（第 191 单修，出包后 aapt 复查兜底）；
//   ② `apk/www` 镜像曾停在 v152 而游戏已经 v153（第 189 单顺带追平）。
// 这条管的是第三步：`npx cap sync android` 要把 `www/` 拷进
// `android/app/src/main/assets/public/`——**没拷成或拷了一半**，出出来的包就是"装了个寂寞"。
// 校验口径：两份 `index.html` 逐字节相同（长度 + 内容），否则拒绝出包。
//
// 用法：node check-www-copy.cjs   （在 APK 壳目录里跑：仓库 apk/ 或 ASCII 镜像）
// 退出码：0＝一致；1＝不一致/壳内缺文件。
const fs = require('fs');
const path = require('path');

const 壳根 = __dirname;
const 源 = path.join(壳根, 'www', 'index.html');
const 壳内 = path.join(壳根, 'android', 'app', 'src', 'main', 'assets', 'public', 'index.html');

if (!fs.existsSync(源)) { console.error('[check-www-copy] 找不到 ' + 源 + '（先跑 sync-www.cjs）'); process.exit(1); }
if (!fs.existsSync(壳内)) { console.error('[check-www-copy] 壳里没有 assets/public/index.html（cap sync 没跑或没拷成）'); process.exit(1); }

const a = fs.readFileSync(源);
const b = fs.readFileSync(壳内);
if (a.length !== b.length || !a.equals(b)) {
  console.error('[check-www-copy] www/index.html（' + a.length + ' B）与壳内 assets/public/index.html（' + b.length + ' B）不一致');
  console.error('                  ⇒ cap sync 没把页面拷进壳，拒绝出包；重跑 `npx cap sync android` 再看。');
  process.exit(1);
}
console.log('[check-www-copy] 页面已逐字节拷进壳（' + a.length + ' B）');
