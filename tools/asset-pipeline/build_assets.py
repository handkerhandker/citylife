#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
素材流水线(第 10 单):从 LimeZu Modern Interiors 原包程序化产出两张成品图。

  产出 A characters.png(1152×768):四住户行走图,八行铁律
      行序 = 顾idle/顾walk/沈idle/沈walk/陆idle/陆walk/白idle/白walk
      每行 24 帧 = 面向右/上/左/下各 6 帧(生成器图层表原样顺序),帧 48×96,透明底
  产出 B apartment.png(768×432):公寓三间房拼合图,16×9 格 × 48px
      布局表 = docs/素材制作说明.md 第三章(客厅 1-10 列、厨房 11-16×1-4、卧室 11-16×5-9,
      三门洞:客厅下缘第 6 列、卧室下缘第 13 列、厨卧隔墙第 13 列)

授权红线:本脚本只读原包、只出两张拼合成品;原包与其任何中间文件不入仓库、不上公网。
原包位置经运行时参数/环境变量注入,仓库内零素材、零下载地址。

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
# 配方 B:公寓图块(Room_Builder 与 Theme_Sorter 表,均为 48px 档;坐标单位=48px 格)
GRID_W, GRID_H = 16, 9
FLOOR = dict(living=(35, 22), kitchen=(47, 14), bedroom=(35, 30))  # 金木板/灰白棋盘/编木纹
WALL_FACES = [0, 1, 2]        # 奶油墙面三连(Room_Builder 行 17,含白色压顶;踢脚线取行 18 底 6px)
WALL_ROW_A, WALL_ROW_B = 17, 18
HTRIM_CELL, VTRIM_CELL = (6, 0), (8, 0)   # 白色天花描边:横条(取上 18px)/竖条(取左 21px)
DOOR_COLS = (5, 12)           # 底缘门洞(0 基列)= 布局表第 6 列、第 13 列
PART_GAP_COL = 12             # 厨卧隔墙门洞(0 基)= 布局表第 13 列
PART_ROW = 4                  # 隔墙所在行(卧室顶行)


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
    # 兼容 zip 内多一层目录的情况
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
    """盘点摘要(仅目录结构与数量,不含任何路径串以外的敏感信息)。"""
    log('—— 原包盘点 ——')
    for top in sorted(os.listdir(root)):
        p = os.path.join(root, top)
        if os.path.isdir(p):
            n = sum(len(fs) for _, _, fs in os.walk(p))
            log(f'  {top}/  共 {n} 个文件')
    cg = os.path.join(root, '2_Characters/Character_Generator')
    if os.path.isdir(cg):
        for part in sorted(os.listdir(cg)):
            q = os.path.join(cg, part, '48x48')
            if os.path.isdir(q):
                log(f'  部件 {part}: 48px 档 {len(os.listdir(q))} 件')


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


def bbox_crop(im, x0, y0, x1, y1):
    c = im.crop((int(x0 * C), int(y0 * C), int(x1 * C), int(y1 * C)))
    return c.crop(c.getbbox())


def clean_crop(im, x0, y0, x1, y1, keep_y0, keep_y1, top_clip=False):
    """像素窗裁切(参数为绝对像素),仅保留与 [keep_y0,keep_y1) 纵带相交的 alpha 连通域;
    top_clip 时把纵带上沿-9px 以上残留清除(床头顶线)。用于图集内贴邻摆放的家具。"""
    c = im.crop((int(x0), int(y0), int(x1), int(y1)))
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
    ka, kb = keep_y0 - int(y0), keep_y1 - int(y0)
    for comp in comps:
        if not any(ka <= y_ < kb for _, y_ in comp):
            for x_, y_ in comp:
                px[x_, y_] = (0, 0, 0, 0)
    if top_clip:
        for yy in range(max(0, ka - 9)):
            for xx in range(w):
                px[xx, yy] = (0, 0, 0, 0)
    return c.crop(c.getbbox())


def paste_c(canvas, item, cx_px, bottom_px):
    canvas.alpha_composite(item, (int(cx_px - item.width / 2), int(bottom_px - item.height)))


def paste_l(canvas, item, left_px, bottom_px):
    canvas.alpha_composite(item, (int(left_px), int(bottom_px - item.height)))


def build_apartment(root, out_dir):
    rb = Image.open(os.path.join(root, '1_Interiors/48x48/Room_Builder_48x48.png')).convert('RGBA')
    LV = sheet(root, '2_LivingRoom_48x48.png')
    BD = sheet(root, '4_Bedroom_48x48.png')
    KT = sheet(root, '12_Kitchen_48x48.png')
    GN = sheet(root, '1_Generic_48x48.png')
    CL = sheet(root, '5_Classroom_and_library_48x48.png')
    W, H = GRID_W * C, GRID_H * C
    apt = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    # 1) 地板:客厅金木板 / 厨房棋盘 / 卧室编木纹
    fl = {k: cell(rb, *v) for k, v in FLOOR.items()}
    for gy in range(GRID_H):
        for gx in range(GRID_W):
            k = 'living' if gx <= 9 else ('kitchen' if gy <= 3 else 'bedroom')
            apt.alpha_composite(fl[k], (gx * C, gy * C))
    log('  地板铺装完成(三间房三种花色)')

    # 2) 墙面:北墙 row0 全宽;厨卧隔墙 row4(留门洞);面砖含白压顶+踢脚线
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

    # 3) 白色天花描边:底缘(留两门洞)/左右外缘/客厅右侧竖隔断(骑缝 x=480)
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
    log('  描边完成(底缘两门洞已留:第 6、13 列)')

    # 4) 家具(位置对应 SIM 锚点;下方后画压上方)
    window = bbox_crop(GN, 8, 43, 10, 45)
    apt.alpha_composite(window, (int(3 * C + (2 * C - window.width) / 2), 4))
    paste_c(apt, bbox_crop(LV, 2, 0, 4, 2),  2.0 * C, 1.9 * C)     # 电视(锚点 home_tv)
    paste_c(apt, bbox_crop(LV, 4, 28, 7, 30), 2.0 * C, 4.0 * C)    # 沙发
    paste_c(apt, bbox_crop(LV, 10, 24, 12, 27), 6.0 * C, 2.9 * C)  # 书架
    paste_c(apt, bbox_crop(CL, 5, 1, 7, 3),  8.0 * C, 2.85 * C)    # 写作角书桌(home_desk)
    paste_c(apt, bbox_crop(LV, 10, 0, 12, 2), 0.75 * C, 2.1 * C)   # 盆栽
    table = bbox_crop(GN, 0, 34, 3, 37)                            # 深木餐桌(home_table)
    chair_r = bbox_crop(GN, 9, 50, 10, 52)
    chair_l = chair_r.transpose(Image.FLIP_LEFT_RIGHT)             # 镜像成对
    paste_c(apt, chair_r, 3.35 * C, 5.55 * C)
    paste_c(apt, chair_l, 6.65 * C, 5.55 * C)
    paste_c(apt, table, 5.0 * C, 6.15 * C)
    paste_c(apt, bbox_crop(KT, 8, 10.7, 9, 13), 12.5 * C, 3.0 * C)   # 灶台(kitchen)
    paste_c(apt, bbox_crop(KT, 2, 9, 3, 10.6), 13.5 * C, 2.75 * C)   # 料理台×2
    paste_c(apt, bbox_crop(KT, 3, 9, 4, 10.6), 14.5 * C, 2.75 * C)
    paste_c(apt, bbox_crop(KT, 9, 22, 10, 25), 15.4 * C, 2.95 * C)   # 冰箱
    log('  客厅与厨房家具完成')

    # 5) 四床(横置;bed1 顾西上 / bed2 沈东上 / bed3 陆西下 / bed4 白东下,四色各异)
    beds = dict(
        lightblue=clean_crop(BD, 0, 1858, 106, 1924, 1875, 1920, True),
        sage=clean_crop(BD, 0, 1954, 106, 2020, 1971, 2016, True),
        teal=clean_crop(BD, 0, 2050, 106, 2116, 2067, 2112, True),
        yellow=clean_crop(BD, 144, 1987, 252, 2112, 2060, 2110),
    )
    paste_l(apt, beds['lightblue'], 494, 6.4 * C)
    paste_l(apt, beds['teal'],      640, 6.4 * C)
    paste_l(apt, beds['sage'],      494, 8.58 * C)
    paste_l(apt, beds['yellow'],    633, 8.62 * C)
    log('  卧室四床完成(走廊第 13 列全程无遮挡)')

    path = os.path.join(out_dir, 'apartment.png')
    apt.save(path)
    return apt


# -------------------------------- 自检 -------------------------------------

def selfcheck(ch, ap):
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
    # 三门洞可走:门洞区域应与该房间地板图案逐像素一致,不得出现墙/描边像素
    rbim = Image.open(os.path.join(_ROOT, '1_Interiors/48x48/Room_Builder_48x48.png')).convert('RGBA')
    def door_clear(gx, gy, floor_key, label):
        got = ap.crop((gx * C, gy * C + C - 18, gx * C + C, (gy + 1) * C))  # 门洞下缘描边带位置
        ref = cell(rbim, *FLOOR[floor_key]).crop((0, C - 18, C, C))
        ok(got.tobytes() == ref.tobytes(), f'门洞可走:{label}(该处为纯地板,无实墙)')
    door_clear(5, 8, 'living', '客厅下缘第 6 列')
    door_clear(12, 8, 'bedroom', '卧室下缘第 13 列')
    got = ap.crop((PART_GAP_COL * C, PART_ROW * C, (PART_GAP_COL + 1) * C, (PART_ROW + 1) * C))
    ref = cell(rbim, *FLOOR['bedroom'])
    ok(got.tobytes() == ref.tobytes(), '门洞可走:厨卧隔墙第 13 列(整格纯地板)')
    return fails


_ROOT = None

def main():
    global _ROOT
    ap_ = argparse.ArgumentParser()
    ap_.add_argument('--zip')
    ap_.add_argument('--pack-dir')
    ap_.add_argument('--out', default=os.environ.get('CITYLIFE_OUT', './out'))
    args = ap_.parse_args()
    root = resolve_pack(args)
    _ROOT = root
    os.makedirs(args.out, exist_ok=True)
    inventory(root)
    log('—— 机器捏人 ——')
    ch = build_characters(root, args.out)
    log('—— 机器拼房 ——')
    ap = build_apartment(root, args.out)
    fails = selfcheck(ch, ap)
    if fails:
        log(f'\n自检未过 {len(fails)} 项,产物不可交付')
        sys.exit(1)
    log('\n流水线全绿:characters.png 与 apartment.png 已产出,自检全过')

if __name__ == '__main__':
    main()
