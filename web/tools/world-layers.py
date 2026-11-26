# The layers of the world of Vasilad, from the user's map (assets/mappa/): 1 pixel = 1 metre, the map is 2048 x 1536.
#   vasilad_pulita.jpg  the map with nothing on it: land and sea, snow, ice, green and brown ground
#   vasilad.jpg         the same map with its drawings: mountains, hills, trees, places, names
# The drawings are what differs between the two: trees (dark green) make the forests, the rest (mountains, hills)
# the relief, except where a place, a name, a bridge or the tower is drawn (NOT_RELIEF below, in map pixels).
# Out (web/src/game3d/mondo/, read by terrain.js):
#   costa.png   1024 x 768 (2 m a pixel), grey: 128 + the distance from the coast in metres (more inland, less at sea)
#   rilievo.png 512 x 384 (4 m a pixel): R mountains, G hills, B forest (0..255)
#   suolo.png   512 x 384: R snow, G dry ground (brown on the map), B ice
#   pendii.png  512 x 384: the feet of the mountains (R) and of the hills (G): their drawings widely blurred, so the
#               ground rises, rough, long before them (terrain.js)
# Usage: python3 tools/world-layers.py [preview.png]
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC, OUT = ROOT / "assets/mappa", ROOT / "web/src/game3d/mondo"
W, H = 2048, 1536

clean = np.asarray(Image.open(SRC / "vasilad_pulita.jpg").convert("RGB")).astype(np.int32)
icons = np.asarray(Image.open(SRC / "vasilad.jpg").convert("RGB")).astype(np.int32)
assert clean.shape == (H, W, 3) and icons.shape == (H, W, 3), "the two maps must be 2048 x 1536 and aligned"
R, G, B = clean[..., 0], clean[..., 1], clean[..., 2]
mean = (R + G + B) / 3

# ---- land and sea (clean map). Green and brown ground; snow (white); the ice of the north (light blue, inside the
# three icy shores: the glow of the sea along every coast is light blue too, so the ice is only taken there).
ICE_AREAS = [(230, 30, 620, 300), (700, 30, 980, 240), (1190, 20, 1480, 200)]   # x0, y0, x1, y1
ground = (R - B) > 10
snow = (mean > 168) & (np.abs(R - B) < 32)
blueish = ((B - R) > 25) & ((B - G) > 6) & (mean > 108)      # (the glow of the sea has as much green as blue)
ice = np.zeros_like(snow)
for x0, y0, x1, y1 in ICE_AREAS:
    ice[y0:y1, x0:x1] = blueish[y0:y1, x0:x1]
land = ground | snow | ice
img = Image.fromarray((land * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(9))   # (specks, the coast's line)
land = np.asarray(img) > 127

# ---- distance from the coast (metres; + on land): jump flooding on a 2 m grid
def jfa(seed):
    h, w = seed.shape
    INF = 1 << 20
    sy = np.where(seed, np.arange(h)[:, None], INF).astype(np.int64)
    sx = np.where(seed, np.arange(w)[None, :], INF).astype(np.int64)
    yy, xx = np.mgrid[0:h, 0:w]
    step = 1 << int(np.ceil(np.log2(max(h, w))))
    while step >= 1:
        for dy in (-step, 0, step):
            for dx in (-step, 0, step):
                if dy == 0 and dx == 0:
                    continue
                ny = np.clip(yy + dy, 0, h - 1); nx = np.clip(xx + dx, 0, w - 1)
                cy, cx = sy[ny, nx], sx[ny, nx]
                dn = (cy - yy) ** 2 + (cx - xx) ** 2
                do = (sy - yy) ** 2 + (sx - xx) ** 2
                better = dn < do
                sy = np.where(better, cy, sy); sx = np.where(better, cx, sx)
        step //= 2
    return np.sqrt((sy - yy) ** 2 + (sx - xx) ** 2)

lf = np.asarray(Image.fromarray((land * 255).astype(np.uint8)).resize((W // 2, H // 2), Image.BILINEAR)) / 255.0
land2 = lf > 0.5
d_in, d_out = jfa(~land2), jfa(land2)               # (to the nearest sea cell; to the nearest land cell)
dist = np.where(land2, d_in - 0.5, -(d_out - 0.5)) * 2.0
coast = np.clip(np.round(128 + dist), 0, 255).astype(np.uint8)

# ---- the drawings: trees, and the relief (all the rest, but places, names, bridges, the tower, the legend)
diff = np.abs(clean - icons).sum(2)
drawn = diff > 45
IR, IG, IB = icons[..., 0], icons[..., 1], icons[..., 2]
im = (IR + IG + IB) / 3
tree = drawn & (IG >= IR - 4) & (IG > IB + 8) & (im < 120)
NOT_RELIEF = [   # x0, y0, x1, y1 (map pixels): places and their names, bridges, the tower, the camp, the legend, the dragon
    # (Valdoro's rectangle reaches down over its whole label: its lower half had become a hill beside the castle)
    (775, 630, 925, 785), (1035, 660, 1210, 715), (1000, 840, 1218, 1036), (1080, 1100, 1265, 1240), (840, 1275, 1020, 1410),
    (1695, 975, 1895, 1120), (415, 125, 480, 225), (1085, 1030, 1195, 1090), (825, 1195, 915, 1255), (60, 1200, 430, 1440),
    (1580, 280, 1770, 400), (1430, 740, 1610, 980),
    (680, 725, 790, 860), (920, 905, 1030, 990),     # the two ravines (later: cliffs)
    (1035, 555, 1255, 695),                          # the mine's mountain: the game has its own (mountain.js)
]
SNOW_FOREST = [(230, 290, 670, 640)]            # the trees under snow of the north-west (drawn white): a forest
HILLS = [(820, 740, 1200, 890), (1030, 455, 1110, 505), (690, 585, 770, 630), (540, 725, 630, 770)]   # green hills, dunes
LOW = [(890, 1040, 1070, 1270)]   # lower mountains: west of Sulus
# (a tree's dark outline and shadow are not relief: whatever is drawn right by a tree belongs to it)
near_tree = np.asarray(Image.fromarray((tree * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 127
relief = drawn & ~near_tree
snowtrees = np.zeros_like(relief)
for x0, y0, x1, y1 in SNOW_FOREST:
    snowtrees[y0:y1, x0:x1] = relief[y0:y1, x0:x1]
relief &= ~snowtrees
for x0, y0, x1, y1 in NOT_RELIEF:
    relief[y0:y1, x0:x1] = False; tree[y0:y1, x0:x1] &= (x0, y0) == (1430, 740)   # (the camp keeps its trees)
hills = np.zeros_like(relief)
for x0, y0, x1, y1 in HILLS:
    hills[y0:y1, x0:x1] = relief[y0:y1, x0:x1]
mount = relief & ~hills

def field(mask, close, blur, gain=1.0):
    """A smooth 0..1 field from a mask: gaps between the drawings closed, then blurred."""
    i = Image.fromarray((mask * 255).astype(np.uint8))
    if close:
        i = i.filter(ImageFilter.MaxFilter(close)).filter(ImageFilter.MinFilter(close))
    i = i.filter(ImageFilter.GaussianBlur(blur))
    return np.clip(np.asarray(i) / 255.0 * gain, 0, 1)

fm = field(mount, 25, 22, 1.6)   # (wide bases: the mountains rise from their feet, not straight up)
low = np.zeros((H, W));
for x0, y0, x1, y1 in LOW:
    low[y0:y1, x0:x1] = 1
low = np.asarray(Image.fromarray((low * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(25))) / 255.0
fm *= 1 - 0.45 * low
fh = field(hills, 21, 14, 1.8)
ff = field(tree | snowtrees, 0, 10, 2.2)
fs = field(snow & land, 0, 4)
dry = np.clip(((R - G) + 8) / 30.0, 0, 1) * land
fd = np.asarray(Image.fromarray((dry * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))) / 255.0
fi = field(ice & land, 0, 4)
# the feet of the mountains and of the hills: how near one is to them (wide, soft)
blur = lambda a, r: np.asarray(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))) / 255.0
pm = np.clip(blur(fm, 60) * 2.0, 0, 1) * land
ph = np.clip(blur(fh, 32) * 2.4, 0, 1) * land

small = lambda a: np.asarray(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)).resize((W // 4, H // 4), Image.BOX))
OUT.mkdir(parents=True, exist_ok=True)
Image.fromarray(coast, "L").save(OUT / "costa.png", optimize=True)
Image.fromarray(np.dstack([small(fm), small(fh), small(ff)]), "RGB").save(OUT / "rilievo.png", optimize=True)
Image.fromarray(np.dstack([small(fs), small(fd), small(fi)]), "RGB").save(OUT / "suolo.png", optimize=True)
Image.fromarray(np.dstack([small(pm), small(ph), np.zeros((H // 4, W // 4), np.uint8)]), "RGB").save(OUT / "pendii.png", optimize=True)
print("terra %.1f%%, montagne %.1f%%, colline %.1f%%, foreste %.1f%%, neve %.1f%%, ghiaccio %.1f%%" % tuple(
    100 * v for v in (land.mean(), (fm > 0.3).mean(), (fh > 0.3).mean(), (ff > 0.3).mean(), (fs > 0.5).mean(), (fi > 0.5).mean())))
for f in ("costa.png", "rilievo.png", "suolo.png", "pendii.png"):
    print(f, (OUT / f).stat().st_size // 1024, "KB")

if len(sys.argv) > 1:   # a picture to check: land shaded by a rough height, snow, ice, forests
    hgt = np.where(land, 1 + 60 * fm ** 1.3 + 9 * fh, -3.0)
    gy, gx = np.gradient(hgt)
    shade = np.clip(0.75 - (gx - gy) * 0.08, 0.25, 1.2)
    col = np.where(land[..., None], np.array([118, 150, 70]) * (1 - fd[..., None]) + np.array([160, 135, 85]) * fd[..., None], np.array([55, 85, 110]))
    col = col * (1 - fs[..., None]) + np.array([235, 238, 242]) * fs[..., None]
    col = col * (1 - fi[..., None]) + np.array([170, 210, 230]) * fi[..., None]
    col = col * (1 - 0.45 * ff[..., None]) + np.array([30, 70, 35]) * 0.45 * ff[..., None]
    col = np.where(land[..., None], col * shade[..., None], col)
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).resize((1024, 768)).save(sys.argv[1])
