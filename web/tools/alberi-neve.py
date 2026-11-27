# The user's trees of 27/11 as source models of the nature pack (assets/models/natura/), for optimize-nature.mjs:
#   albero_neve.glb          winter_tree8 (LOW_RES): a leafy tree, its crown under snow (38k triangles, 1.9 x 1.45 m)
#   albero_spoglio_neve.glb  winter_tree14 (LOW_RES): a bare twisted tree, snow on its branches (12.7k, 1.94 m)
#   pino_4m.glb              Pine_4m (Pure3d "Pine Trees"): a pine of branch cards, 4.4 m; its most detailed level
#                            (1253 triangles: needles 1152, branches 26, trunk 75), read from its Collada file (the OBJ
#                            has every level together and no materials; Blender no longer reads Collada)
# Each at its own size (metres), its foot at the origin; textures shrunk to 1024 px (the pine's from DDS, with alpha).
# Needs Python 3.13 with bpy (pip install bpy) and pillow. Usage:
#   python tools/alberi-neve.py <winter_tree8 dir> <winter_tree14 dir> <Pine4m dir>   (the unzipped folders)
import os, sys, tempfile
import xml.etree.ElementTree as ET
import bpy
from mathutils import Matrix
from PIL import Image

t8, t14, pine = sys.argv[1:4]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "assets", "models", "natura")
TMP = tempfile.mkdtemp()

def shrink(src, name, alpha=False):                       # a texture at 1024 px at most (PNG with alpha, else JPEG)
    im = Image.open(src); im = im.convert("RGBA" if alpha else "RGB")
    im.thumbnail((1024, 1024), Image.LANCZOS)
    path = os.path.join(TMP, name + (".png" if alpha else ".jpg")); im.save(path, **({} if alpha else {"quality": 88}))
    return path
def material(name, tex, alpha=False):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]; img = nt.nodes.new("ShaderNodeTexImage"); img.image = bpy.data.images.load(tex)
    nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"]); bsdf.inputs["Roughness"].default_value = 1.0
    if alpha: nt.links.new(img.outputs["Alpha"], bsdf.inputs["Alpha"]); m.blend_method = "CLIP" if hasattr(m, "blend_method") else None
    return m
def footed(objs):                                         # transforms baked, the foot at the origin
    for o in objs: o.data.transform(o.matrix_world); o.matrix_world.identity()
    zs = [v.co.z for o in objs for v in o.data.vertices]; xs = [v.co.x for o in objs for v in o.data.vertices]; ys = [v.co.y for o in objs for v in o.data.vertices]
    m = Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs)))
    for o in objs: o.data.transform(m)
    return max(zs) - min(zs)
def export(name, objs):
    for o in bpy.context.scene.objects: o.select_set(o in objs)
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_animations=False, export_materials="EXPORT")
    print(name, "->", path, os.path.getsize(path) // 1024, "KB")

# ---- the two winter trees: their OBJ, its texture
for src, name, tri in ((t8, "albero_neve", "winter-tree8"), (t14, "albero_spoglio_neve", "winter-tree14")):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=os.path.join(src, f"{tri}_LOW_RES.obj"))
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    mat = material(name, shrink(os.path.join(src, "textures", f"{tri}.png"), name))
    for o in objs: o.data.materials.clear(); o.data.materials.append(mat)
    h = footed(objs); print(name, "height", round(h, 2), "m, triangles", sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons))
    export(name, objs)

# ---- the pine: its Collada file (geom-pine4m: the first level), one object per material
bpy.ops.wm.read_factory_settings(use_empty=True)
dae = os.path.join(pine, "_.dae", "Pine_4m.dae")
root = ET.parse(dae).getroot(); ns = {"c": root.tag.split("}")[0].strip("{")}
unit = float(root.find("c:asset/c:unit", ns).get("meter", "1")) if root.find("c:asset/c:unit", ns) is not None else 1.0
up = (root.find("c:asset/c:up_axis", ns).text or "Z_UP") if root.find("c:asset/c:up_axis", ns) is not None else "Z_UP"
geo = next(g for g in root.iterfind(".//c:library_geometries/c:geometry", ns) if g.get("id") == "geom-pine4m")
mesh = geo.find("c:mesh", ns)
src = {s.get("id"): [float(v) for v in s.find("c:float_array", ns).text.split()] for s in mesh.iterfind("c:source", ns)}
stride = {s.get("id"): int(s.find("c:technique_common/c:accessor", ns).get("stride")) for s in mesh.iterfind("c:source", ns)}
verts = mesh.find("c:vertices", ns); vpos = verts.find("c:input[@semantic='POSITION']", ns).get("source")[1:]
TEX = {"leaf": "pine-leaf-diff", "branch": "pine-branch-diff", "trunk": "pine-trunk-diff"}
objs = []
for tri in mesh.iterfind("c:triangles", ns):
    kind = next(k for k in TEX if k in tri.get("material"))
    ins = {i.get("semantic"): (int(i.get("offset")), i.get("source")[1:]) for i in tri.iterfind("c:input", ns)}
    n = max(o for o, _ in ins.values()) + 1
    p = [int(v) for v in tri.find("c:p", ns).text.split()]
    P, S = src[vpos], stride[vpos]
    tco, tsrc = ins["TEXCOORD"]; T, TS = src[tsrc], stride[tsrc]
    coords, faces, uvs = [], [], []
    for k in range(0, len(p), n * 3):
        f = []
        for c in range(3):
            base = k + c * n
            vi, ti = p[base + ins["VERTEX"][0]], p[base + tco]
            coords.append((P[vi * S] * unit, P[vi * S + 1] * unit, P[vi * S + 2] * unit)); uvs.append((T[ti * TS], T[ti * TS + 1])); f.append(len(coords) - 1)
        faces.append(f)
    me = bpy.data.meshes.new("pino_" + kind); me.from_pydata(coords, [], faces)
    uv = me.uv_layers.new(name="UV")
    for li, loop in enumerate(me.loops): uv.data[li].uv = uvs[loop.vertex_index]
    tex = shrink(os.path.join(pine, "textures", TEX[kind] + ".dds"), "pino_" + kind, alpha=kind != "trunk")
    me.materials.append(material("Pine_" + kind, tex, alpha=kind != "trunk"))
    ob = bpy.data.objects.new("pino_" + kind, me); bpy.context.scene.collection.objects.link(ob); objs.append(ob)
    if up == "Y_UP": ob.matrix_world = Matrix.Rotation(1.5707963, 4, "X")
    print("pine", kind, len(faces), "triangles")
bpy.context.view_layer.update()
h = footed(objs); print("pino_4m height", round(h, 2), "m (Collada unit", unit, up, ")")
export("pino_4m", objs)
