// 第 196 单·出包链第四道闸：**APK 里那份 index.html 与游戏仓库逐字节相同**。
// 第 159 单补记：**APK 里那份 `capacitor.config.json` 也要与壳根一致**——159 单修复的心脏
//   就在配置里的 `insetsHandling:"disable"`（插件别把 WebView 缩进安全区）；配置没进包＝改了等于没改。
//
// 为什么：前三道闸守的是"链上各步"（versionCode 写没写进去／www 镜像同不同步／
// cap sync 拷没拷进壳），但"最后装进 APK 的那份页面"一直没有机器核对——
// 第 194 单把它照实登记成缺口。这条补上：出包后把 APK 里的
// `assets/public/index.html` 解出来，与 `www/index.html` 逐字节比对。
//
// 解包用什么：JDK 自带的 `jar xf`（不引入任何新依赖；build-apk.bat 里 JAVA_HOME 已设）。
// 产物落 `out\verify\`（F 盘、纯 ASCII 路径），核对完即删。
//
// 用法：
//   node check-embedded.cjs [apk路径] [期望页面路径]
//   默认：out/citylife-debug.apk  ×  www/index.html
// 退出码：0＝逐字节相同；1＝缺文件/解包失败/不一致。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const 壳根 = __dirname;
const apk = path.resolve(process.argv[2] || path.join(壳根, 'out', 'citylife-debug.apk'));
const 期望 = path.resolve(process.argv[3] || path.join(壳根, 'www', 'index.html'));
const 工作 = path.join(壳根, 'out', 'verify');

function 失败(msg) { console.error('[check-embedded] ' + msg); process.exit(1); }

if (!fs.existsSync(apk)) 失败('找不到 APK：' + apk);
if (!fs.existsSync(期望)) 失败('找不到期望页面：' + 期望 + '（先跑 sync-www.cjs）');

const javaHome = process.env.JAVA_HOME || '';
const jar = path.join(javaHome, 'bin', 'jar.exe');
if (!fs.existsSync(jar)) 失败('找不到 jar.exe（JAVA_HOME 未设或不对）：' + jar);

fs.rmSync(工作, { recursive: true, force: true });
fs.mkdirSync(工作, { recursive: true });
try {
  const r = spawnSync(jar, ['xf', apk, 'assets/public/index.html', 'assets/capacitor.config.json'], { cwd: 工作, encoding: 'utf8' });
  if (r.status !== 0) 失败('从 APK 解包失败：' + String(r.stderr || r.stdout || '').trim());
  const 内 = path.join(工作, 'assets', 'public', 'index.html');
  if (!fs.existsSync(内)) 失败('APK 里没有 assets/public/index.html');

  const a = fs.readFileSync(期望);
  const b = fs.readFileSync(内);
  const sha = buf => require('crypto').createHash('sha256').update(buf).digest('hex');
  if (a.length !== b.length || !a.equals(b)) {
    失败('APK 内嵌页面与仓库不一致：仓库 ' + a.length + ' B（' + sha(a).slice(0, 12) + '…）／'
       + 'APK 内 ' + b.length + ' B（' + sha(b).slice(0, 12) + '…）');
  }

  /* 第 159 单补记·配置核对：语义比对（排序键后逐字比），不跟缩进/换行计较。 */
  const 规整 = o => Array.isArray(o) ? o.map(规整)
    : (o && typeof o === 'object'
       ? Object.keys(o).sort().reduce((acc, k) => { acc[k] = 规整(o[k]); return acc; }, {})
       : o);
  const 配置期望路径 = path.join(壳根, 'capacitor.config.json');
  const 配置内路径 = path.join(工作, 'assets', 'capacitor.config.json');
  if (!fs.existsSync(配置期望路径)) 失败('找不到壳根 capacitor.config.json：' + 配置期望路径);
  if (!fs.existsSync(配置内路径)) 失败('APK 里没有 assets/capacitor.config.json');
  let 配置期望值, 配置内值;
  try { 配置期望值 = JSON.parse(fs.readFileSync(配置期望路径, 'utf8')); }
  catch (e) { 失败('壳根 capacitor.config.json 不是合法 JSON：' + e.message); }
  try { 配置内值 = JSON.parse(fs.readFileSync(配置内路径, 'utf8')); }
  catch (e) { 失败('APK 内 capacitor.config.json 不是合法 JSON：' + e.message); }
  if (JSON.stringify(规整(配置期望值)) !== JSON.stringify(规整(配置内值))) {
    失败('APK 内嵌 capacitor.config.json 与壳根不一致：壳根 ' + JSON.stringify(规整(配置期望值))
       + '／APK 内 ' + JSON.stringify(规整(配置内值)));
  }
  const 处理方式 = ((配置内值.plugins || {}).SystemBars || {}).insetsHandling;
  console.log('[check-embedded] APK 内嵌页面与仓库逐字节相同（' + a.length + ' B，sha256 ' + sha(a).slice(0, 12)
    + '…）；配置一致（insetsHandling=' + 处理方式 + '）');
} finally {
  fs.rmSync(工作, { recursive: true, force: true });
}
