#!/usr/bin/env python3
"""第 167 单·床件自检：apartment.png 里每张床的"床顶漂件"检查。

为什么有它：床件是从整张主题图里按窗口裁出来的，裁窗偶尔会把**贴邻家具**一起带进来；
它在成品里画在床头上方、与床体不相连，看上去就是"床上漂着一根不明物体"
（第 167 单决策者实报；根因见 build_assets.py 的 clean= 机制）。

口径（成品图是"地板＋家具"的不透明图，所以不用 alpha 连通域，用**纵向延续**尺）：
  床盒顶带（本地 y 0..8）里，逐个像素与"地板参考"比（参考＝同一列往上 48px＝上一块地砖，
  地板是 48px 周期，已实测）；凡与参考不同、且在**同一列向下延续不足 20px** 的像素，
  就是够不到床体的漂件 —— 床柱/枕头之类都向下一路连到床体（≥20px），不会被误伤。
  只查"盒顶落在地板区"的床（上铺两件顶上是北墙带，参考无意义，照实跳过并打印）。

用法：python tools/asset-pipeline/check_beds.py [apartment.png 路径]
      退出码 0＝过、1＝有漂件。
"""
import os
import sys

sys.dont_write_bytecode = True          # 不落 __pycache__

from PIL import Image

顶带高 = 9            # 本地 y 0..8
延续下限 = 20         # 向下延续 < 20px ⇒ 够不到床体


def 取床件():
    """从 build_assets.py 现读 FURNITURE 表——坐标不在这里写第二套。"""
    import importlib.util
    路径 = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build_assets.py')
    spec = importlib.util.spec_from_file_location('build_assets_for_check', 路径)
    ba = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ba)
    return [i for i in ba.FURNITURE if i['name'].startswith('bed')]


def 顶带漂件(im, item):
    """回 [(x, y)] —— 盒顶带里"与地砖参考不同、且同列向下延续 <20px"的像素。"""
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


def main():
    路径 = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'apartment.png')
    im = Image.open(路径).convert('RGBA')
    坏 = []
    跳过 = []
    for it in 取床件():
        x0, y0 = it['pos']
        if y0 < 96:                            # 上铺两件：顶上是北墙带，地砖参考不成立
            跳过.append(it['name'])
            continue
        漂 = 顶带漂件(im, it)
        if 漂:
            xs = [p[0] for p in 漂]
            ys = [p[1] for p in 漂]
            坏.append((it['name'], (min(xs), min(ys), max(xs), max(ys)), len(漂)))
    if 跳过:
        print('[note] 顶上是墙带、照实跳过的床件：' + '／'.join(跳过))
    if 坏:
        for 名, bbox, n in 坏:
            print(f'[FAIL] {名} 床顶漂件 bbox={bbox} 像素={n}')
        print(f'床件自检：{len(坏)} 处漂件 => 判红')
        sys.exit(1)
    print('[ok] 床件自检：受检床件顶带零漂件')
    sys.exit(0)


if __name__ == '__main__':
    main()
