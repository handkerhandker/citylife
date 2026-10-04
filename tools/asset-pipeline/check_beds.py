#!/usr/bin/env python3
"""第 167 单·床件自检（第 192 单扩到"四张床全覆盖"）：apartment.png 里每张床的"床顶漂件"检查。

为什么有它：床件是从整张主题图里按窗口裁出来的，裁窗偶尔会把**贴邻家具**一起带进来；
它在成品里画在床头上方、与床体不相连，看上去就是"床上漂着一根不明物体"
（第 167 单决策者实报；根因见 build_assets.py 的 clean= 机制）。

两种覆盖（第 192 单起）：
  ① 语义尺（只有"盒顶落在地板区"的床有参考）：床盒顶带（本地 y 0..8）逐个像素与"上一块地砖"
     比（参考＝同一列往上 48px，地板是 48px 周期，已实测）；凡与参考不同、且在同一列向下
     延续不足 20px 的像素，就是够不到床体的漂件。
     —— 上铺两件（bed1／bed2）顶上是**北墙带**，这把尺不适用：**实测会误伤**（床角那块
     3×3 的地板缺口会被判成漂件），故照实跳过并打印。
  ② 裁片冻结基线（四张床全覆盖，含上铺两件）：每张床的裁片 (pos,size) 逐字节 sha256 与
     `床件裁片基线.json` 的登记值比对。**任何"裁窗漂移／素材换版"都会判红**，逼一次人工目验
     与重登记——上铺两件就靠这一条盯住。
     ⚠ 换素材后基线**预期会红**：重跑流水线 → 人工目验四张床的顶带 → `--登记` 刷新即可。

用法：
  python tools/asset-pipeline/check_beds.py [apartment.png 路径]
  python tools/asset-pipeline/check_beds.py --登记        # 人工目验通过后刷新冻结基线
  退出码 0＝过（基线一致 ＋ 受检床件零漂件）、1＝有漂件或基线漂移。
"""
import hashlib
import json
import os
import sys

sys.dont_write_bytecode = True          # 不落 __pycache__

try:                                    # 输出一律 UTF-8（重定向成证据文件时不再乱码）
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

from PIL import Image

顶带高 = 9            # 本地 y 0..8
延续下限 = 20         # 向下延续 < 20px ⇒ 够不到床体
基线文件名 = '床件裁片基线.json'


def 壳目录():
    return os.path.dirname(os.path.abspath(__file__))


def 取床件():
    """从 build_assets.py 现读 FURNITURE 表——坐标不在这里写第二套。"""
    import importlib.util
    路径 = os.path.join(壳目录(), 'build_assets.py')
    spec = importlib.util.spec_from_file_location('build_assets_for_check', 路径)
    ba = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ba)
    return [i for i in ba.FURNITURE if i['name'].startswith('bed')]


def 顶带漂件(im, item):
    """回 [(x, y)] —— 盒顶带里"与地砖参考不同、且同列向下延续 <20px"的像素（只用于地板区的床）。"""
    x0, y0 = item['pos']
    w, h = item['size']
    px = im.load()
    漂 = []
    for 本y in range(顶带高):
        y = y0 + 本y
        for x in range(x0, x0 + w):
            if px[x, y] == px[x, y - 48]:
                continue                      # 与上一块地砖一致 ⇒ 是地板
            延 = 0
            yy = y
            while yy < y0 + h and px[x, yy] != px[x, yy - 48]:
                延 += 1
                yy += 1
            if 延 < 延续下限:
                漂.append((x, y))
    return 漂


def 裁片哈希(im, item):
    """床件裁片 (pos,size) 的逐字节 sha256——冻结基线的最小单位。"""
    x0, y0 = item['pos']
    w, h = item['size']
    return hashlib.sha256(im.crop((x0, y0, x0 + w, y0 + h)).tobytes()).hexdigest()


def 组新基线(im, 件表):
    return {
        '口径': '四张床裁片 (pos,size) 逐字节 sha256；换素材后须人工目验顶带再 --登记 刷新',
        '件': {it['name']: {'pos': list(it['pos']), 'size': list(it['size']),
                            'sha256': 裁片哈希(im, it)} for it in 件表},
    }


def 基线核对(im, 件表, 登记):
    """返回 (坏列表, 新基线)。登记=True 时把当前四张裁片写进基线文件。"""
    新 = 组新基线(im, 件表)
    路径 = os.path.join(壳目录(), 基线文件名)
    if 登记:
        with open(路径, 'w', encoding='utf-8') as f:
            json.dump(新, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print('[登记] 已刷新裁片冻结基线：' + 路径)
        return [], 新
    if not os.path.exists(路径):
        return [('(基线缺失)', '人工目验四张床后跑 --登记')], 新
    with open(路径, encoding='utf-8') as f:
        旧 = json.load(f)
    旧件 = 旧.get('件') or {}
    坏 = []
    for 名, 今 in 新['件'].items():
        昔 = 旧件.get(名)
        if (not 昔) or 昔.get('sha256') != 今['sha256'] or 昔.get('pos') != 今['pos'] or 昔.get('size') != 今['size']:
            旧记 = (昔 or {}).get('sha256')
            坏.append((名, (旧记[:12] + '… → ' + 今['sha256'][:12] + '…') if 旧记 else '登记里没有这一件'))
    return 坏, 新


def main():
    参数 = [a for a in sys.argv[1:] if not a.startswith('--')]
    登记 = '--登记' in sys.argv
    路径 = 参数[0] if 参数 else os.path.join(壳目录(), '..', '..', 'assets', 'apartment.png')
    im = Image.open(路径).convert('RGBA')
    件表 = 取床件()

    # ① 语义自检（只有"盒顶落在地板区"的床有地砖参考）
    坏 = []
    跳过 = []
    for it in 件表:
        x0, y0 = it['pos']
        if y0 < 96:                            # 上铺两件：顶上是北墙带，地砖参考不成立
            跳过.append(it['name'])
            continue
        漂 = 顶带漂件(im, it)
        if 漂:
            xs = [p[0] for p in 漂]
            ys = [p[1] for p in 漂]
            坏.append((it['name'], (min(xs), min(ys), max(xs), max(ys)), len(漂)))

    # ② 冻结基线（四张床全覆盖；登记前先过语义自检——不把病态锁进基线）
    if 登记:
        if 坏:
            print('[FAIL] 语义自检仍有漂件，**拒绝登记**（先修干净再登记）')
            for 名, bbox, n in 坏:
                print(f'[FAIL] {名} 床顶漂件 bbox={bbox} 像素={n}')
            sys.exit(1)
        基线核对(im, 件表, True)
        if 跳过:
            print('[note] 顶上是墙带、语义尺不适用（由冻结基线覆盖）的床件：' + '／'.join(跳过))
        print('[ok] 床件自检：冻结基线已刷新；受检床件顶带零漂件')
        sys.exit(0)

    基线坏, _ = 基线核对(im, 件表, False)

    if 跳过:
        print('[note] 顶上是墙带、语义尺不适用（由冻结基线覆盖）的床件：' + '／'.join(跳过))
    for 名, 详 in 基线坏:
        print(f'[FAIL] {名} 裁片与冻结基线不一致：{详}')
    for 名, bbox, n in 坏:
        print(f'[FAIL] {名} 床顶漂件 bbox={bbox} 像素={n}')
    if 基线坏 or 坏:
        if 基线坏:
            print('提示：换过素材/裁窗就人工目验四张床的顶带，然后 python tools/asset-pipeline/check_beds.py --登记')
        print(f'床件自检：{len(基线坏)} 处基线漂移 ＋ {len(坏)} 处漂件 => 判红')
        sys.exit(1)
    print('[ok] 床件自检：四张裁片与冻结基线一致 ＋ 受检床件顶带零漂件')
    sys.exit(0)


if __name__ == '__main__':
    main()
