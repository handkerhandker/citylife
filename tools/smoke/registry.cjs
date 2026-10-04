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
  { 路径: 'tools/dish-audit/probe.cjs',       档: 1, 参数: [],                          超时: 180000, 备注: '自己研究一道菜（400 天 ×3 种子：每人 ≥1 道／零重样／≤池长／同种子两遍逐字相同）' },
  { 路径: 'tools/save-fuzz/probe.cjs',        档: 1, 参数: [],                          超时: 180000, 备注: '坏档容错（畸形档过闸后必须跑得动；三处现场点名）' },
  { 路径: 'tools/urgent-audit/probe.cjs',     档: 1, 参数: [],                          超时: 90000,  备注: '加急短信（能停的两拍内读到／普通不读／work 不打断／两种回话口吻／发送不摇 rng）' },
  { 路径: 'tools/report-audit/probe.cjs',     档: 1, 参数: [],                          超时: 180000, 备注: '出门采访（400 天 ×3：80 个采访日／题面与点位三选一确定性／同种子两遍逐字相同／对照仍在家）' },
  { 路径: 'tools/fingerprint/probe.cjs',      档: 1, 参数: [],                          超时: 120000, 备注: '三指纹对账（世界／门禁／SIM 块 md5 对台账；第 176 单立——治"门禁指纹零 reader 必然漂移"）' },
  { 路径: 'tools/ai-gate/probe.cjs',          档: 1, 参数: [],                          超时: 60000,  备注: 'AI 成本闸·中转站侧（第 177 单：假 fetch 数上游调用——缓存省没省钱／限流与熔断拦没拦住／通行证挡不挡）' },
  { 路径: 'tools/closeout/writeback.cjs',     档: 1, 参数: ['--自测'],                    超时: 60000,  备注: '三件套回写器（--自测 8 场景：正常／坏形态／已写过／锚点缺失／版本行…）' },
  { 路径: 'tools/closeout/commit.cjs',        档: 1, 参数: ['--自测'],                    超时: 60000,  备注: '提交器（--自测 5 场景：引号/换行逐字入库、空消息拒、无改动拒、预演不提交）' },
  { 路径: 'tools/save-fuzz/dom-probe.mjs',    档: 2, 参数: ['{OUT}/save-fuzz-dom'],     超时: 300000, 备注: '坏档容错·渲染面（角色卡／循环零报错）' },
  { 路径: 'tools/audio-audit/probe.mjs',      档: 2, 参数: ['{OUT}/audio-audit'],        超时: 180000, 备注: '提示音（关着不响／开着要响；AudioContext 计数）' },
  { 路径: 'tools/nameplate-audit/stability.mjs', 档: 2, 参数: ['{OUT}/nameplate-stability'], 超时: 180000, 备注: '名牌分道稳定性（同层零重叠／每 50ms 位移 ≤0.6 道）' },
  { 路径: 'tools/layout-audit/matrix.mjs',    档: 2, 参数: ['{OUT}/layout-matrix'],      超时: 420000, 备注: '排版×设置矩阵（四档布局＋动效/像素四组合：零溢出、页签全在屏内、零报错）' },
  { 路径: 'tools/llm-audit/relay-mock.mjs',   档: 2, 参数: ['{OUT}/llm-audit'],         超时: 300000, 备注: 'AI 链路联调（mock 中转站：成功／非 JSON／500／语气词重写／超时五幕）' },
  { 路径: 'tools/ai-gate/client.mjs',         档: 2, 参数: ['{OUT}/ai-gate-client'],    超时: 300000, 备注: 'AI 成本闸·客户端侧（第 177 单：额度用尽即不发请求／刷新不清零／跨日重置／旧档兼容）' },
  { 路径: 'tools/back-audit/probe.mjs',       档: 2, 参数: ['{OUT}/back-audit'],        超时: 180000, 备注: '手机返回键（第 183 单：没弹窗 false／有弹窗关弹窗 true／不在现场页回现场页 true／次序不粘）' },
  { 路径: 'tools/diag-overlay/probe.mjs',     档: 2, 参数: ['{OUT}/diag-overlay'],      超时: 180000, 备注: '诊断浮层（第 184 单：默认不显示／绝不拦触摸／刷新保持／再点关掉；第 189／190 单：平台原始值＋屏/壳/边带＋页面主动问壳；第 201／202 单：设备三样＋内核版本）' },
  { 路径: 'tools/safearea-audit/probe.mjs',   档: 2, 参数: ['{OUT}/safearea-audit'],    超时: 180000, 备注: '安全区取数（第 186 单：不注入=0／平台注入 37px 顶栏内容让位／壳自补 24px 也认；官方 SystemBars 配方）' },
{ 路径: 'tools/cat-audit/probe.mjs',        档: 2, 参数: ['{OUT}/cat-audit'],         超时: 180000, 备注: '云港的猫·看得见（第 213 单：同点位猫日色板像素 − 非猫日 ≥ 80；--改前 对照≈0）' },
  { 路径: 'tools/board-audit/probe.mjs',      档: 2, 参数: ['{OUT}/board-audit'],       超时: 180000, 备注: '云港公告栏（第 216 单：点牌子开弹窗／有活金字 174 vs 0／✕ 关得掉；--改前 对照点不出）' },
  { 路径: 'tools/cookbook-audit/probe.mjs',   档: 2, 参数: ['{OUT}/cookbook-audit'],    超时: 180000, 备注: '菜谱本（第 188 单：有菜按顺序全列／空账照实说／只读不动世界／零报错）' },
  { 路径: 'tools/sms-audit/unread.mjs',       档: 2, 参数: ['{OUT}/sms-audit'],         超时: 180000, 备注: '短信页分人未读（发一条→他的角标非 0／点别人不清／点他清零／刷新仍 0）' },
  { 路径: 'tools/miles-audit/probe.mjs',      档: 2, 参数: ['{OUT}/miles-audit'],       超时: 180000, 备注: '云港手账（开局 0/10／发一条→勾两条／刷新不重不漏）' },
  { 路径: 'tools/save-audit/probe.mjs',       档: 2, 参数: ['{OUT}/save-audit'],        超时: 180000, 备注: '存档两条真实路径（导出/导入往返＋坏码不崩；离线两天补算＋回城弹窗＋补算零 AI）' },
  { 路径: 'tools/fileopen-audit/probe.mjs',   档: 2, 参数: ['{OUT}/fileopen-audit'],    超时: 180000, 备注: 'file:// 直开（用户双击打开的实际路径：素材/存档可写/重载续档/导出/版本行/AI 降级结算 9 条）' },
  { 路径: 'tools/multitab-audit/probe.mjs',   档: 2, 参数: ['{OUT}/multitab-audit'],    超时: 300000, 备注: '双开（两标签页互相覆盖存档的现场＋丢动作实证；提示：单开不误报/双开两页都报/关了自动收）' },
  { 路径: 'tools/backpop-audit/probe.mjs',    档: 2, 参数: ['{OUT}/backpop-audit'],     超时: 180000, 备注: '回城弹窗「看全部剪辑」＋三处一致性（弹窗/横幅/日志的 N 与封顶文案；乙形态）' },
  { 路径: 'tools/umbrella/shots.mjs',         档: 2, 参数: ['{OUT}/umbrella'],          超时: 180000, 备注: '雨天撑伞（伞面像素计数：雨户外>10/室内0/晴0/兜底25vs0/稳定；--改前 对照全0）' },
  { 路径: 'tools/scene-sweep/shots.mjs',      档: 2, 参数: ['{OUT}/scene-sweep'],       超时: 300000, 备注: '目验巡查（九景各出全景＋特写：聚厅/入睡/雨夜街道/公园/便利店/集市/深夜街灯/公司/手机）' },
  { 路径: 'tools/touch-audit/probe.mjs',      档: 2, 参数: ['{OUT}/touch-audit'],       超时: 180000, 备注: '触屏探针（点选/拖拽平移/小拖=点按/按钮触控/不滚不缩；--改前 可复现幽灵点击 bug）' },
  { 路径: 'tools/keyboard-audit/probe.mjs',   档: 2, 参数: ['{OUT}/keyboard-audit'],    超时: 180000, 备注: '键盘导航（首键出环/移焦点/Enter 激活页签/QE 切页/Esc 两级返回/输入框不劫持方向键）' },
  { 路径: 'tools/gamepad-audit/probe.mjs',    档: 2, 参数: ['{OUT}/gamepad-audit'],     超时: 180000, 备注: '手柄（假手柄注入：十字键/左摇杆/Ⓐ 确认/Ⓑ 返回/LB·RB 切页/长按连发）' },
  { 路径: 'tools/firework-audit/probe.mjs',   档: 2, 参数: ['{OUT}/firework'],          超时: 180000, 备注: '江灯节烟花（江面带帧间差分：节日夜大差帧数 ≥4／其余三档 ≤1；--改前 判红对照）' },
  { 路径: 'tools/bubble-audit/probe.mjs',     档: 2, 参数: ['{OUT}/bubble-audit'],      超时: 180000, 备注: '气泡顶边稳定性（rAF 逐帧：行数切换时逐帧 |Δtop|≤5px、切换≥1 次；--改前 判红）' },
  { 路径: 'tools/gift-audit/probe.cjs',       档: 1, 参数: [],                        超时: 90000, 备注: '欠人情排队（与上一版并排跑生日那两周）' },
  { 路径: 'tools/offline-catchup/probe.cjs',  档: 1, 参数: [],    超时: 90000, 备注: '离线补算取证' },
  { 路径: 'tools/offline-catchup/pushprobe.cjs', 档: 1, 参数: [], 超时: 90000, 备注: '回城推送判据取证' },
  { 路径: 'tools/live-walkgate/audit.mjs',    档: 2, 参数: ['{OUT}/live-walkgate'], 超时: 120000, 备注: '真页面逐帧走位' },
  { 路径: 'tools/nameplate-audit/audit.mjs',  档: 2, 参数: ['{OUT}/nameplate'],    超时: 120000, 备注: '名牌 vs 房间名' },
  { 路径: 'tools/night-audit/audit.mjs',      档: 2, 参数: ['{OUT}/night', '--判'], 超时: 120000, 备注: '夜间亮度体检（第 152 单起带 --判：室内五区 ≥ 基线／户外八区不漂移）' },
  { 路径: 'tools/perf-audit/probe.mjs',       档: 2, 参数: ['{OUT}/perf-audit'],      超时: 180000, 备注: '性能（四场景各 8 秒 rAF 帧时：长帧≤2／p95≤22ms；含"每帧压 30ms"反向自查）' },
  { 路径: 'tools/festlight-audit/probe.mjs',  档: 2, 参数: ['{OUT}/festlight'],        超时: 180000, 备注: '挂灯期灯串（岸线暖点像素：挂灯期 ≥40／对照 ≤5；--改前 判红）' },
  { 路径: 'tools/petal-audit/probe.mjs',      档: 2, 参数: ['{OUT}/petal-audit'],      超时: 180000, 备注: '春季落花（天空带粉像素：春 ≥60／其余三季 ≤10；--改前 判红）' },
  { 路径: 'tools/firefly-audit/probe.mjs',    档: 2, 参数: ['{OUT}/firefly-audit'],    超时: 180000, 备注: '夏夜萤火虫（江面带黄绿亮点：夏夜 ≥40／夏昼·冬夜 ≤10；--改前 判红）' },
  { 路径: 'tools/leaf-audit/probe.mjs',       档: 2, 参数: ['{OUT}/leaf-audit'],       超时: 180000, 备注: '深秋枫叶（天空带橙红像素：深秋 ≥60／初秋·夏·春 ≤10；--改前 判红）' },
  { 路径: 'tools/snow-audit/probe.mjs',       档: 2, 参数: ['{OUT}/snow-audit'],       超时: 300000, 备注: '冬日间歇飘雪（帧间白像素对称差：冬窗内均值 ≥120 且 ≥3×窗外；--改前 判红）' },
  { 路径: 'tools/snowground-audit/probe.mjs', 档: 2, 参数: ['{OUT}/snowground-audit'], 超时: 300000, 备注: '冬日积雪＋树冠雪帽（地面白度：深冬 ≥ 初冬+40／岸线+30、室内与江面 |Δ|≤20；树冠顶 ≥+40；--改前 判红）' },
  { 路径: 'tools/stars-audit/probe.mjs',      档: 2, 参数: ['{OUT}/stars-audit'],      超时: 300000, 备注: '晴夜星空与流星（地图外沿背景带星色像素：动效开−关 ≥8（静态活动牌自动抵消）／白天 ≤3；--改前 判红）' },
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
