# An ASCII FBX (7.x) mesh to OBJ: its vertices, polygons and UVs (Blender reads only binary FBX). For the potato of
# the user's Unity package (assets/sorgenti/cibo/). Usage: python fbx-ascii-obj.py <in.fbx> <out.obj> [scale]
import sys, re
src, out = sys.argv[1], sys.argv[2]
scale = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0           # (UnitScaleFactor 100: already metres)
text = open(src, encoding="utf-8", errors="replace").read()
def array(name, after=0):
    m = re.compile(name + r": \*\d+ \{\s*a: ([^}]*)\}", re.S).search(text, after)
    return ([float(x) for x in m.group(1).replace("\n", "").split(",") if x.strip()], m.end()) if m else (None, -1)
geo = text.index('"Mesh" {')
verts, _ = array("Vertices", geo)
idx, _ = array("PolygonVertexIndex", geo)
uv_at = text.find("LayerElementUV", geo)
uvs, e = array("UV", uv_at); uvi, _ = array("UVIndex", uv_at)
polys, cur = [], []
for k, i in enumerate(int(v) for v in idx):
    if i < 0: cur.append((-i - 1, k)); polys.append(cur); cur = []
    else: cur.append((i, k))
with open(out, "w") as f:
    for i in range(0, len(verts), 3): f.write("v %f %f %f\n" % (verts[i] * scale, verts[i + 1] * scale, verts[i + 2] * scale))
    for i in range(0, len(uvs), 2): f.write("vt %f %f\n" % (uvs[i], uvs[i + 1]))
    for p in polys: f.write("f " + " ".join("%d/%d" % (v + 1, int(uvi[k]) + 1) for v, k in p) + "\n")
print(f"{len(verts) // 3} vertici, {len(polys)} poligoni, {len(uvs) // 2} uv -> {out}")
