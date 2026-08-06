# 素材流水线（tools/asset-pipeline）

把 LimeZu《Modern Interiors》原包机器加工成游戏用的两张成品图，零手工：

- `characters.png`(1152×768):四住户行走图。八行铁律=顾idle/顾walk/沈idle/沈walk/陆idle/陆walk/白idle/白walk,每行 24 帧(面向右/上/左/下各 6),帧 48×96,透明底。
- `apartment.png`(768×432):公寓三间房拼合图,布局表见 docs/素材制作说明.md 第三章(与游戏 SIM 块 ROOMS/ANCHORS 对位)。

## 授权红线

- 本目录只有代码与坐标配方，零素材、零下载地址。原包位置一律经运行时参数或环境变量注入。
- 原包与解包中间产物永不入仓库、永不上公网；两张拼合成品置于仓库 assets/ 随游戏部署（第 10 单补充指令二口径），是唯一的对外产物。

## 用法

```
python3 -m pip install pillow
python3 build_assets.py --zip /路径/moderninteriors-win.zip --out ./out
# 或已解包目录:
python3 build_assets.py --pack-dir /路径/解包目录 --out ./out
```

环境变量等价:`CITYLIFE_MI_ZIP` / `CITYLIFE_MI_DIR` / `CITYLIFE_OUT`。

跑完自动执行成品自检（尺寸、行列帧几何、透明底、逐帧非空、三门洞可走），任一不过即退出码 1、产物不可交付。

## 挑剔通道（单点重生成）

决策者上线目验后,对任一住户形象或房间观感用自然语言下达修改。施工只改本脚本顶部的配方区(`RESIDENTS` 部件表 / `FLOOR`、家具坐标),重跑流水线出新图,铁律与布局表零改动。

## 实机截图（走 playwright，与素材流水线无依赖关系，只是共用本目录）

```
npm i playwright            # node_modules/ 已入 .gitignore，浏览器用预装 Chromium
node preview_shots.mjs . <输出目录>     # 三区实机预览（补充指令四，素材验收用）
node clip_shots.mjs    . <输出目录>     # 每日剪辑页七张（第 21 单，选材验收用）
```

两个脚本都起一个本地静态站直接跑仓库里的 `city-life-framework.html`，故拍到的就是生产代码本身。
`clip_shots.mjs` 两处口径写死在脚本里，改动前先读注释：**①抢在第一次 AI 挂点之前关掉 `state.llm.on`**
（沙箱不通网时晚一步日志墙上就会留一条 ⚠ 连线失败，那是环境噪声不是产品行为）；
**②`fullPage` 对本作无效**——`#app` 是 100dvh 定高、各屏内部自己滚，整页截图与视口截图逐字节相同，
要拍「往回翻的历史」只能真滚一段再拍（`shootScrolled`）。
