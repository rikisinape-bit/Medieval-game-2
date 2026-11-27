# The user's stylized rocks (FreePack-RocksStylized, 27/11: 11 rocks, 0.2-2.2 m, one hand-painted texture) as a
# source model of the nature pack: assets/models/natura/rocce_stilizzate.glb, one node per rock (SM_Rocks_01..11),
# its texture (Rocks_Stylized_Color.png, 4096 px) shrunk to 2048 px. tools/optimize-nature.mjs takes them from there.
# Needs Python 3.13 with bpy (pip install bpy) and pillow. Usage:
#   python tools/rocce-glb.py <FreePack-RocksStylized.blend> <Rocks_Stylized_Color.png>
import os, sys, tempfile
import bpy
from PIL import Image

blend, png = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "assets", "models", "natura", "rocce_stilizzate.glb")
Image.MAX_IMAGE_PIXELS = None
jpg = os.path.join(tempfile.mkdtemp(), "Rocks_Stylized.jpg")
Image.open(png).convert("RGB").resize((2048, 2048), Image.LANCZOS).save(jpg, quality=88)

bpy.ops.wm.open_mainfile(filepath=blend, load_ui=False)
rocks = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("SM_Rocks")]
for o in list(bpy.data.objects):
    if o not in rocks: bpy.data.objects.remove(o)
mat = bpy.data.materials["RocksStylized_M"]; mat.name = "RocksStylized"
nt = mat.node_tree; nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial"); bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = bpy.data.images.load(jpg)
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"]); nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
bsdf.inputs["Roughness"].default_value = 1.0
for o in rocks:                                   # the parent's scale (cm) and turn baked in; each rock at its own origin
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    o.data.transform(o.matrix_world); o.matrix_world.identity()
    xs = [v.co.x for v in o.data.vertices]; ys = [v.co.y for v in o.data.vertices]; zs = [v.co.z for v in o.data.vertices]
    cx, cy, z0 = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)
    for v in o.data.vertices: v.co.x -= cx; v.co.y -= cy; v.co.z -= z0   # (its foot at the origin)
    print(o.name, "size", round(max(xs) - min(xs), 2), round(max(ys) - min(ys), 2), round(max(zs) - min(zs), 2), "tris", sum(len(p.vertices) - 2 for p in o.data.polygons))
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True, export_animations=False,
                          export_image_format="JPEG", export_materials="EXPORT", use_selection=False)
print("written", OUT, os.path.getsize(OUT) // 1024, "KB")
