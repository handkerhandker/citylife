// 第 83 单·诊断工具冒烟运行器
// 用法：node tools/smoke/run.cjs            只跑档 1（快、不用浏览器，约十几秒）
//       node tools/smoke/run.cjs --档2      档 1 ＋ 档 2（要浏览器，几分钟；浸泡是 5 分钟档）
//       node tools/smoke/run.cjs --列表     只印登记表与"有没有漏登记"（不跑）
// 输出一律落 `F:\临时\<今天>\tools-smoke\`（**绝不往仓库里写**）。
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { 仓库, 清单, 扫工具 } = require('./registry.cjs');

const 参数 = process.argv.slice(2);
const 只列表 = 参数.includes('--列表');
const 带档2 = 参数.includes('--档2');
// 本地日期（不用 toISOString：那是 UTC，跨零点会落到前一天）
const 现在 = new Date();
const 今天 = 现在.getFullYear() + '-' + String(现在.getMonth() + 1).padStart(2, '0') + '-' + String(现在.getDate()).padStart(2, '0');
const 输出根 = path.join('F:/临时', 今天, 'tools-smoke');
const 环境 = Object.assign({}, process.env, {
  CITYLIFE_CHROME: path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe'),
});
fs.mkdirSync(输出根, { recursive: true });

// ① 登记表完整性：仓库里每一支工具都必须在清单里（新工具不登记就判红）
const 登记了 = new Set(清单.map(x => x.路径));
const 实有 = 扫工具();
const 漏登记 = 实有.filter(x => !登记了.has(x));
const 幽灵 = [...登记了].filter(x => 实有.indexOf(x) < 0);
console.log('工具登记：实有 ' + 实有.length + ' 支 ／ 登记 ' + 清单.length + ' 支'
  + (漏登记.length ? ('　**漏登记：' + 漏登记.join(' / ') + '**') : '　（无漏登记）')
  + (幽灵.length ? ('　**登记了但文件不在：' + 幽灵.join(' / ') + '**') : ''));

// ② 档 1 不许带浏览器：按源码里有没有 playwright 判定（由构造保证"快档真快"）
const 带浏览器 = 清单.filter(x => x.档 === 1 && /playwright/.test(fs.readFileSync(path.join(仓库, x.路径), 'utf8')));
if (带浏览器.length) console.log('**档 1 里混进了要浏览器的工具：' + 带浏览器.map(x => x.路径).join(' / ') + '**');

if (只列表) {
  for (const x of 清单) console.log('  档' + x.档 + '  ' + x.路径.padEnd(44) + x.备注);
  process.exit((漏登记.length || 幽灵.length || 带浏览器.length) ? 1 : 0);
}

// ③ 跑：档 1 默认，--档2 时连档 2 一起
let 红 = 0, 跑 = 0;
for (const x of 清单) {
  if (x.档 === 0) continue;
  if (x.档 === 2 && !带档2) continue;
  const argv = x.参数.map(a => a.replace('{OUT}', 输出根));
  const r = spawnSync('node', [x.路径, ...argv], { cwd: 仓库, env: 环境, timeout: x.超时, encoding: 'utf8', maxBuffer: 1 << 28 });
  const 断 = r.error && r.error.code === 'ETIMEDOUT';
  const ok = r.status === 0 && !断;
  跑++; if (!ok) 红++;
  const 错 = String(r.stderr || '').split('\n').filter(Boolean).find(l => /Error|error:|cannot|undefined|not found/i.test(l)) || '';
  console.log((ok ? ' ok ' : ' 红 ') + (断 ? '超时' : String(r.status)).padStart(4) + '  ' + x.路径.padEnd(44) + 错.slice(0, 90));
}
console.log('\n冒烟（' + (带档2 ? '档 1＋2' : '档 1') + '）：跑了 ' + 跑 + ' 支，' + (红 ? (红 + ' 支跑不通') : '全部跑通')
  + '；输出在 ' + 输出根);
process.exit((红 || 漏登记.length || 幽灵.length || 带浏览器.length) ? 1 : 0);
