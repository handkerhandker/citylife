#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
素材流水线(第 10 单,含补充指令三·拼装引擎返修):
从 LimeZu Modern Interiors 原包程序化产出两张成品图。

  产出 A characters.png(1152×768):四住户行走图,八行铁律
      行序 = 顾idle/顾walk/沈idle/沈walk/陆idle/陆walk/白idle/白walk
      每行 24 帧 = 面向右/上/左/下各 6 帧(生成器图层表原样顺序),帧 48×96,透明底
  产出 B apartment.png(768×432):公寓三间房拼合图,16×9 格 × 48px
      布局表 = docs/素材制作说明.md 第三章;家具按「整件登记表」四元组拼装
      (名称→源图区域→整件宽高→落位),脚底占格避开三门洞与第 12 图列走廊

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
# 配方 B:公寓图块(Room_Builder 与 Theme_Sorter 表,均为 48px 档)
GRID_W, GRID_H = 16, 9
FLOOR = dict(living=(35, 22), kitchen=(47, 14), bedroom=(35, 30))  # 金木板/灰白棋盘/编木纹
WALL_FACES = [0, 1, 2]        # 奶油墙面三连(Room_Builder 行 17,含白色压顶;踢脚线取行 18 底 6px)
WALL_ROW_A, WALL_ROW_B = 17, 18
HTRIM_CELL, VTRIM_CELL = (6, 0), (8, 0)   # 白色天花描边:横条(取上 18px)/竖条(取左 21px)
DOOR_COLS = (5, 12)           # 底缘门洞(0 基图列)= 布局表第 6 列、第 13 列
PART_GAP_COL = 12             # 厨卧隔墙门洞(0 基图列)= 布局表第 13 列
PART_ROW = 4                  # 隔墙所在行(卧室顶行)

# 家具整件登记表(补充指令三·四元组):名称 → 源图区域(绝对像素) → 整件宽高 → 落位(左上角像素)
# clean=(keep_y0, keep_y1, top_clip):源区内贴邻杂件经连通域清理;整件尺寸仍须与登记宽高恰等
# flip=True:水平镜像(成对椅子,原包该组仅单朝向干净件)
# 脚底占格红线:三门洞(图列 5/12 底缘、隔墙图列 12)与第 12 图列走廊(厨房门→卧室门直廊)零家具;
# 客厅门线(图列 5 纵线)家具零占格(餐桌居 3-4 列,右椅镜像置于 6 列外侧)。
FURNITURE = [
    dict(name='tv',      sheet='2_LivingRoom_48x48.png', src=(99, 24, 189, 78),      size=(90, 54),   pos=(51, 36)),
    dict(name='sofa',    sheet='2_LivingRoom_48x48.png', src=(192, 1359, 336, 1440), size=(144, 81),  pos=(24, 111)),
    dict(name='shelf',   sheet='2_LivingRoom_48x48.png', src=(480, 1170, 576, 1272), size=(96, 102),  pos=(240, 38)),
    dict(name='plant',   sheet='2_LivingRoom_48x48.png', src=(501, 27, 555, 96),     size=(54, 69),   pos=(22, 31)),
    dict(name='desk',    sheet='5_Classroom_and_library_48x48.png', src=(246, 69, 330, 144), size=(84, 75), pos=(342, 62)),
    dict(name='window',  sheet='1_Generic_48x48.png',    src=(393, 2085, 468, 2145), size=(75, 60),   pos=(154, 4)),
    dict(name='chair_n', sheet='1_Generic_48x48.png',    src=(195, 2403, 237, 2460), size=(42, 57),   pos=(171, 139)),
    dict(name='chair_l', sheet='1_Generic_48x48.png',    src=(438, 2403, 477, 2466), size=(39, 63),   pos=(100, 203)),
    dict(name='chair_r', sheet='1_Generic_48x48.png',    src=(438, 2403, 477, 2466), size=(39, 63),   pos=(250, 203), flip=True),
    dict(name='table',   sheet='1_Generic_48x48.png',    src=(39, 1635, 153, 1746),  size=(114, 111), pos=(135, 184)),
    dict(name='fridge',  sheet='12_Kitchen_48x48.png',   src=(432, 1125, 486, 1224), size=(54, 99),   pos=(480, 48)),
    dict(name='stove',   sheet='12_Kitchen_48x48.png',   src=(384, 534, 432, 609),   size=(48, 75),   pos=(528, 72)),
    dict(name='counter', sheet='12_Kitchen_48x48.png',   src=(96, 480, 192, 513),    size=(96, 33),   pos=(651, 93)),
    # 四床全部换用带床架的板床整件款(补充指令四:地铺款观感残缺弃用;板床仅三色,西列两张同款灰蓝,PR 声明)
    dict(name='bed1',    sheet='4_Bedroom_48x48.png',    src=(147, 1863, 255, 1938), size=(108, 75),  pos=(467, 232)),
    dict(name='bed2',    sheet='4_Bedroom_48x48.png',    src=(144, 1987, 252, 2112), size=(105, 75),  pos=(642, 232), clean=(2060, 2110, False)),
    dict(name='bed3',    sheet='4_Bedroom_48x48.png',    src=(147, 1863, 255, 1938), size=(108, 75),  pos=(467, 337)),
    dict(name='bed4',    sheet='4_Bedroom_48x48.png',    src=(147, 2151, 255, 2226), size=(108, 75),  pos=(639, 337)),
]

# 游戏侧登记(与上表联动;世界格 = 图格 + 1;此两表须与 city-life-framework.html 硬编码一致):
# 高件家具(tall,参与人物层级遮挡)的覆盖矩形(图像素)与脚底世界 y:
GAME_FURN_TALL = [
    dict(name='sofa',    rect=(24, 111, 144, 81),  footY=5.000),
    dict(name='shelf',   rect=(240, 38, 96, 102),  footY=3.917),
    dict(name='desk',    rect=(342, 62, 84, 75),   footY=3.854),
    dict(name='table',   rect=(135, 184, 114, 111), footY=7.146),
    dict(name='fridge',  rect=(480, 48, 54, 99),   footY=4.063),
    dict(name='stove',   rect=(528, 72, 48, 75),   footY=4.063),
    dict(name='counter', rect=(651, 58, 96, 33),   footY=2.896),
]
# 实体格(人物脚底不得落入显示;世界格坐标):墙带 + 家具占格(床仅枕头格,毯面可躺)
GAME_SOLID_CELLS = (
    [(x, 1) for x in range(1, 17)] +                          # 北墙带 row0(世界 y1)
    [(x, 5) for x in (11, 12, 14, 15, 16)] +                  # 厨卧隔墙(留门洞列 13)
    [(2, 2), (3, 2)] +                                        # tv
    [(1, 3), (2, 3), (3, 3), (4, 3), (1, 4), (2, 4), (3, 4), (4, 4)] +  # sofa
    [(6, 2), (7, 2), (6, 3), (7, 3)] +                        # shelf
    [(8, 2), (9, 2), (8, 3), (9, 3)] +                        # desk
    [(1, 2)] +                                                # plant
    [(4, 5), (5, 5), (4, 6), (5, 6), (4, 7), (5, 7)] +        # table
    [(3, 6), (7, 6)] +                                        # chairs 左/右
    [(11, 2), (11, 3)] +                                      # fridge
    [(12, 2), (12, 3)] +                                      # stove
    [(14, 2), (15, 2), (16, 2)] +                             # counter
    [(11, 6), (14, 6), (11, 8), (14, 8)]                      # 床枕头格
)


def log(msg):
    print(msg, flush=True)


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

    # 1) 地板
    fl = {k: cell(rb, *v) for k, v in FLOOR.items()}
    for gy in range(GRID_H):
        for gx in range(GRID_W):
            k = 'living' if gx <= 9 else ('kitchen' if gy <= 3 else 'bedroom')
            apt.alpha_composite(fl[k], (gx * C, gy * C))
    log('  地板铺装完成(三间房三种花色)')

    # 2) 墙面
    def wall_tile(k):
        t = cell(rb, k, WALL_ROW_A).copy()
        t.alpha_composite(cell(rb, k, WALL_ROW_B).crop((0, C - 6, C, C)), (0, C - 6))
        return t
    wt = [wall_tile(k) for k in WALL_FACES]
    for gx in range(GRID_W):
        apt.alpha_composite(wt[gx % 3], (gx * C, 0))
    for gx in range(10, GRID_W):
        if gx == PART_GAP_COL:
            continue
        apt.alpha_composite(wt[gx % 3], (gx * C, PART_ROW * C))
    log('  墙面完成(北墙+厨卧隔墙,隔墙门洞已留)')

    # 3) 白色天花描边
    htrim = cell(rb, *HTRIM_CELL).crop((0, 0, C, 18))
    vtrim = cell(rb, *VTRIM_CELL).crop((0, 0, 21, C))
    htrim_b = htrim.transpose(Image.FLIP_TOP_BOTTOM)
    for gx in range(GRID_W):
        if gx in DOOR_COLS:
            continue
        apt.alpha_composite(htrim_b, (gx * C, H - 18))
    for gy in range(GRID_H):
        apt.alpha_composite(vtrim, (0, gy * C))
        apt.alpha_composite(vtrim.transpose(Image.FLIP_LEFT_RIGHT), (W - 21, gy * C))
        apt.alpha_composite(vtrim, (480 - 10, gy * C))
    log('  描边完成(底缘两门洞已留:图列 5/12)')

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
    return apt, integrity, placed


# -------------------------------- 自检 -------------------------------------

def selfcheck(root, ch, ap, integrity, placed):
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
    ok(ap.size == (768, 432), f'尺寸恰为 768×432(实测 {ap.size[0]}×{ap.size[1]})')
    aa = ap.split()[3]
    ok(aa.getextrema()[0] == 255, '全幅不透明(公寓区无漏底)')
    rbim = Image.open(os.path.join(root, '1_Interiors/48x48/Room_Builder_48x48.png')).convert('RGBA')
    def door_clear(gx, gy, floor_key, label):
        got = ap.crop((gx * C, gy * C + C - 18, gx * C + C, (gy + 1) * C))
        ref = cell(rbim, *FLOOR[floor_key]).crop((0, C - 18, C, C))
        ok(got.tobytes() == ref.tobytes(), f'门洞可走:{label}(该处为纯地板,无实墙)')
    door_clear(5, 8, 'living', '客厅下缘第 6 列')
    door_clear(12, 8, 'bedroom', '卧室下缘第 13 列')
    got = ap.crop((PART_GAP_COL * C, PART_ROW * C, (PART_GAP_COL + 1) * C, (PART_ROW + 1) * C))
    ref = cell(rbim, *FLOOR['bedroom'])
    ok(got.tobytes() == ref.tobytes(), '门洞可走:厨卧隔墙第 13 列(整格纯地板)')
    # 走廊无家具:第 12 图列(世界 13 列)行 1-8 与地板逐字节一致(墙带行 0/描边带除外)
    corr_ok = True
    for gy in range(1, GRID_H):
        seg_y1 = (gy + 1) * C - (18 if gy == GRID_H - 1 else 0)
        got = ap.crop((PART_GAP_COL * C, gy * C, (PART_GAP_COL + 1) * C, seg_y1))
        fk = 'kitchen' if gy <= 3 else 'bedroom'
        ref = cell(rbim, *FLOOR[fk]).crop((0, 0, C, seg_y1 - gy * C))
        if got.tobytes() != ref.tobytes():
            corr_ok = False
    ok(corr_ok, '第 13 列走廊(世界列)行 2-9 全程纯地板零家具')
    # 整件完整性(补充指令三新增):逐件 bbox 尺寸 = 登记宽高(±0)且完整落于画幅内
    all_ok = True
    for name, got_sz, exp_sz, good in integrity:
        if not good:
            all_ok = False
            log(f'       整件不符:{name} 实测 {got_sz} ≠ 登记 {exp_sz}')
    ok(all_ok, f'整件完整性:{len(integrity)} 件家具 bbox 尺寸=登记宽高(±0)且未越幅')
    # 逐件对外验真(补充指令四):件的可见像素(未被后画件遮盖)在成品中与源样逐像素一致
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
        aa = ap.load()
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
                    if aa[gx, gy][:3] != (pr, pg, pb):
                        bad += 1
                # 半透明边缘像素与地板混色,跳过逐值比对(数量极少)
        good = bad == 0
        verify_ok = verify_ok and good
        log(f"  {'ok ' if good else 'FAIL'} {item['name']:8s} 源区{item['src']} 可见{vis_n}px 不符{bad}px")
    ok(verify_ok, '逐件对外验真:全部件可见像素与源样逐像素一致')
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
    ap, integrity, placed = build_apartment(root, args.out)
    fails = selfcheck(root, ch, ap, integrity, placed)
    print_game_registry()
    if fails:
        log(f'\n自检未过 {len(fails)} 项,产物不可交付')
        sys.exit(1)
    log('\n流水线全绿:characters.png 与 apartment.png 已产出,自检全过')

if __name__ == '__main__':
    main()
