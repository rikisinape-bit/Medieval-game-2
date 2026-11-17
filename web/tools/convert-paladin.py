# Extracts the armour of the paladin knight model (assets/sorgenti/paladino/, a third-party pack: NOT in the repository)
# for build-paladin.mjs: the armour pieces only (the body and the sword are left out), lightened with Blender's
# decimate, in the rest pose, each vertex with the bone that moves it most. Also the bones and the bare body's
# vertices (to measure the model's proportions).
# Needs Blender as a Python module:  pip install bpy      Usage (from web/):  python3 tools/convert-paladin.py
import bpy, json, os, sys
from mathutils import kdtree

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "../../assets/sorgenti/paladino/paintpoly_humanoid_paladin_knight.blend")
OUT = os.path.join(ROOT, ".paladin-cache.json")
# armour pieces and how much of their triangles to keep
KEEP = {"model_armour": 0.55, "model_armour.001": 0.5, "model_armour.002": 0.9, "model_armour.003": 0.4,
        "model_belts": 0.4, "model_helmet": 0.5, "model_straps": 0.35, "model_straps.001": 0.5}

bpy.ops.wm.open_mainfile(filepath=SRC)
rig = bpy.data.objects["rig"]
rig.data.pose_position = "REST"
bpy.context.view_layer.update()
yup = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]       # Blender Z-up, facing -Y -> Y-up, facing +Z
names, index = [], {}
def bone_id(n):
    if n not in index: index[n] = len(names); names.append(n)
    return index[n]
def dominant(o):
    out = []
    for v in o.data.vertices:
        g = max(v.groups, key=lambda g: g.weight) if len(v.groups) else None
        out.append(bone_id(o.vertex_groups[g.group].name) if g else -1)
    return out

meshes = {}
for name, ratio in KEEP.items():
    o = bpy.data.objects[name]
    dom = dominant(o)
    kd = kdtree.KDTree(len(o.data.vertices))
    for i, v in enumerate(o.data.vertices): kd.insert(o.matrix_world @ v.co, i)
    kd.balance()
    mod = o.modifiers.new("decimate", "DECIMATE"); mod.ratio = ratio; mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg); me = ev.to_mesh(); me.calc_loop_triangles()
    uv = me.uv_layers.active.data
    p, t, b = [], [], []
    for tri in me.loop_triangles:
        for li, vi in zip(tri.loops, tri.vertices):
            w = o.matrix_world @ me.vertices[vi].co
            p += yup(w); t += [round(uv[li].uv.x, 4), round(uv[li].uv.y, 4)]
            b.append(dom[kd.find(w)[1]])                                   # bone of the nearest original vertex
    meshes[name] = {"p": p, "uv": t, "b": b}
    ev.to_mesh_clear()
    print(name, len(o.data.polygons), "->", len(p) // 9, "triangles")

body = bpy.data.objects["model_humanoid"]                              # bare body: its vertices and their bones
dom = dominant(body)
body.data.calc_loop_triangles()
bodyv = {"p": [c for v in body.data.vertices for c in yup(body.matrix_world @ v.co)], "b": dom,
         "i": [vi for t in body.data.loop_triangles for vi in t.vertices]}
bones = {b.name: yup(rig.matrix_world @ b.head_local) + yup(rig.matrix_world @ b.tail_local) for b in rig.data.bones if b.name.startswith("DEF-")}
json.dump({"names": names, "meshes": meshes, "body": bodyv, "bones": bones}, open(OUT, "w"))
print("->", OUT, round(os.path.getsize(OUT) / 1e6, 2), "MB")
