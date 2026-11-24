# The foods of the user's models (assets/sorgenti/cibo/: bread, ham and tomato from Blender files; the potato of a
# Unity package, its ASCII FBX made OBJ by tools/fbx-ascii-obj.py) into one raw GLB for tools/build-food.mjs: one
# node each (cibo_pane, cibo_prosciutto, cibo_pomodoro, cibo_patata), at their real size, centred, resting on y 0
# the way they lie on a table (the ham on its side); their materials' colours kept, the potato's own texture.
# Runs with Blender's Python: python food-export.py <cibo folder> <out.glb>
import sys, os, math, bpy, mathutils
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
root, out = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)

def take(path):                                       # the mesh objects of a .blend, into this scene
    with bpy.data.libraries.load(path, link=False) as (src, dst): dst.objects = list(src.objects)
    got = [o for o in dst.objects if o and o.type == "MESH"]
    for o in got: bpy.context.scene.collection.objects.link(o)
    return got

def ready(objs, name, rot=(0, 0, 0)):               # joined, transforms applied, centred, on the ground
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.transform(mathutils.Euler(rot).to_matrix().to_4x4())          # (turned as it lies, after its own transform)
    o.data.update(); bpy.context.view_layer.update()
    vs = [v.co for v in o.data.vertices]
    bb = [mathutils.Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))), mathutils.Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))]
    cx = (bb[0].x + bb[1].x) / 2; cy = (bb[0].y + bb[1].y) / 2; z0 = bb[0].z
    o.data.transform(mathutils.Matrix.Translation((-cx, -cy, -z0))); o.location = (0, 0, 0); o.data.update()
    o.name = o.data.name = name
    print(name, "x y z (z: in alto):", tuple(round(b - a, 3) for a, b in zip(bb[0], bb[1])), "triangoli", sum(len(p.vertices) - 2 for p in o.data.polygons))
    return o

ready(take(os.path.join(root, "pane.blend")), "cibo_pane")
ready(take(os.path.join(root, "prosciutto.blend")), "cibo_prosciutto", (0, 0, 0.4))   # (already on its side)
ready(take(os.path.join(root, "pomodoro.blend")), "cibo_pomodoro")
bpy.ops.wm.obj_import(filepath=os.path.join(root, "patata", "patata.obj"))
pot = [o for o in bpy.context.selected_objects if o.type == "MESH"]
img = bpy.data.images.load(os.path.join(root, "patata", "Potato1_Material _30_albedo.png")); img.scale(256, 256)
m = bpy.data.materials.new("Patata"); m.use_nodes = True
t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = img
m.node_tree.links.new(t.outputs["Color"], m.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
for o in pot: o.data.materials.clear(); o.data.materials.append(m)
ready(pot, "cibo_patata", (math.pi / 2, 0, 0))                                     # (on its flat side)
img.filepath_raw = os.path.join(os.path.dirname(out), "patata_256.png"); img.file_format = "PNG"; img.save()
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True, export_yup=True, export_materials="EXPORT", export_image_format="JPEG", export_jpeg_quality=85, export_animations=False)
