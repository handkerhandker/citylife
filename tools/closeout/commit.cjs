// 第 140 单·提交器（工作流工具；快、不需要浏览器，进冒烟档 1 跑 --自测）
//
// 用法：
//   正式：node tools/closeout/commit.cjs --消息=<文件> [--快照] [--快照脚本=<ps1>]
//   预演：加 --试运行（只印将提交什么、消息原文，不落任何提交）
//   检查：--检查交付（只跑"交付入口自检"：清单有没有点名最新包／根网页版与素材对不对版）
//   自测：--自测（沙盒 git 仓库 8 场景）
//
// 为什么：提交消息走 `git commit -F <文件>`——**消息原文只存在于文件里**，不经过任何 shell 的引号规则。
//   教训（第 136 单开工前）：含英文双引号的消息经 PowerShell 传递时被拆包，git 把半截当 pathspec 拒了；
//   同类风险还有换行、反引号、$、中文全角引号……让它们永远不经过 shell，这一类就整类消失。
// 口径：① 消息文件必须**非空**（宁可红，不许产出空消息提交）；
//   ② 工作树无改动 ⇒ 拒绝（不产出空提交）；
//   ③ git 命令一律 `spawnSync('git', [数组])`——**不经 shell**；
//   ④ `--快照` 在提交成功后跑项目的 snapshot.ps1 -Force（本地备份兜底），失败则整体退出码红；
//   ⑤ 提交成功印 `git log -1 --oneline` 作为回执；
//   ⑥ 第 300 单·交付入口自检（提交前）：最新包若已放进 outputs，交付清单必须点名它；
//      项目根的"网页版"拷贝（若在）版本号必须与当前一致、两张素材与仓库一致——防"清单点旧包／双击白屏"再发生。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const 默认快照 = 'F:/资料/codex/云港小事/tools/backup/snapshot.ps1';

const 解析参数 = argv => {
  const o = {};
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) o[m[1]] = m[2];
    else if (/^--[^=]+$/.test(a)) o[a.slice(2)] = true;
  }
  return o;
};
const git = (根, args) => spawnSync('git', ['-C', 根, ...args], { encoding: 'utf8' });

/* ── 第 300 单·交付入口自检 ─────────────────────────────────────────
   outputs 与根网页版都在仓库**外**，CI 上看不到 ⇒ 只在本地跑、目标不存在就跳过；
   自测沙盒用环境变量指路：CITYLIFE_DELIVERY_DIR / CITYLIFE_ROOT_HTML / CITYLIFE_ROOT_ASSETS。 */
const crypto = require('crypto');
const 版本号 = html => { const m = /id="set-build">(v\d+)</.exec(String(html || '')); return m ? m[1] : null; };
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
function 交付自检(根) {
  const 提示 = [];
  let html = null;
  try { html = fs.readFileSync(path.join(根, 'city-life-framework.html'), 'utf8'); } catch (_) { return 提示; }
  const ver = 版本号(html);
  if (!ver) return 提示;
  const 交付 = process.env.CITYLIFE_DELIVERY_DIR || path.resolve(根, '../outputs');
  const apk = path.join(交付, 'citylife-debug-' + ver + '.apk');
  const readme = path.join(交付, 'README-交付清单.md');
  if (fs.existsSync(apk)) {
    if (!fs.existsSync(readme)) 提示.push('outputs 已有 ' + path.basename(apk) + '，但交付清单缺失：' + readme);
    else if (fs.readFileSync(readme, 'utf8').indexOf('citylife-debug-' + ver + '.apk') < 0)
      提示.push('交付清单没点名最新包 citylife-debug-' + ver + '.apk（改 outputs/README-交付清单.md 的"该装哪个"）');
  }
  const 网页 = process.env.CITYLIFE_ROOT_HTML || path.resolve(根, '../city-life-framework.html');
  if (fs.existsSync(网页)) {
    const v2 = 版本号(fs.readFileSync(网页, 'utf8'));
    if (v2 !== ver) 提示.push('项目根网页版不是当前版（' + (v2 || '空/坏') + ' ≠ ' + ver + '）——用当前 HTML 覆盖一份');
    const 素材 = process.env.CITYLIFE_ROOT_ASSETS || path.resolve(根, '../assets');
    for (const f of ['apartment.png', 'characters.png']) {
      const a = path.join(素材, f), b = path.join(根, 'assets', f);
      const 同 = fs.existsSync(a) && fs.existsSync(b) && sha256(fs.readFileSync(a)) === sha256(fs.readFileSync(b));
      if (!同) 提示.push('项目根 assets/' + f + ' 与仓库不一致（或缺失）——从仓库 assets/ 拷一份');
    }
  }
  return 提示;
}

/* 核心：提交 +（可选）快照。任何一步不合格都 throw；返回回执。 */
function 提交(根, 消息文件, 快照脚本) {
  const 消息 = fs.readFileSync(消息文件, 'utf8');
  if (!消息.trim()) throw new Error('消息文件是空的——不产出空消息提交');
  const 测 = git(根, ['status', '--porcelain']);
  if (测.status !== 0) throw new Error('git status 失败：' + (测.stderr || '').trim());
  if (!测.stdout.trim()) throw new Error('工作树没有改动——不产出空提交');
  const 交付提示 = 交付自检(根);
  if (交付提示.length) throw new Error('交付入口自检未过：\n  - ' + 交付提示.join('\n  - '));
  const 加 = git(根, ['add', '-A']);
  if (加.status !== 0) throw new Error('git add -A 失败：' + (加.stderr || '').trim());
  const 提 = git(根, ['commit', '-F', 消息文件]);
  if (提.status !== 0) throw new Error('git commit 失败：' + ((提.stderr || 提.stdout) || '').trim());
  const 一行 = (git(根, ['log', '-1', '--oneline']).stdout || '').trim();
  let 快照 = null;
  if (快照脚本) {
    const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 快照脚本, '-Force'], { encoding: 'utf8' });
    快照 = { 退出码: r.status, 首行: ((r.stdout || '').split('\n')[0] || '').trim() };
    if (r.status !== 0) throw new Error('快照失败（退出码 ' + r.status + '）：' + ((r.stderr || '').trim()));
  }
  return { 一行, 快照 };
}

/* ── 自测：沙盒 git 仓库 5 场景 ─────────────────────────────────────── */
function 自测() {
  const 今 = new Date();
  const 日 = 今.getFullYear() + '-' + String(今.getMonth() + 1).padStart(2, '0') + '-' + String(今.getDate()).padStart(2, '0');
  const 父 = 'F:/临时/' + 日;
  fs.mkdirSync(父, { recursive: true });
  const 根 = fs.mkdtempSync(path.join(父, 'commit-selftest-'));
  const 消息目录 = 根 + '-msg';           // 消息文件放仓库**外**：免得被 add -A 卷进提交、干扰"无改动"场景
  fs.mkdirSync(消息目录);
  const 步 = [];
  const 记 = (名, ok, 详) => { 步.push({ 名, ok, 详 }); console.log((ok ? ' ok  ' : ' FAIL ') + 名 + '  ' + (详 || '')); };
  // 沙盒仓库：本地身份即可，不动全局 git 配置
  git(根, ['init', '-q']);
  git(根, ['config', 'user.name', '自测']);
  git(根, ['config', 'user.email', 'selftest@local']);
  fs.writeFileSync(path.join(根, 'a.txt'), '第一版\n');
  const 消息1 = path.join(消息目录, '消息1.txt');
  fs.writeFileSync(消息1, '自测消息：含 "英文引号"、\n换行、`反引号`、$符号 与 中文括号（）——原样入库');
  // ① 核心提交：消息逐字入库
  {
    const r = 提交(根, 消息1, null);
    const 原样 = (git(根, ['log', '-1', '--format=%B']).stdout || '').replace(/\n+$/, '');
    const 期望 = fs.readFileSync(消息1, 'utf8').replace(/\n+$/, '');
    记('① 正常提交：含引号/换行/反引号/中文的消息**逐字**入库', 原样 === 期望 && r.一行.length > 0, r.一行);
  }
  // ② 空消息 ⇒ 拒
  {
    const 空 = path.join(消息目录, '空消息.txt'); fs.writeFileSync(空, '   \n');
    let 拒 = false, 详 = '';
    try { 提交(根, 空, null); } catch (e) { 拒 = true; 详 = e.message; }
    记('② 空消息文件 ⇒ 拒绝', 拒 && /空/.test(详), 详.slice(0, 40));
  }
  // ③ 无改动 ⇒ 拒
  {
    let 拒 = false, 详 = '';
    try { 提交(根, 消息1, null); } catch (e) { 拒 = true; 详 = e.message; }
    记('③ 工作树没有改动 ⇒ 拒绝（不产出空提交）', 拒 && /没有改动/.test(详), 详.slice(0, 40));
  }
  // ④ CLI --试运行：不落提交
  {
    fs.writeFileSync(path.join(根, 'b.txt'), '第二版\n');
    const 前 = (git(根, ['rev-list', '--count', 'HEAD']).stdout || '').trim();
    const r = spawnSync('node', [__filename, '--消息=' + 消息1, '--根=' + 根, '--试运行'], { encoding: 'utf8' });
    const 后 = (git(根, ['rev-list', '--count', 'HEAD']).stdout || '').trim();
    记('④ CLI 预演：退出 0 且提交数不变（' + 前 + '→' + 后 + '）', r.status === 0 && 前 === 后 && /试运行/.test(r.stdout || ''),
      ((r.stdout || '').split('\n').find(l => /试运行/.test(l)) || '').trim());
  }
  // ⑤ CLI 正式：提交数 +1
  {
    const 前 = (git(根, ['rev-list', '--count', 'HEAD']).stdout || '').trim();
    const r = spawnSync('node', [__filename, '--消息=' + 消息1, '--根=' + 根], { encoding: 'utf8' });
    const 后 = (git(根, ['rev-list', '--count', 'HEAD']).stdout || '').trim();
    记('⑤ CLI 正式提交：退出 0 且提交数 +1（' + 前 + '→' + 后 + '）', r.status === 0 && (+后) === (+前) + 1,
      ((r.stdout || '').split('\n').find(l => /已提交/.test(l)) || '').trim());
  }
  // ⑥⑦⑧ 第 300 单·交付入口自检（沙盒：假 outputs／假根网页／假素材，走环境变量覆盖）
  {
    const 假交付 = 根 + '-out', 假网页 = 根 + '-web.html', 假素材 = 根 + '-assets';
    fs.mkdirSync(假交付); fs.mkdirSync(假素材);
    process.env.CITYLIFE_DELIVERY_DIR = 假交付;
    process.env.CITYLIFE_ROOT_HTML = 假网页;
    process.env.CITYLIFE_ROOT_ASSETS = 假素材;
    fs.writeFileSync(path.join(根, 'city-life-framework.html'), '<span id="set-build">v900</span>');
    fs.writeFileSync(path.join(假交付, 'citylife-debug-v900.apk'), 'x');
    fs.writeFileSync(path.join(假交付, 'README-交付清单.md'), '# 清单\n装 citylife-debug-v899.apk\n');
    fs.writeFileSync(假网页, '<span id="set-build">v900</span>');
    fs.mkdirSync(path.join(根, 'assets'), { recursive: true });
    for (const f of ['apartment.png', 'characters.png']) {
      fs.writeFileSync(path.join(假素材, f), 'A'); fs.writeFileSync(path.join(根, 'assets', f), 'A');
    }
    fs.writeFileSync(path.join(根, 'c.txt'), '改\n');
    let 拒 = false, 详 = '';
    try { 提交(根, 消息1, null); } catch (e) { 拒 = true; 详 = e.message; }
    记('⑥ 最新包已进 outputs 而清单没点名 ⇒ 拒绝', 拒 && /清单/.test(详), 详.slice(0, 70));
    fs.writeFileSync(path.join(假交付, 'README-交付清单.md'), '# 清单\n装 citylife-debug-v900.apk\n');
    let 过 = false, 详2 = '';
    try { 提交(根, 消息1, null); 过 = true; } catch (e) { 详2 = e.message; }
    记('⑦ 清单点名最新包＋根网页同版＋素材一致 ⇒ 放行（提交成功）', 过, 详2.slice(0, 70));
    fs.writeFileSync(假网页, '<span id="set-build">v899</span>');
    fs.writeFileSync(path.join(根, 'd.txt'), '改2\n');
    let 拒2 = false, 详3 = '';
    try { 提交(根, 消息1, null); } catch (e) { 拒2 = true; 详3 = e.message; }
    记('⑧ 根网页版不是当前版 ⇒ 拒绝', 拒2 && /网页版/.test(详3), 详3.slice(0, 70));
    delete process.env.CITYLIFE_DELIVERY_DIR;
    delete process.env.CITYLIFE_ROOT_HTML;
    delete process.env.CITYLIFE_ROOT_ASSETS;
  }
  const 红 = 步.filter(x => !x.ok).length;
  fs.writeFileSync(path.join(根, 'report.json'), JSON.stringify(步, null, 2), 'utf8');
  console.log('\n提交器自测：' + 红 + ' 例不过 / 共 ' + 步.length + ' 例；沙盒在 ' + 根);
  process.exit(红 ? 1 : 0);
}

/* ── 主流程 ─────────────────────────────────────────────────────── */
{
  const 参 = 解析参数(process.argv.slice(2));
  if (参['自测']) 自测();
  else {
    if (参['检查交付']) {
      const 提示 = 交付自检(参['根'] || ROOT);
      if (提示.length) { console.log('交付入口自检未过：\n  - ' + 提示.join('\n  - ')); process.exit(1); }
      console.log('交付入口自检通过'); process.exit(0);
    }
    if (!参['消息']) { console.log('缺 --消息=<文件>（用法见文件头注释；或加 --自测 跑沙盒自测；--检查交付 只跑交付自检）'); process.exit(2); }
    const 根 = 参['根'] || ROOT;
    try {
      const 消息 = fs.readFileSync(参['消息'], 'utf8');
      if (!消息.trim()) throw new Error('消息文件是空的——不产出空消息提交');
      if (参['试运行']) {
        const 状 = git(根, ['status', '--porcelain']);
        console.log('（--试运行：未提交）工作树：');
        console.log(状.stdout.trim() || '（干净）');
        console.log('消息原文（' + 消息.length + ' 字）——git commit -F 将逐字使用：');
        console.log(消息);
        process.exit(0);
      }
      const r = 提交(根, 参['消息'], 参['快照'] ? (参['快照脚本'] || 默认快照) : null);
      console.log('已提交：' + r.一行);
      if (r.快照) console.log('快照：' + JSON.stringify(r.快照));
      process.exit(0);
    } catch (e) {
      console.log('拒绝提交：' + e.message);
      process.exit(1);
    }
  }
}
