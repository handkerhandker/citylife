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
