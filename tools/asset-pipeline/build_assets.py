#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
素材流水线(第 11 单·甲案地图骨架重整版):
从 LimeZu Modern Interiors 原包程序化产出两张成品图。
放样铁律见 docs/云港建筑规范.md(1 格=48px;通道≥2 格;贴墙搭顶≤6px 侧墙零重叠;
房间尺寸由家具真身＋通道预算反推;墙体像素不可侵占)。

  产出 A characters.png(1152×768):四住户行走图,八行铁律(本单零改动,重产须字节一致)
      行序 = 顾idle/顾walk/沈idle/沈walk/陆idle/陆walk/白idle/白walk
      每行 24 帧 = 面向右/上/左/下各 6 帧(生成器图层表原样顺序),帧 48×96,透明底
  产出 B apartment.png(912×528):公寓拼合图,19×11 格 × 48px(甲案新蓝图)
      分区(图格 0 基):客厅 c0-9×r2-10;卧室 c10-18×r0-5;纵廊 c10-11×r6-10(2 格宽,
      卧室经由它接街,零家具);厨房 c12-18×r6-10;左上 c0-9×r0-1 为室外(透明)
      三门洞各 2 格:客厅底缘 c5-6、厨房底缘 c15-16、卧室→纵廊(隔墙 r6 的 c10-11 缺口);
      纵廊街口 c10-11 底缘同宽敞开
      两内连门各 2 格(第 16 单,同楼互访走纵廊不出楼门):客厅东墙 x=11 图行 r8-9、
      厨房西墙 x=13 图行 r9-10;开洞法=该行不落竖描边,洞内即纯地板(与三门洞同法)
      家具按「整件登记表」四元组拼装(名称→源图区域→整件宽高→落位),四床整件
      零侵墙零侵纵廊零互叠、床间距≥1 格(48px),脚底占格避开全部门洞与纵廊

授权红线:本脚本只读原包、只出两张拼合成品;原包与其任何中间文件不入仓库、不上公网。
原包位置经运行时参数/环境变量注入,仓库内(assets/ 两张成品之外)零素材、零下载地址。

用法(二选一):
  python3 build_assets.py --zip /路径/moderninteriors-win.zip --out ./out
  python3 build_assets.py --pack-dir /路径/已解包目录 --out ./out
环境变量等价:CITYLIFE_MI_ZIP / CITYLIFE_MI_DIR / CITYLIFE_OUT
依赖:Pillow(python3 -m pip install pillow)
"""
import argparse
import os
import sys
import tempfile
import zipfile

try:
    from PIL import Image
except ImportError:
    sys.exit('缺少 Pillow:请先 python3 -m pip install pillow')

C = 48  # 格边长(48px 档)

# ---------------------------------------------------------------------------
# 配方 A:四住户部件(Character Generator 图层,48px 档)
# 图层表几何:全动作表 2688×1968;idle=第 1 动画行(y96..192)、walk=第 2 动画行(y192..288);
# 每行 24 帧(右/上/左/下×6)、帧 48×96 —— 与游戏「宽÷24、高÷8」切帧契约一致。
# 叠加序:身体 → 眼睛 → 服装 → 发型。
# 形象口径(第 10 单③B,部件自由裁量、气质对齐;单点重生成只改此表):
#   顾云帆 程序员:短发疲惫、蓝灰系  → 浅肤03 黑瞳01 蓝灰便装05c01 蓝灰刘海遮眼09c07
#   沈小满 店员:  马尾围裙亮色带笑  → 白皙02 亮蓝06 玫粉围裙13c04 粉色长鲍伯27c01
#                 (原包 29 款发型无严格「单马尾」,取最接近的亮色少女款;不满意走挑剔通道)
#   陆知秋 交易员:衬衫西裤深冷一丝不苟 → 小麦04 黑瞳01 深色西装红领带06c01 深色三七分15c04
#   白一鸣 撰稿人:乱发居家暖色      → 黄褐01 绿瞳02 橙色毛衣04c02 橙金乱翘发05c01
IDLE_Y, WALK_Y, ROW_H, STRIP_W = 96, 192, 96, 1152
RESIDENTS = [  # 顺序铁律:a1 顾云帆、a2 沈小满、a3 陆知秋、a4 白一鸣
    dict(name='guyunfan',    body='03', eyes='01', outfit=('05', '01'), hair=('09', '07')),
    dict(name='shenxiaoman', body='02', eyes='06', outfit=('13', '04'), hair=('27', '01')),
    dict(name='luzhiqiu',    body='04', eyes='01', outfit=('06', '01'), hair=('15', '04')),
    dict(name='baiyiming',   body='01', eyes='02', outfit=('04', '02'), hair=('05', '01')),
]

# ---------------------------------------------------------------------------
# 配方 B:公寓图块(Room_Builder 与 Theme_Sorter 表,均为 48px 档)· 甲案 19×11
GRID_W, GRID_H = 19, 11
FLOOR = dict(living=(35, 22), kitchen=(47, 14), bedroom=(35, 30))  # 金木板/灰白棋盘/编木纹
CORR_FLOOR = 'kitchen'        # 纵廊地面沿用厨房灰白棋盘(门厅通道观感)
WALL_FACES = [0, 1, 2]        # 奶油墙面三连(Room_Builder 行 17,含白色压顶;踢脚线取行 18 底 6px)
WALL_ROW_A, WALL_ROW_B = 17, 18
HTRIM_CELL, VTRIM_CELL = (6, 0), (8, 0)   # 白色天花描边:横条(取上 18px)/竖条(取左 21px)
LIVING_TOP_ROW = 2            # 客厅北墙带行(图行)
BED_TOP_ROW = 0               # 卧室北墙带行
PART_ROW = 6                  # 厨房北隔墙带行(卧室与下层分界;c10-11 留 2 格门洞)
CORR_COLS = (10, 11)          # 纵廊两列 = 卧室门洞列 = 纵廊街口列
DOOR_LIVING = (5, 6)          # 客厅底缘门洞图列(2 格)
DOOR_KITCHEN = (15, 16)       # 厨房底缘门洞图列(2 格)
# 内连门登记表(第 16 单):同楼房间互访经纵廊,故客厅东墙与厨房西墙各向纵廊开 2 格门洞。
# 登记口径与既有三门洞一致(位置+跨度+可走断言);trim_x=该墙竖描边落位,rows=图行闭区间。
# 对账口径:与游戏侧楼身分组表 BUILDING_PLAN.apt.link 的内连门走线逐一对账(见 selfcheck)。
INNER_DOORS = (
    dict(name='客厅东墙内连门', trim_x=480,      rows=(8, 9),  world_x=11, world_rows=(9, 10)),
    dict(name='厨房西墙内连门', trim_x=576 - 10, rows=(9, 10), world_x=13, world_rows=(10, 11)),
)
INNER_SKIP = {(d['trim_x'], gy) for d in INNER_DOORS for gy in range(d['rows'][0], d['rows'][1] + 1)}
WIN_LIVING = (191, 100)       # 客厅北墙窗(落位像素;窗属墙体构件层入基准)
WIN_BEDROOM = (504, 4)        # 卧室北墙窗(西界墙整柱 480-501 以东,零叠墙)


def region(gx, gy):
    """图格 → 分区;None=室外(左上 10×2,透明)。"""
    if gx <= 9:
        return None if gy <= 1 else 'living'
    if gy <= 5:
        return 'bedroom'
    return 'corridor' if gx <= 11 else 'kitchen'


# 家具整件登记表(四元组):名称 → 源图区域(绝对像素) → 整件宽高 → 落位(左上角像素)
# clean=(keep_y0, keep_y1, top_clip):源区内贴邻杂件经连通域清理;整件尺寸仍须与登记宽高恰等
# flip=True:水平镜像(成对椅子,原包该组仅单朝向干净件)
# 脚底占格红线(甲案):三门洞(c5-6/c15-16/隔墙 c10-11)与纵廊全柱(c10-11 全行)零家具;
# 四床整件全落 x≥588(纵廊东缘 576 外加 12px 余量),零侵墙零互叠、间距恰 48px。
FURNITURE = [
    dict(name='tv',      sheet='2_LivingRoom_48x48.png', src=(99, 24, 189, 78),      size=(90, 54),   pos=(84, 144)),
    dict(name='sofa',    sheet='2_LivingRoom_48x48.png', src=(192, 1359, 336, 1440), size=(144, 81),  pos=(24, 221)),
    dict(name='shelf',   sheet='2_LivingRoom_48x48.png', src=(480, 1170, 576, 1272), size=(96, 102),  pos=(283, 144)),
    dict(name='plant',   sheet='2_LivingRoom_48x48.png', src=(501, 27, 555, 96),     size=(54, 69),   pos=(24, 144)),
    dict(name='desk',    sheet='5_Classroom_and_library_48x48.png', src=(246, 69, 330, 144), size=(84, 75), pos=(384, 158)),
    dict(name='chair_n', sheet='1_Generic_48x48.png',    src=(195, 2403, 237, 2460), size=(42, 57),   pos=(113, 322)),
    dict(name='chair_l', sheet='1_Generic_48x48.png',    src=(438, 2403, 477, 2466), size=(39, 63),   pos=(34, 384)),
    dict(name='chair_r', sheet='1_Generic_48x48.png',    src=(438, 2403, 477, 2466), size=(39, 63),   pos=(194, 384), flip=True),
    dict(name='table',   sheet='1_Generic_48x48.png',    src=(39, 1635, 153, 1746),  size=(114, 111), pos=(77, 360)),
    dict(name='fridge',  sheet='12_Kitchen_48x48.png',   src=(432, 1125, 486, 1224), size=(54, 99),   pos=(835, 336)),
    dict(name='stove',   sheet='12_Kitchen_48x48.png',   src=(384, 534, 432, 609),   size=(48, 75),   pos=(590, 336)),
    dict(name='counter', sheet='12_Kitchen_48x48.png',   src=(96, 480, 192, 513),    size=(96, 33),   pos=(640, 336)),
    # 四床带床架板床整件款(西列同款灰蓝×2,东列黄/杏,第 10 单补充指令四裁定沿用);
    # 甲案卧室 9×6:两列两行,列距/行距恰 48px=1 格,全件零侵墙零侵纵廊
    dict(name='bed1',    sheet='4_Bedroom_48x48.png',    src=(147, 1863, 255, 1938), size=(108, 75),  pos=(588, 48)),
    dict(name='bed2',    sheet='4_Bedroom_48x48.png',    src=(144, 1987, 252, 2112), size=(105, 75),  pos=(744, 48), clean=(2060, 2110, False)),
    dict(name='bed3',    sheet='4_Bedroom_48x48.png',    src=(147, 1863, 255, 1938), size=(108, 75),  pos=(588, 171)),
    dict(name='bed4',    sheet='4_Bedroom_48x48.png',    src=(147, 2151, 255, 2226), size=(108, 75),  pos=(744, 171)),
]

# 游戏侧登记(与上表联动;世界格 = 图格 + 1;此两表须与 city-life-framework.html 硬编码一致):
# 高件家具(tall,参与人物层级遮挡)的覆盖矩形(图像素)与脚底世界 y:
GAME_FURN_TALL = [
    dict(name='sofa',    rect=(24, 221, 144, 81),   footY=7.292),
    dict(name='shelf',   rect=(283, 144, 96, 102),  footY=6.125),
    dict(name='desk',    rect=(384, 158, 84, 75),   footY=5.854),
    dict(name='table',   rect=(77, 360, 114, 111),  footY=10.813),
    dict(name='fridge',  rect=(835, 336, 54, 99),   footY=10.063),
    dict(name='stove',   rect=(590, 336, 48, 75),   footY=9.563),
    dict(name='counter', rect=(640, 336, 96, 33),   footY=8.688),
]
# 实体格(人物脚底不得落入显示;世界格坐标):墙带 + 家具占格(床仅枕头格,毯面可躺)
GAME_SOLID_CELLS = (
    [(x, 1) for x in range(11, 20)] +                         # 卧室北墙带(世界 y1)
    [(x, 3) for x in range(1, 11)] +                          # 客厅北墙带(世界 y3)
    [(x, 7) for x in range(13, 20)] +                         # 厨房北隔墙带(留门洞列 11-12)
    [(1, 4), (2, 4)] +                                        # plant
    [(3, 4), (4, 4)] +                                        # tv
    [(7, 4), (8, 4), (7, 5), (8, 5)] +                        # shelf
    [(9, 4), (10, 4), (9, 5), (10, 5)] +                      # desk
    [(1, 6), (2, 6), (3, 6), (4, 6)] +                        # sofa
    [(3, 8), (4, 8), (3, 9), (4, 9), (3, 10), (4, 10)] +      # table
    [(2, 9), (5, 9)] +                                        # chairs 左/右座格
    [(13, 8), (14, 8), (13, 9), (14, 9)] +                    # stove(贴纵廊隔断)
    [(15, 8), (16, 8)] +                                      # counter
    [(18, 8), (19, 8), (18, 9), (19, 9)] +                    # fridge(贴东墙)
    [(13, 2), (16, 2), (13, 5), (16, 5)]                      # 床枕头格
)


def log(msg):
    print(msg, flush=True)


# ------------------- 蓝图独立推导(第 11 单目验制度修补) -------------------
# 根因:「空房仅墙」基准与成品同源生成,蓝图错则双双错、断言恒绿。
# 修补:从 city-life-framework.html(SIM 块 ROOMS/APT,唯一权威蓝图)独立解析几何,
# 推导墙段模型(房间四边闭合、仅门洞处留口),对基准图逐像素巡检;
# 门洞位置与 door 字段逐一对账。本推导与上方拼装常量零共享。

def parse_blueprint():
    import re
    html = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'city-life-framework.html')
    s = open(html, encoding='utf-8').read()
    sim = re.search(r'/\*SIM-START\*/([\s\S]*?)/\*SIM-END\*/', s).group(1)
    rooms = {}
    for m in re.finditer(r"\{id:'(\w+)',\s*label:'[^']*',\s*x:([\d.]+),\s*y:([\d.]+),"
                         r"\s*w:([\d.]+),\s*h:([\d.]+),\s*door:\{x:([\d.]+),\s*side:'([bt])'", sim):
        rooms[m.group(1)] = dict(x=float(m.group(2)), y=float(m.group(3)), w=float(m.group(4)),
                                 h=float(m.group(5)), doorx=float(m.group(6)), side=m.group(7))
    am = re.search(r'const APT=\{x:(\d+),y:(\d+),w:(\d+),h:(\d+)\}', s)
    apt = dict(x=int(am.group(1)), y=int(am.group(2)), w=int(am.group(3)), h=int(am.group(4)))
    return rooms, apt


def parse_building_plan():
    """解析游戏侧楼身分组表的内连门走线(city-life-framework.html 为唯一权威),供内连门对账。"""
    import re
    html = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'city-life-framework.html')
    s = open(html, encoding='utf-8').read()
    blk = re.search(r'const BUILDING_PLAN=\{([\s\S]*?)\n\};', s).group(1)
    hall_x = float(re.search(r'hallX:([\d.]+)', blk).group(1))
    links = {}
    for m in re.finditer(r"(\w+)\s*:\{gate:\{x:([\d.]+),\s*y:([\d.]+)\},\s*hy:([\d.]+)\}", blk):
        links[m.group(1)] = dict(gx=float(m.group(2)), gy=float(m.group(3)), hy=float(m.group(4)))
    return hall_x, links


def derive_wall_model(rooms, apt):
    """墙段模型:8 条墙线(图内像素),h 段带门洞登记;附纵廊推导矩形(世界坐标)。"""
    lv, kt, bd = rooms['living'], rooms['kitchen'], rooms['bedroom']
    px = lambda wx: int(round((wx - apt['x']) * C))
    py = lambda wy: int(round((wy - apt['y']) * C))
    south = apt['y'] + apt['h']
    cor = dict(x0=float(int(bd['doorx'])), x1=float(int(bd['doorx'])) + 2, y0=bd['y'] + bd['h'], y1=south)
    door2 = lambda r: (px(int(r['doorx'])), px(int(r['doorx']) + 2))
    # 内连门在竖墙线上开口:gaps 取图内 y 像素区间(与 h 段的 x 区间同构)
    def inner_gaps(wall_world_x):
        return [(d['rows'][0] * C, (d['rows'][1] + 1) * C)
                for d in INNER_DOORS if d['world_x'] == wall_world_x]
    segs = [
        dict(axis='v', pos=px(lv['x']),           lo=py(lv['y']), hi=py(south), gaps=[], label='V1 客厅西外墙 x=%g' % lv['x']),
        dict(axis='v', pos=px(bd['x']),           lo=py(bd['y']), hi=py(south), gaps=inner_gaps(bd['x']),
             label='V2 卧室西外墙+客厅|右翼界墙 x=%g(全高整柱,客厅东墙内连门)' % bd['x']),
        dict(axis='v', pos=px(kt['x']),           lo=py(kt['y']), hi=py(south), gaps=inner_gaps(kt['x']),
             label='V3 纵廊|厨房隔断 x=%g(厨房西墙内连门)' % kt['x']),
        dict(axis='v', pos=px(bd['x'] + bd['w']), lo=py(bd['y']), hi=py(south), gaps=[], label='V4 东外墙 x=%g' % (bd['x'] + bd['w'])),
        dict(axis='h', pos=py(bd['y']),           lo=px(bd['x']), hi=px(bd['x'] + bd['w']), gaps=[], label='H1 卧室北墙 y=%g' % bd['y']),
        dict(axis='h', pos=py(lv['y']),           lo=px(lv['x']), hi=px(lv['x'] + lv['w']), gaps=[], label='H2 客厅北墙 y=%g' % lv['y']),
        dict(axis='h', pos=py(bd['y'] + bd['h']), lo=px(bd['x']), hi=px(bd['x'] + bd['w']),
             gaps=[door2(bd)], label='H3 卧室南缘隔墙 y=%g(卧室门洞)' % (bd['y'] + bd['h'])),
        dict(axis='h', pos=py(south),             lo=px(lv['x']), hi=px(bd['x'] + bd['w']),
             gaps=[door2(lv), door2(bd), door2(kt)], label='H4 包围盒南缘 y=%g(客厅门/纵廊街口/厨房门)' % south),
    ]
    return segs, cor


def zone_by_blueprint(rooms, cor, apt, gx, gy):
    wx, wy = apt['x'] + gx + 0.5, apt['y'] + gy + 0.5
    for k in ('living', 'kitchen', 'bedroom'):
        r = rooms[k]
        if r['x'] <= wx < r['x'] + r['w'] and r['y'] <= wy < r['y'] + r['h']:
            return k
    if cor['x0'] <= wx < cor['x1'] and cor['y0'] <= wy < cor['y1']:
        return 'corridor'
    return None


def resolve_pack(args):
    """定位原包:zip 则解包到临时目录;返回 Modern Interiors 根目录路径。"""
    zip_path = args.zip or os.environ.get('CITYLIFE_MI_ZIP')
    pack_dir = args.pack_dir or os.environ.get('CITYLIFE_MI_DIR')
    if not zip_path and not pack_dir:
        sys.exit('未指定原包:--zip 或 --pack-dir(或环境变量 CITYLIFE_MI_ZIP / CITYLIFE_MI_DIR)')
    if zip_path:
        pack_dir = tempfile.mkdtemp(prefix='mi-pack-')
        log(f'解包 {os.path.basename(zip_path)} → 临时目录(用毕自弃,不入库)')
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(pack_dir)
    root = pack_dir
    need = '2_Characters'
    if not os.path.isdir(os.path.join(root, need)):
        subs = [d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d))]
        for d in subs:
            if os.path.isdir(os.path.join(root, d, need)):
                root = os.path.join(root, d)
                break
        else:
            sys.exit('原包结构不符:未找到 2_Characters 目录')
    return root


def inventory(root):
    """盘点摘要(仅目录结构与数量)。"""
    log('—— 原包盘点 ——')
    for top in sorted(os.listdir(root)):
        p = os.path.join(root, top)
        if os.path.isdir(p):
            n = sum(len(fs) for _, _, fs in os.walk(p))
            log(f'  {top}/  共 {n} 个文件')


# ------------------------------- characters -------------------------------

def build_characters(root, out_dir):
    cg = os.path.join(root, '2_Characters/Character_Generator')
    def layer_paths(r):
        return [
            f"{cg}/Bodies/48x48/Body_48x48_{r['body']}.png",
            f"{cg}/Eyes/48x48/Eyes_48x48_{r['eyes']}.png",
            f"{cg}/Outfits/48x48/Outfit_{r['outfit'][0]}_48x48_{r['outfit'][1]}.png",
            f"{cg}/Hairstyles/48x48/Hairstyle_{r['hair'][0]}_48x48_{r['hair'][1]}.png",
        ]
    img = Image.new('RGBA', (STRIP_W, ROW_H * 8), (0, 0, 0, 0))
    for i, r in enumerate(RESIDENTS):
        layers = [Image.open(p).convert('RGBA') for p in layer_paths(r)]
        for j, y0 in enumerate([IDLE_Y, WALK_Y]):
            strip = Image.new('RGBA', (STRIP_W, ROW_H), (0, 0, 0, 0))
            for L in layers:
                strip.alpha_composite(L.crop((0, y0, STRIP_W, y0 + ROW_H)))
            img.alpha_composite(strip, (0, (i * 2 + j) * ROW_H))
        log(f'  捏人完成:{r["name"]}(idle+walk 各 24 帧)')
    path = os.path.join(out_dir, 'characters.png')
    img.save(path)
    return img


# ------------------------------- apartment --------------------------------

def sheet(root, name):
    return Image.open(os.path.join(
        root, '1_Interiors/48x48/Theme_Sorter_48x48', name)).convert('RGBA')


def cell(im, cx, cy, w=1, h=1):
    return im.crop((int(cx * C), int(cy * C), int((cx + w) * C), int((cy + h) * C)))


def clean_components(c, keep_y0_local, keep_y1_local, top_clip):
    """仅保留与 [keep_y0,keep_y1) 纵带(裁窗内坐标)相交的 alpha 连通域;
    top_clip 时清除纵带上沿-9px 以上残留(床头顶线)。"""
    w, h = c.size
    px = c.load()
    seen = [[False] * w for _ in range(h)]
    comps = []
    for yy in range(h):
        for xx in range(w):
            if seen[yy][xx] or px[xx, yy][3] == 0:
                continue
            stack = [(xx, yy)]
            seen[yy][xx] = True
            comp = []
            while stack:
                x_, y_ = stack.pop()
                comp.append((x_, y_))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x_ + dx, y_ + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3] > 0:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            comps.append(comp)
    for comp in comps:
        if not any(keep_y0_local <= y_ < keep_y1_local for _, y_ in comp):
            for x_, y_ in comp:
                px[x_, y_] = (0, 0, 0, 0)
    if top_clip:
        for yy in range(max(0, keep_y0_local - 9)):
            for xx in range(w):
                px[xx, yy] = (0, 0, 0, 0)
    return c


def cut_piece(root, item):
    """按登记表整件裁切;返回收紧后的整件图(bbox 尺寸须与登记宽高恰等,由自检兜底)。"""
    im = sheet(root, item['sheet'])
    x0, y0, x1, y1 = item['src']
    c = im.crop((x0, y0, x1, y1))
    if 'clean' in item:
        ka, kb, tclip = item['clean']
        c = clean_components(c, ka - y0, kb - y0, tclip)
    c = c.crop(c.getbbox())
    if item.get('flip'):
        c = c.transpose(Image.FLIP_LEFT_RIGHT)
    return c


def build_apartment(root, out_dir):
    rb = Image.open(os.path.join(root, '1_Interiors/48x48/Room_Builder_48x48.png')).convert('RGBA')
    W, H = GRID_W * C, GRID_H * C
    apt = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    # 1) 地板(按甲案分区;左上室外区留透明)
    fl = {k: cell(rb, *v) for k, v in FLOOR.items()}
    fl['corridor'] = fl[CORR_FLOOR]
    for gy in range(GRID_H):
        for gx in range(GRID_W):
            k = region(gx, gy)
            if k is None:
                continue
            apt.alpha_composite(fl[k], (gx * C, gy * C))
    log('  地板铺装完成(三间房三种花色+纵廊棋盘;左上为室外)')

    # 2) 墙面(北墙×2 段 + 厨房北隔墙,隔墙 c10-11 留 2 格门洞)
    def wall_tile(k):
        t = cell(rb, k, WALL_ROW_A).copy()
        t.alpha_composite(cell(rb, k, WALL_ROW_B).crop((0, C - 6, C, C)), (0, C - 6))
        return t
    wt = [wall_tile(k) for k in WALL_FACES]
    for gx in range(0, 10):
        apt.alpha_composite(wt[gx % 3], (gx * C, LIVING_TOP_ROW * C))
    for gx in range(10, GRID_W):
        apt.alpha_composite(wt[gx % 3], (gx * C, BED_TOP_ROW * C))
    for gx in range(12, GRID_W):
        apt.alpha_composite(wt[gx % 3], (gx * C, PART_ROW * C))
    log('  墙面完成(客厅/卧室北墙+厨房北隔墙,卧室门洞 c10-11 已留)')

    # 3) 白色天花描边(底缘三处门洞+纵廊街口敞开;竖向:外缘两道+客厅|右翼隔断+纵廊|厨房隔断)
    htrim = cell(rb, *HTRIM_CELL).crop((0, 0, C, 18))
    vtrim = cell(rb, *VTRIM_CELL).crop((0, 0, 21, C))
    htrim_b = htrim.transpose(Image.FLIP_TOP_BOTTOM)
    open_cols = set(DOOR_LIVING) | set(DOOR_KITCHEN) | set(CORR_COLS)
    for gx in range(GRID_W):
        if gx in open_cols:
            continue
        apt.alpha_composite(htrim_b, (gx * C, H - 18))
    for gy in range(GRID_H):
        if gy >= LIVING_TOP_ROW:
            apt.alpha_composite(vtrim, (0, gy * C))                                   # 客厅西外缘
        # 卧室西墙=客厅|右翼界墙:自窗顶到房底同线连续整柱 x480-501(第 11 单目验返修一:
        # 原上下两段错位 10px,沿卧室西边线呈断墙观感;归一后一条直墙,墙段闭合断言兜底)
        if (480, gy) not in INNER_SKIP:                                               # 第 16 单:客厅东墙内连门 r8-9 不落描边
            apt.alpha_composite(vtrim, (480, gy * C))
        apt.alpha_composite(vtrim.transpose(Image.FLIP_LEFT_RIGHT), (W - 21, gy * C))  # 东外缘
        if gy >= PART_ROW and (576 - 10, gy) not in INNER_SKIP:                       # 第 16 单:厨房西墙内连门 r9-10 不落描边
            apt.alpha_composite(vtrim, (576 - 10, gy * C))                            # 纵廊|厨房隔断柱
    log('  描边完成(底缘门洞 c5-6/c15-16 与纵廊街口 c10-11 已留;西界墙整柱在内连门 r8-9 处留口;'
        '纵廊|厨房隔断柱在内连门 r9-10 处留口)')

    # 3.5) 墙面构件:窗户×2(挂墙件,属基准层非家具层;墙体完整性断言以本层完成后为基准)
    win = sheet(root, '1_Generic_48x48.png').crop((393, 2085, 468, 2145))
    apt.alpha_composite(win, WIN_LIVING)
    apt.alpha_composite(win, WIN_BEDROOM)
    baseline = apt.copy()   # 「空房仅墙」基准(地板+墙+描边+双窗)
    log('  墙面构件完成(客厅/卧室双窗挂墙,入基准层)')

    # 4) 家具:按登记表整件落位(y 序落画,低者后画压高者);记录整件与落位供对外验真
    integrity = []
    placed = []
    for item in sorted(FURNITURE, key=lambda i: i['pos'][1] + i['size'][1]):
        piece = cut_piece(root, item)
        ew, eh = item['size']
        px_, py_ = item['pos']
        ok_size = piece.size == (ew, eh)
        ok_fit = px_ >= 0 and py_ >= 0 and px_ + ew <= W and py_ + eh <= H
        integrity.append((item['name'], piece.size, (ew, eh), ok_size and ok_fit))
        placed.append((item, piece))
        apt.alpha_composite(piece, (px_, py_))
    log('  家具整件落位完成(共 %d 件)' % len(FURNITURE))

    path = os.path.join(out_dir, 'apartment.png')
    apt.save(path)
    return apt, integrity, placed, baseline


# -------------------------------- 自检 -------------------------------------

def selfcheck(root, ch, ap, integrity, placed, baseline, bp):
    fails = []
    def ok(cond, msg):
        log(('  ok : ' if cond else '  FAIL: ') + msg)
        if not cond:
            fails.append(msg)

    log('—— 成品自检 characters.png ——')
    ok(ch.size == (1152, 768), f'尺寸恰为 1152×768(实测 {ch.size[0]}×{ch.size[1]})')
    ok(ch.size[0] % 24 == 0 and ch.size[1] % 8 == 0, '帧几何整除:宽÷24、高÷8 均为整数')
    fw, fh = ch.size[0] // 24, ch.size[1] // 8
    ok((fw, fh) == (48, 96), f'帧 48×96(实测 {fw}×{fh})')
    a = ch.split()[3]
    ok(a.getpixel((0, 0)) == 0 and a.getpixel((1151, 767)) == 0, '透明底(角点 alpha=0)')
    rows_ok = frames_ok = True
    row_sigs = []
    for r in range(8):
        row = ch.crop((0, r * fh, 1152, (r + 1) * fh))
        row_sigs.append(row.tobytes())
        if row.getbbox() is None:
            rows_ok = False
        for f in range(24):
            if row.crop((f * fw, 0, (f + 1) * fw, fh)).getbbox() is None:
                frames_ok = False
    ok(rows_ok, '八行全部非空')
    ok(frames_ok, '8×24=192 帧逐帧非空')
    ok(all(row_sigs[i * 2] != row_sigs[i * 2 + 1] for i in range(4)), '各人 idle 行与 walk 行内容不同')
    ok(len(set(row_sigs[::2])) == 4 and len(set(row_sigs[1::2])) == 4, '四人形象两两不同')

    log('—— 成品自检 apartment.png ——')
    W, H = GRID_W * C, GRID_H * C
    ok(ap.size == (W, H), f'尺寸恰为 {W}×{H}(实测 {ap.size[0]}×{ap.size[1]})')
    aa = ap.split()[3]
    indoor_opaque = True
    for gy in range(GRID_H):
        for gx in range(GRID_W):
            if region(gx, gy) is None:
                continue
            if aa.crop((gx * C, gy * C, (gx + 1) * C, (gy + 1) * C)).getextrema()[0] != 255:
                indoor_opaque = False
    ok(indoor_opaque, '室内区全幅不透明(无漏底)')
    ok(aa.crop((0, 0, 10 * C, 2 * C)).getextrema()[1] == 0, '左上室外区(c0-9×r0-1)全透明')

    # 门洞可走(与纯地板铺装逐字节比对=无实墙无家具;纵廊按两侧描边柱之间的净道带验)
    rbim = Image.open(os.path.join(root, '1_Interiors/48x48/Room_Builder_48x48.png')).convert('RGBA')
    fl = {k: cell(rbim, *FLOOR[k]) for k in FLOOR}
    fl['corridor'] = fl[CORR_FLOOR]
    floor_only = Image.new('RGBA', ap.size, (0, 0, 0, 0))
    for gy in range(GRID_H):
        for gx in range(GRID_W):
            k = region(gx, gy)
            if k is None:
                continue
            floor_only.alpha_composite(fl[k], (gx * C, gy * C))
    def strip_eq(x0, y0, x1, y1, label):
        got = ap.crop((x0, y0, x1, y1))
        ref = floor_only.crop((x0, y0, x1, y1))
        ok(got.tobytes() == ref.tobytes(), label)
    for gx in DOOR_LIVING:
        strip_eq(gx * C, H - 18, (gx + 1) * C, H, f'门洞可走:客厅底缘 c{gx}(纯地板,无实墙无家具)')
    for gx in DOOR_KITCHEN:
        strip_eq(gx * C, H - 18, (gx + 1) * C, H, f'门洞可走:厨房底缘 c{gx}(纯地板,无实墙无家具)')
    strip_eq(501, 2 * C, 566, H,
             '纵廊净道可走(x501-566,r2-r10):卧室门厅→隔墙门洞→纵廊→街口全程纯地板(净宽 65px≥人宽 48px)')
    # 内连门可走(第 16 单):竖描边整柱宽度内、门洞行区间与纯地板铺装逐字节一致。
    # 下缘 18px 为南墙自身的横描边带(规范二.5:描边属墙体厚度,不计入通道扣减),故净道验到 H-18 为止。
    for d in INNER_DOORS:
        y0, y1 = d['rows'][0] * C, min((d['rows'][1] + 1) * C, H - 18)
        strip_eq(d['trim_x'], y0, d['trim_x'] + 21, y1,
                 f"内连门可走:{d['name']}(x{d['trim_x']}-{d['trim_x'] + 21},r{d['rows'][0]}-{d['rows'][1]}"
                 f",净开口 {y1 - y0}px≥人宽 48px,纯地板无实墙无家具)")
    # 纵廊全柱零家具:c10-11 全行成品与基准逐字节一致(基准含描边与窗,家具零改写)
    corr_ok = True
    for gx in CORR_COLS:
        got = ap.crop((gx * C, 0, (gx + 1) * C, H))
        ref = baseline.crop((gx * C, 0, (gx + 1) * C, H))
        if got.tobytes() != ref.tobytes():
            corr_ok = False
    ok(corr_ok, '纵廊与卧室门厅(c10-11 全柱)零家具(与基准逐字节一致)')
    # 整件完整性:逐件 bbox 尺寸 = 登记宽高(±0)且完整落于画幅内
    all_ok = True
    for name, got_sz, exp_sz, good in integrity:
        if not good:
            all_ok = False
            log(f'       整件不符:{name} 实测 {got_sz} ≠ 登记 {exp_sz}')
    ok(all_ok, f'整件完整性:{len(integrity)} 件家具 bbox 尺寸=登记宽高(±0)且未越幅')
    # 四床铁律(甲案新增):零互叠、床间距≥1 格、全落卧室净区(纵廊东缘外、隔墙以上、外缘描边内)
    beds = [i for i in FURNITURE if i['name'].startswith('bed')]
    bed_ok = True
    for i, b in enumerate(beds):
        x0, y0 = b['pos']; x1, y1 = x0 + b['size'][0], y0 + b['size'][1]
        if not (x0 >= 576 + 11 and x1 <= W - 21 and y0 >= C - 6 and y1 <= PART_ROW * C):
            bed_ok = False
            log(f'       床越界:{b["name"]}')
        for b2 in beds[i + 1:]:
            X0, Y0 = b2['pos']; X1, Y1 = X0 + b2['size'][0], Y0 + b2['size'][1]
            gap_x = max(x0, X0) - min(x1, X1)
            gap_y = max(y0, Y0) - min(y1, Y1)
            if gap_x < C and gap_y < C:
                bed_ok = False
                log(f'       床间距不足:{b["name"]}×{b2["name"]}')
    ok(bed_ok, '四床铁律:零侵墙零侵纵廊零互叠,床间距≥1 格(48px)')
    # 逐件对外验真:件的可见像素(未被后画件遮盖)在成品中与源样逐像素一致
    log('—— 逐件对外验真表(件名/源区/可见像素/比对)——')
    verify_ok = True
    for idx, (item, piece) in enumerate(placed):
        px_, py_ = item['pos']
        pw, ph = piece.size
        pa = piece.load()
        covers = []
        for j in range(idx + 1, len(placed)):
            it2, pc2 = placed[j]
            covers.append((it2['pos'][0], it2['pos'][1], pc2.size[0], pc2.size[1], pc2.load()))
        aa2 = ap.load()
        vis_n = 0
        bad = 0
        for yy in range(ph):
            for xx in range(pw):
                if pa[xx, yy][3] == 0:
                    continue
                gx, gy = px_ + xx, py_ + yy
                covered = False
                for (cx0, cy0, cw2, ch2, ca) in covers:
                    if cx0 <= gx < cx0 + cw2 and cy0 <= gy < cy0 + ch2 and ca[gx - cx0, gy - cy0][3] > 0:
                        covered = True
                        break
                if covered:
                    continue
                vis_n += 1
                pr, pg, pb, p_al = pa[xx, yy]
                if p_al == 255:
                    if aa2[gx, gy][:3] != (pr, pg, pb):
                        bad += 1
                # 半透明边缘像素与地板混色,跳过逐值比对(数量极少)
        good = bad == 0
        verify_ok = verify_ok and good
        log(f"  {'ok ' if good else 'FAIL'} {item['name']:8s} 源区{item['src']} 可见{vis_n}px 不符{bad}px")
    ok(verify_ok, '逐件对外验真:全部件可见像素与源样逐像素一致')
    # 墙体完整性:墙体像素为不可侵占区——基准(空房仅墙)中属于墙/描边/窗的像素,
    # 在成品中逐像素一致;墙体掩膜=基准与纯地板铺装的差异像素
    fo, bl, fin = floor_only.load(), baseline.load(), ap.load()
    wall_px = viol = 0
    for yy in range(ap.size[1]):
        for xx in range(ap.size[0]):
            if bl[xx, yy] != fo[xx, yy]:
                wall_px += 1
                if fin[xx, yy] != bl[xx, yy]:
                    viol += 1
    ok(viol == 0, f'墙体完整性:墙体像素 {wall_px} 处与空房仅墙基准逐像素一致(家具层零改写,违例 {viol})')

    # —— 蓝图独立推导闭合巡检(制度修补):模型解析自 SIM 块 ROOMS/APT,与拼装常量零共享。
    # 认证链:ROOMS 推导墙段模型 → 认证基准图(空房仅墙)四边闭合仅门洞留口
    #        → 墙体完整性再保成品零改写基准 → 成品闭合性成立
    rooms, aptbp = bp
    ok((GRID_W, GRID_H) == (aptbp['w'], aptbp['h']),
       f"蓝图对账:APT {aptbp['w']}×{aptbp['h']} = 画幅格数 {GRID_W}×{GRID_H}")
    lv, kt, bd = rooms['living'], rooms['kitchen'], rooms['bedroom']
    coh = (lv['x'] + lv['w'] == bd['x'] and bd['y'] + bd['h'] == kt['y']
           and int(bd['doorx']) + 2 == kt['x']
           and kt['x'] + kt['w'] == bd['x'] + bd['w'] == aptbp['x'] + aptbp['w']
           and lv['y'] + lv['h'] == kt['y'] + kt['h'] == aptbp['y'] + aptbp['h'])
    ok(coh, '蓝图几何自洽:客厅东缘=卧室西缘、卧室南缘=厨房北缘、纵廊东缘=厨房西缘、三区南/东缘归包围盒')
    segs, cor = derive_wall_model(rooms, aptbp)
    zone_ok = True
    for gy in range(GRID_H):
        for gx in range(GRID_W):
            if zone_by_blueprint(rooms, cor, aptbp, gx, gy) != region(gx, gy):
                zone_ok = False
    ok(zone_ok, '分区对账:19×11 逐格分区(含纵廊与室外)与 ROOMS 独立推导逐格一致')
    from PIL import ImageChops
    dmask = None
    for band in ImageChops.difference(baseline, floor_only).split():
        b = band.point(lambda v: 255 if v else 0)
        dmask = b if dmask is None else ImageChops.lighter(dmask, b)
    def wallpx(x0, y0, x1, y1):
        x0 = max(0, x0); y0 = max(0, y0); x1 = min(W, x1); y1 = min(H, y1)
        if x1 <= x0 or y1 <= y0:
            return 0
        return dmask.crop((x0, y0, x1, y1)).histogram()[255]
    # 内连门对账:每洞恰对应楼身分组表一条穿墙走线(与三门洞对 door 字段同口径)
    hall_x, links = parse_building_plan()
    recon_inner = True
    log('—— 内连门对账表(游戏侧楼身分组表 BUILDING_PLAN.apt.link 为权威)——')
    for d in INNER_DOORS:
        hits = [(k, v) for k, v in links.items()
                if min(v['gx'], hall_x) < d['world_x'] < max(v['gx'], hall_x)
                and d['world_rows'][0] <= int(v['gy']) <= d['world_rows'][1]]
        if len(hits) != 1:
            recon_inner = False
        log(f"  {'ok ' if len(hits) == 1 else 'FAIL'} {d['name']}:世界 x={d['world_x']} "
            f"行 {d['world_rows'][0]}-{d['world_rows'][1]} ← " +
            (','.join(f"{k} 走线 gate x{v['gx']}→廊 x{hall_x} @y{v['gy']}" for k, v in hits) or '无对应走线'))
    ok(recon_inner, '内连门对账:每洞恰对应楼身分组表一条内连走线,穿墙点落在洞内(与 door 字段对账口径一致)')
    log('—— 墙段逐段清点表(蓝图独立推导 · 8 线 6 门洞;基准=空房仅墙)——')
    closure_ok = recon_ok = True
    for sg in segs:
        span = sg['hi'] - sg['lo']
        breaks = 0
        free = []
        run = None
        for t in range(sg['lo'], sg['hi']):
            if sg['axis'] == 'v':
                n = wallpx(sg['pos'] - 24, t, sg['pos'] + 24, t + 1)
            else:
                n = wallpx(t, sg['pos'] - 20, t + 1, sg['pos'] + 50)
            if n >= 8:
                if run:
                    free.append(tuple(run)); run = None
            else:
                run = [t, t + 1] if run is None else [run[0], t + 1]
                if not any(g0 - 2 <= t < g1 + 2 for g0, g1 in sg['gaps']):
                    breaks += 1
        if run:
            free.append(tuple(run))
        # 全段一致墙柱/墙带宽度:逐列(行)统计沿整段的墙覆盖率≥95% 的连续束宽
        if sg['axis'] == 'v':
            # 与 h 段同构:登记门洞区间不计入墙宽统计(第 16 单起 v 段也带门洞)
            good = span - sum(g1 - g0 for g0, g1 in sg['gaps'])
            def colpx(x):
                n = wallpx(x, sg['lo'], x + 1, sg['hi'])
                for g0, g1 in sg['gaps']:
                    n -= wallpx(x, g0, x + 1, g1)
                return n
            cols = [x for x in range(sg['pos'] - 24, sg['pos'] + 25) if good and colpx(x) >= 0.95 * good]
            need = 18
        else:
            good = span - sum(g1 - g0 for g0, g1 in sg['gaps'])
            def rowpx(y):
                n = wallpx(sg['lo'], y, sg['hi'], y + 1)
                for g0, g1 in sg['gaps']:
                    n -= wallpx(g0, y, g1, y + 1)
                return n
            cols = [y for y in range(sg['pos'] - 20, sg['pos'] + 50) if good and rowpx(y) >= 0.95 * good]
            need = 15
        width = 0
        cur = 0
        prev = None
        for c in cols:
            cur = cur + 1 if prev is not None and c == prev + 1 else 1
            width = max(width, cur)
            prev = c
        seg_ok = breaks == 0 and width >= need
        if not seg_ok:
            closure_ok = False
        openings = []
        for g0, g1 in sg['gaps']:
            net = [f for f in free if f[0] >= g0 - 2 and f[1] <= g1 + 2 and f[1] - f[0] >= 48]
            if len(net) != 1:
                recon_ok = False
            openings.append(net[0] if net else None)
        gtxt = '' if not sg['gaps'] else ' 门洞:' + ','.join(
            f"[{g0},{g1})净开口{(o[1] - o[0]) if o else 0}px" for (g0, g1), o in zip(sg['gaps'], openings))
        log(f"  {'ok ' if seg_ok else 'FAIL'} {sg['label']}  范围[{sg['lo']},{sg['hi']})px"
            f" 登记外断点{breaks}px 全段一致墙宽{width}px{gtxt}")
    ok(closure_ok, '墙段闭合性:8 条墙线沿边界逐像素巡检,除登记门洞外无断点,全段一致墙宽达标(竖≥18px/横≥15px)')
    ok(recon_ok, '门洞对账:全部门洞与 door 字段逐一对应,每洞恰一段≥48px 连续净开口,无登记外通口')
    return fails


def print_game_registry():
    """输出游戏侧硬编码登记(与 city-life-framework.html 内 FURN/SOLID 常量对照用)。"""
    log('—— 游戏侧登记(对照 city-life-framework.html)——')
    log('  FURN_TALL = ' + repr([(f['rect'], round(f['footY'], 3)) for f in GAME_FURN_TALL]))
    log('  SOLID = ' + repr(sorted(GAME_SOLID_CELLS)))


def main():
    ap_ = argparse.ArgumentParser()
    ap_.add_argument('--zip')
    ap_.add_argument('--pack-dir')
    ap_.add_argument('--out', default=os.environ.get('CITYLIFE_OUT', './out'))
    args = ap_.parse_args()
    root = resolve_pack(args)
    os.makedirs(args.out, exist_ok=True)
    inventory(root)
    log('—— 机器捏人 ——')
    ch = build_characters(root, args.out)
    log('—— 机器拼房 ——')
    ap, integrity, placed, baseline = build_apartment(root, args.out)
    fails = selfcheck(root, ch, ap, integrity, placed, baseline, parse_blueprint())
    print_game_registry()
    if fails:
        log(f'\n自检未过 {len(fails)} 项,产物不可交付')
        sys.exit(1)
    log('\n流水线全绿:characters.png 与 apartment.png 已产出,自检全过')

if __name__ == '__main__':
    main()
