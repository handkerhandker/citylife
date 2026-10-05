// 第 249 单·批后审计修：把"HTML → app.js 解包"收成**一处定义**。
// 为什么：harness／sim30／walkgate 与约 20 支探针都 `require('./app.js')`，而 app.js 是**派生产物**——
//   单跑时若忘了重解包，行为层就会**静默跑旧副本**（第 249 单故障注入实证：HTML 里把"入秋首日"
//   错抄成入冬的 3/4 处，单跑 harness 全绿——因为它读的是上一次解包的 app.js）。
//   门禁第 1 步本来每次都解包（所以门禁是现场）；本轮把这一步收进本工具：
//   **门禁第 1 步／harness 启动／冒烟清单首位**都走它，单跑也保证现场。
// 用法：node tools/lib/sync-app.cjs           （把 HTML 里的内联脚本解包写到仓库根 app.js）
//       node tools/lib/sync-app.cjs --检查    （只查不写：一致退出 0、是旧副本退出 1）
const fs = require('fs');
const path = require('path');
const 仓库 = path.resolve(__dirname, '../..');
const HTML = path.join(仓库, 'city-life-framework.html');
const APP = path.join(仓库, 'app.js');

function 提取() {
  const h = fs.readFileSync(HTML, 'utf8');
  const m = /<script>([\s\S]*)<\/script>/.exec(h);
  if (!m) throw new Error('HTML 里找不到 <script> 块');
  return m[1];
}
function 同步() {
  const 脚本 = 提取();
  const 旧 = fs.existsSync(APP) ? fs.readFileSync(APP, 'utf8') : null;
  const 需 = 旧 !== 脚本;
  if (需) fs.writeFileSync(APP, 脚本, 'utf8');
  console.log('app.js：' + (需 ? '已从 HTML 刷新' : '与 HTML 当场一致') + '（' + 脚本.length + ' 字节）');
  return { 需, 字节: 脚本.length };
}
function 主() {
  if (process.argv.includes('--检查')) {
    const 脚本 = 提取();
    const 现 = fs.existsSync(APP) ? fs.readFileSync(APP, 'utf8') : null;
    if (现 === 脚本) { console.log('app.js 与 HTML 当场一致（' + 脚本.length + ' 字节）'); process.exit(0); }
    console.log('**app.js 是旧副本**（磁盘 ' + (现 === null ? '缺文件' : 现.length) + ' 字节 ≠ HTML 当场 ' + 脚本.length + ' 字节）');
    process.exit(1);
  }
  同步();
}
if (require.main === module) 主();
module.exports = { 提取, 同步 };
