// 第 176 单·三指纹对账探针（只读诊断，进冒烟档 1）
//
// 为什么要有它：世界指纹由门禁自己打印（每单都看得见），而「门禁指纹」和「SIM 块 md5」
// 一直靠人工抄——第 176 单批后审计实测抓到：门禁指纹自第 172 单（v140）起就已变化
// （a0586627… → b6cf5bf5…），而 172／174／175 三单仍沿用旧值写「原样」。
// 与第 28 单「零 reader 的量必然漂移」同型，治法也一样：把三个数落成**台账 ＋ 机器对账**。
//
// 口径（写死，改动等于换口径，须按宪法第 10 条重新入档）：
//   世界指纹 ＝ `node worldsig.js` 的输出（一行 32 位 md5）
//   门禁指纹 ＝ `node sim30.js` 整份 stdout 字节的 md5（含末尾换行）
//   SIM 块 md5 ＝ HTML 里 /*SIM-START*/ 与 /*SIM-END*/ 之间源码的 md5
// 三个数一律**从当前 HTML 现解**（写进临时目录跑，不读仓库里可能过期的 app.js）。
//
// 用法：
//   node tools/fingerprint/probe.cjs           对账：三个数全对 ⇒ exit 0；漂移 ⇒ exit 1
//   node tools/fingerprint/probe.cjs --登记     世界真变了、确认无误后把当前三个数写进台账
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const 仓库 = path.resolve(__dirname, '../..');
const 台账路径 = path.join(仓库, 'fingerprint-ledger.json');
const 登记 = process.argv.includes('--登记');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');

const html = fs.readFileSync(path.join(仓库, 'city-life-framework.html'), 'utf8');
const 版本 = (html.match(/id="set-build">([^<]*)</) || [])[1] || '?';
const 脚本 = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1];
const 块 = (html.match(/\/\*SIM-START\*\/([\s\S]*?)\/\*SIM-END\*\//) || [])[1];
if (!脚本 || !块) { console.log('判红：HTML 里找不到内联脚本或 SIM 块'); process.exit(1); }

// 现解到临时目录（本作规矩：AI 临时产物一律落 F:\临时\<日期>\）
const d = new Date();
const 今天 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const 沙盒 = path.join('F:/临时', 今天, 'fingerprint-tmp');
fs.mkdirSync(沙盒, { recursive: true });
fs.writeFileSync(path.join(沙盒, 'app.js'), 脚本);
for (const f of ['sim30.js', 'worldsig.js']) fs.copyFileSync(path.join(仓库, f), path.join(沙盒, f));

const 跑 = f => spawnSync('node', [f], { cwd: 沙盒, maxBuffer: 1 << 28 });
const r30 = 跑('sim30.js');
if (r30.status !== 0) { console.log('判红：sim30.js 跑不动（退出码 ' + r30.status + '）'); process.exit(1); }
const rws = 跑('worldsig.js');
if (rws.status !== 0) { console.log('判红：worldsig.js 跑不动（退出码 ' + rws.status + '）'); process.exit(1); }

const 现值 = {
  版本,
  世界指纹: String(rws.stdout).trim(),
  门禁指纹: md5(r30.stdout),
  SIM块md5: md5(Buffer.from(块, 'utf8')),
};

const 台账 = JSON.parse(fs.readFileSync(台账路径, 'utf8'));
const 记为 = 台账['当前'];
const 键 = ['世界指纹', '门禁指纹', 'SIM块md5'];
const 差 = 键.filter(k => 现值[k] !== 记为[k]);

console.log('三指纹对账（第 176 单立）：HTML 现解，不读仓库 app.js');
console.log('  界面版本 ' + 版本 + '（台账记录的版本 ' + 记为.版本 + '）');
for (const k of 键) console.log('  ' + (现值[k] === 记为[k] ? ' ok ' : ' 红 ') + ' ' + k + ' ' + 现值[k] + (现值[k] === 记为[k] ? '' : '（台账 ' + 记为[k] + '）'));

if (登记) {
  if (差.length) 台账['历史'] = [...(台账['历史'] || []), { 版本: 记为.版本, 世界指纹: 记为.世界指纹, 门禁指纹: 记为.门禁指纹, SIM块md5: 记为.SIM块md5, 备注: '第 176 单 --登记 自动转入历史' }];
  台账['当前'] = { ...现值, 更新: 今天 + '（' + 版本 + ' --登记）' };
  fs.writeFileSync(台账路径, JSON.stringify(台账, null, 2) + '\n');
  console.log('已写入台账：' + path.relative(仓库, 台账路径) + '（历史 ' + (台账['历史'] || []).length + ' 条）——记得在交付件里写明这次是世界真变了。');
  process.exit(0);
}

if (差.length) {
  console.log('判红：' + 差.join('／') + ' 与台账不一致。');
  console.log('  若是本单真动了世界（属预期）：核对读数后跑 `node tools/fingerprint/probe.cjs --登记` 更新台账，并在交付件里写明。');
  console.log('  若是没动的单：说明有东西在悄悄改世界/门禁，先查根因，别急着登记。');
  process.exit(1);
}
console.log('三指纹一致（对账通过）');
