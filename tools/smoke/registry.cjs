// 第 83 单·诊断工具登记表（**硬名单**）：`tools/` 下每一支都必须在这里登记，否则门禁判红。
// 为什么要有它：工具不进 gate.yml、不判红，坏了只会静默跑不出来（第 82 单实测：21 支里 3 支跑不通）。
// 档位：`1`＝快、不需要浏览器（一批跑完十几秒，适合随手跑）；`2`＝要浏览器或要几十秒（成批跑用）。
const path = require('path');
const fs = require('fs');

const 仓库 = path.resolve(__dirname, '../..');

/* 逐支登记：路径（相对仓库）、档、跑它要的参数（相对/绝对都行）、超时毫秒、备注。
   参数里带 `{OUT}` 的一律会被替换成临时输出目录（**不许往仓库里写**）。 */
const 清单 = [
  { 路径: 'tools/chat-pair/probe.cjs',        档: 1, 参数: ['6'], 超时: 60000, 备注: '接话配对与容量峰值表' },
  { 路径: 'tools/goal-audit/probe.cjs',       档: 1, 参数: ['30'], 超时: 90000, 备注: '目标定标与旋钮 A/B' },
  { 路径: 'tools/world-audit/anchors.cjs',    档: 1, 参数: [],    超时: 90000, 备注: '世界侧三问读数' },
  { 路径: 'tools/fallback-pool/capacity.cjs', 档: 1, 参数: [],    超时: 90000, 备注: '兜底池容量 vs 实测峰值' },
  { 路径: 'tools/fallback-pool/wall.cjs',     档: 1, 参数: [],    超时: 90000, 备注: '日志墙全文实录' },
  { 路径: 'tools/rel-audit/compare.cjs',      档: 1, 参数: ['--天=30','--种子=20260803,424242','--允许分叉=1'], 超时: 90000, 备注: '关系 A 档行为零改动（与上一版逐拍比对；冒烟只验跑得通）' },
  { 路径: 'tools/rel-audit/shot.mjs',         档: 2, 参数: ['{OUT}/rel-shot'],         超时: 120000, 备注: '关系外显真页面截图（角色页／角色卡／详情）' },
  { 路径: 'tools/rel-audit/chat-mul.cjs',     档: 1, 参数: ['--天=30,400'],            超时: 120000, 备注: 'B 档②档位系数定标（30／400 天闲聊 A/B）' },
  { 路径: 'tools/rel-audit/you-probe.cjs',    档: 1, 参数: [],                          超时: 90000, 备注: '玩家篇①期（三种玩家节奏下的档位轨迹与涨落判据）' },
  { 路径: 'tools/fest-audit/probe.cjs',       档: 1, 参数: [],                        超时: 90000, 备注: '江灯节每人每晚一盏（与上一版并排跑那一晚）' },
  { 路径: 'tools/heart-audit/probe.cjs',      档: 1, 参数: ['--天=120'],               超时: 90000, 备注: '交心（长跑里真发生几场、会不会重复）' },
  { 路径: 'tools/long-run/probe.cjs',         档: 1, 参数: ['--天=200'],               超时: 120000, 备注: '新状态耐久性（长跑不变量＋存档往返）' },
  { 路径: 'tools/save-fuzz/probe.cjs',        档: 1, 参数: [],                          超时: 180000, 备注: '坏档容错（畸形档过闸后必须跑得动；三处现场点名）' },
  { 路径: 'tools/closeout/writeback.cjs',     档: 1, 参数: ['--自测'],                    超时: 60000,  备注: '三件套回写器（--自测 8 场景：正常／坏形态／已写过／锚点缺失／版本行…）' },
  { 路径: 'tools/save-fuzz/dom-probe.mjs',    档: 2, 参数: ['{OUT}/save-fuzz-dom'],     超时: 300000, 备注: '坏档容错·渲染面（角色卡／循环零报错）' },
  { 路径: 'tools/audio-audit/probe.mjs',      档: 2, 参数: ['{OUT}/audio-audit'],        超时: 180000, 备注: '提示音（关着不响／开着要响；AudioContext 计数）' },
  { 路径: 'tools/nameplate-audit/stability.mjs', 档: 2, 参数: ['{OUT}/nameplate-stability'], 超时: 180000, 备注: '名牌分道稳定性（同层零重叠／每 50ms 位移 ≤0.6 道）' },
  { 路径: 'tools/layout-audit/matrix.mjs',    档: 2, 参数: ['{OUT}/layout-matrix'],      超时: 420000, 备注: '排版×设置矩阵（四档布局＋动效/像素四组合：零溢出、页签全在屏内、零报错）' },
  { 路径: 'tools/llm-audit/relay-mock.mjs',   档: 2, 参数: ['{OUT}/llm-audit'],         超时: 300000, 备注: 'AI 链路联调（mock 中转站：成功／非 JSON／500／语气词重写／超时五幕）' },
  { 路径: 'tools/sms-audit/unread.mjs',       档: 2, 参数: ['{OUT}/sms-audit'],         超时: 180000, 备注: '短信页分人未读（发一条→他的角标非 0／点别人不清／点他清零／刷新仍 0）' },
  { 路径: 'tools/miles-audit/probe.mjs',      档: 2, 参数: ['{OUT}/miles-audit'],       超时: 180000, 备注: '云港手账（开局 0/10／发一条→勾两条／刷新不重不漏）' },
  { 路径: 'tools/save-audit/probe.mjs',       档: 2, 参数: ['{OUT}/save-audit'],        超时: 180000, 备注: '存档两条真实路径（导出/导入往返＋坏码不崩；离线两天补算＋回城弹窗＋补算零 AI）' },
  { 路径: 'tools/fileopen-audit/probe.mjs',   档: 2, 参数: ['{OUT}/fileopen-audit'],    超时: 180000, 备注: 'file:// 直开（用户双击打开的实际路径：素材/存档可写/重载续档/导出/版本行/AI 降级结算 9 条）' },
  { 路径: 'tools/multitab-audit/probe.mjs',   档: 2, 参数: ['{OUT}/multitab-audit'],    超时: 300000, 备注: '双开（两标签页互相覆盖存档的现场＋丢动作实证；提示：单开不误报/双开两页都报/关了自动收）' },
  { 路径: 'tools/backpop-audit/probe.mjs',    档: 2, 参数: ['{OUT}/backpop-audit'],     超时: 180000, 备注: '回城弹窗「看全部剪辑」＋三处一致性（弹窗/横幅/日志的 N 与封顶文案；乙形态）' },
  { 路径: 'tools/gift-audit/probe.cjs',       档: 1, 参数: [],                        超时: 90000, 备注: '欠人情排队（与上一版并排跑生日那两周）' },
  { 路径: 'tools/offline-catchup/probe.cjs',  档: 1, 参数: [],    超时: 90000, 备注: '离线补算取证' },
  { 路径: 'tools/offline-catchup/pushprobe.cjs', 档: 1, 参数: [], 超时: 90000, 备注: '回城推送判据取证' },
  { 路径: 'tools/live-walkgate/audit.mjs',    档: 2, 参数: ['{OUT}/live-walkgate'], 超时: 120000, 备注: '真页面逐帧走位' },
  { 路径: 'tools/nameplate-audit/audit.mjs',  档: 2, 参数: ['{OUT}/nameplate'],    超时: 120000, 备注: '名牌 vs 房间名' },
  { 路径: 'tools/night-audit/audit.mjs',      档: 2, 参数: ['{OUT}/night'],        超时: 120000, 备注: '夜间亮度体检' },
  { 路径: 'tools/fresh-gate/probe.mjs',       档: 2, 参数: ['{OUT}/fresh'],        超时: 120000, 备注: '「有新版」四场景' },
  { 路径: 'tools/page-sweep/sweep.mjs',       档: 2, 参数: ['{OUT}/sweep'],        超时: 180000, 备注: '六页两档 ＋ 全按钮扫描' },
  { 路径: 'tools/soak/soak.mjs',              档: 2, 参数: ['{OUT}/soak','--天=30','--分钟=5'], 超时: 600000, 备注: '满状态巡检 ＋ 浸泡（默认 5 分钟档）' },
  { 路径: 'tools/act-icon/shots.mjs',         档: 2, 参数: ['{OUT}/act-icon'],     超时: 120000, 备注: '活动符号对照图' },
  { 路径: 'tools/night-lamp/shots.mjs',       档: 2, 参数: ['{OUT}/night-lamp'],   超时: 120000, 备注: '入夜点灯对照图' },
  { 路径: 'tools/room-tile/shots.mjs',        档: 2, 参数: ['{OUT}/room-tile'],    超时: 120000, 备注: '房间铺装对照图' },
  { 路径: 'tools/sky-tint/shots.mjs',         档: 2, 参数: ['{OUT}/sky-tint'],     超时: 120000, 备注: '天色对照图' },
  { 路径: 'tools/season-tint/shots.mjs',      档: 2, 参数: ['{OUT}/season-tint'],  超时: 150000, 备注: '四季对照图（春夏秋冬 × 双档＋逐像素判据）' },
  { 路径: 'tools/street-glow/shots.mjs',      档: 2, 参数: ['{OUT}/street-glow'],  超时: 120000, 备注: '路灯光斑对照图' },
  { 路径: 'tools/offline-catchup/shots.mjs',  档: 2, 参数: ['{OUT}/catchup-shots'], 超时: 150000, 备注: '离线追帧实机截图' },
  { 路径: 'tools/offline-catchup/popshots.mjs', 档: 2, 参数: ['{OUT}/catchup-pop'], 超时: 150000, 备注: '回城弹窗实机截图' },
  /* 以下三支要额外入参或前置产出，故登记为"档 0：要人给参数"——登记表要求它们**存在且被点名**，
     但不由本脚本自动跑（照第 82 单"没跑也照实登记"的口径）。 */
  { 路径: 'tools/asset-pipeline/clip_shots.mjs',       档: 0, 参数: [], 超时: 0, 备注: '要仓库根＋输出目录＋真素材' },
  { 路径: 'tools/asset-pipeline/pageswitch_shots.mjs', 档: 0, 参数: [], 超时: 0, 备注: '要 html 文件＋输出目录＋前缀' },
  { 路径: 'tools/asset-pipeline/preview_shots.mjs',    档: 0, 参数: [], 超时: 0, 备注: '要仓库根＋输出目录' },
  { 路径: 'tools/asset-pipeline/walk_shots.mjs',       档: 0, 参数: [], 超时: 0, 备注: '要 html 文件＋输出目录＋前缀' },
  { 路径: 'tools/asset-pipeline/walk_contact.mjs',     档: 0, 参数: [], 超时: 0, 备注: '要图片目录（拼接触表图）' },
  { 路径: 'tools/asset-pipeline/pageswitch_sheet.mjs', 档: 0, 参数: [], 超时: 0, 备注: '要图片目录（拼页面切换图）' },
  { 路径: 'tools/voice-check/measure.cjs',             档: 0, 参数: [], 超时: 0, 备注: '两段式：先跑 collect 产出 .work/real_gens.js' },
  { 路径: 'tools/voice-check/collect_diary.cjs',       档: 0, 参数: [], 超时: 0, 备注: '人机协作采集（用法 init | next | show）' },
  { 路径: 'tools/voice-check/collect_sms.cjs',         档: 0, 参数: [], 超时: 0, 备注: '人机协作采集（同上）' },
];

/* 扫仓库里实际存在的工具文件（排除本目录自己的运行器）。 */
function 扫工具() {
  const 出 = [];
  const 走 = dir => {
    for (const 名 of fs.readdirSync(dir)) {
      const 全 = path.join(dir, 名);
      const st = fs.statSync(全);
      if (st.isDirectory()) { if (名 !== 'smoke') 走(全); continue; }
      if (/\.(cjs|mjs)$/.test(名)) 出.push(path.relative(仓库, 全).split(path.sep).join('/'));
    }
  };
  走(path.join(仓库, 'tools'));
  return 出.sort();
}

module.exports = { 仓库, 清单, 扫工具 };
