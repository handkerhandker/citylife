// 第 248 单·启动图一致性检查（纯 node、零依赖，进冒烟档 1）
//
// 查三件（与 check-icons 同款）：
//   ① `apk/splash-scheme.json` 台账在；
//   ② 台账里每个资产的 sha256 与磁盘现文件逐字节相等（防止"手改了一张图不记录"）；
//   ③ **复算**：按同一生成器重算 11 张 splash，与磁盘逐字节比对。
// 退出码：0＝全绿；1＝有对不上的。
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../..');
const gen = require('./make-icons.cjs');
const 匠 = require('./make-splash.cjs');

let 红 = 0;
const 判 = (名, ok, 注) => { if (!ok) 红++; console.log((ok ? ' ok ' : ' FAIL') + ' ' + 名 + (注 ? ('  ' + JSON.stringify(注)) : '')); };

const 台账路径 = path.join(REPO, 'apk/splash-scheme.json');
let 台账 = null;
try { 台账 = JSON.parse(fs.readFileSync(台账路径, 'utf8')); } catch (e) { }
判('① splash-scheme.json 在', !!台账, { 张数: 台账 && Object.keys(台账.资产 || {}).length });

if (台账) {
  const 坏 = [];
  for (const [相对, 记] of Object.entries(台账.资产 || {})) {
    const p = path.join(REPO, 相对);
    if (!fs.existsSync(p)) { 坏.push(相对 + '（缺文件）'); continue; }
    if (gen.hash(fs.readFileSync(p)) !== 记) 坏.push(相对 + '（哈希不符）');
  }
  判('② 台账 11 个资产的 sha256 与磁盘逐字相等', 坏.length === 0 && Object.keys(台账.资产 || {}).length === 匠.目标s.length, { 对不上: 坏.slice(0, 3) });
  const 坏2 = [];
  for (const [dir, w, h] of 匠.目标s) {
    const p = path.join(REPO, 'apk/android/app/src/main/res', dir, 'splash.png');
    const 期望 = gen.png(w, h, 匠.画启动图(w, h));
    if (!fs.existsSync(p) || !fs.readFileSync(p).equals(期望)) 坏2.push(dir + '/splash.png');
  }
  判('③ 复算：11 张启动图与生成器逐字节一致', 坏2.length === 0, { 对不上: 坏2.slice(0, 3) });
}

console.log('启动图一致性：' + 红 + ' 条不过');
process.exit(红 ? 1 : 0);
