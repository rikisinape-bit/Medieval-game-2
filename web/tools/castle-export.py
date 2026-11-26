# Exports the pieces of the castle interior pack (FBX, in assets/sorgenti/interno_castello/: third-party, not in the
# repository) to one raw GLB for tools/build-castle.mjs. Runs with Blender's Python (Blender, or the bpy module):
#   python castle-export.py <pack folder> <out.glb>
# Each piece becomes one object named after its file (transforms applied: metres, the pack's own pivot), its materials
# folded into two: the pack's colour palette (Mage_Room.png, 3x3-pixel swatches, nearest filtering: every piece, the
# floors too, takes its colours from it), the flames (the palette, glowing) and the crystal ball (Castle_Crystal).
import sys, os, re, bpy

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
root, out = args[0], args[1]
M, T = os.path.join(root, "models"), os.path.join(root, "textures")
bpy.ops.wm.read_factory_settings(use_empty=True)
pal = bpy.data.images.load(os.path.join(T, "Mage_Room.png"))

def material(key):
    m = bpy.data.materials.get(key)
    if m: return m
    m = bpy.data.materials.new(key); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = pal; tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if key == "Castle_Glow":
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"]); bsdf.inputs["Emission Strength"].default_value = 1.5
    return m

def kind(name):
    n = re.sub(r"\.\d+$", "", name)
    if n == "Glow Burn": return "Castle_Glow"
    if n == "Glass Light": return "Castle_Crystal"
    return "Castle_Palette"

for sub in ["Tiles", "Furniture", "Lights", "Objects"]:
    for f in sorted(os.listdir(os.path.join(M, sub))):
        if not f.endswith(".fbx"): continue
        name = re.sub(r"[^A-Za-z0-9_]", "", f[:-4].replace(" ", ""))
        before = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=os.path.join(M, sub, f))
        new = [o for o in bpy.data.objects if o not in before]
        meshes = [o for o in new if o.type == "MESH"]
        for o in new:
            if o.type != "MESH": bpy.data.objects.remove(o, do_unlink=True)
        if not meshes: continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in meshes: o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        if len(meshes) > 1: bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active
        o.parent = None
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        o.name = name; o.data.name = name
        me = o.data
        for i, s in enumerate(o.material_slots):
            if not s.material: continue
            k = kind(s.material.name)
            s.material = material(k)
        o.select_set(False)

print("pieces:", len([o for o in bpy.data.objects if o.type == "MESH"]))
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True, export_yup=True, export_materials="EXPORT", export_image_format="AUTO", export_animations=False)
