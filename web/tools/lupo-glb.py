# The user's wolf (27/11: a low-poly wolf, 1942 vertices, a 29-bone rig; animations idle, idle2 (sitting), running,
# sniffing, fallen) made into web/public/models/lupo.glb for the game, with two more animations authored here on its
# rig: "submit" (it gives up: belly to the ground, head low, ears back, tail tucked, breathing; the legs bent by IK so
# the paws stay put) and "bite" (the head drawn back, then a lunge forward and down). Its colour with its ambient
# occlusion baked in, 512 px. wolves.js plays them.
# Needs Python 3.13 with bpy (pip install bpy) and pillow. Usage:
#   python tools/lupo-glb.py <wolf.blend> <wolf_color.png> <wolf_ao.png>
import os, sys, math, tempfile
import bpy
from mathutils import Matrix, Vector
from PIL import Image, ImageChops

blend, color_png, ao_png = sys.argv[1:4]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "models", "lupo.glb")

# the colour: fur x ambient occlusion, 512 px
tex = os.path.join(tempfile.mkdtemp(), "lupo.jpg")
col = Image.open(color_png).convert("RGB")
ao = Image.open(ao_png).convert("L").resize(col.size).convert("RGB")
ImageChops.multiply(col, ao).resize((512, 512), Image.LANCZOS).save(tex, quality=88)

bpy.ops.wm.open_mainfile(filepath=blend, load_ui=False)
sc = bpy.context.scene
for o in list(bpy.data.objects):
    if o.type in ("CAMERA", "LIGHT"): bpy.data.objects.remove(o)
rig = bpy.data.objects["wolf_rig"]
mat = bpy.data.materials["wolf"]; mat.use_nodes = True
nt = mat.node_tree; nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial"); bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
img = nt.nodes.new("ShaderNodeTexImage"); img.image = bpy.data.images.load(tex)
nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"]); nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
bsdf.inputs["Roughness"].default_value = 0.9

vl = bpy.context.view_layer
P = rig.pose.bones
K = rig.scale.x                                                  # (armature units = world / K)
X = Vector((1, 0, 0))

def use(action):
    rig.animation_data.action = action
    if hasattr(rig.animation_data, "action_slot") and action and action.slots: rig.animation_data.action_slot = action.slots[0]
def turn(pb, deg):                                               # about the wolf's left-right axis, through the bone's head
    h = pb.matrix.translation.copy()
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, X) @ Matrix.Translation(-h) @ pb.matrix
    vl.update()
def move(pb, d):
    m = pb.matrix.copy(); m.translation += Vector(d) / K; pb.matrix = m; vl.update()
def key_all(frame):
    for pb in P:
        for path in ("location", "rotation_quaternion", "scale"): pb.keyframe_insert(path, frame=frame, group=pb.name)
def start_from(name, frame):                                     # a frame of an animation as the bones' own pose
    use(bpy.data.actions[name]); sc.frame_set(frame); vl.update()
    pose = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy(), pb.scale.copy()) for pb in P}
    rig.animation_data.action = None
    for pb in P: pb.location, pb.rotation_quaternion, pb.scale = pose[pb.name]
    vl.update()
def new_action(name):
    a = bpy.data.actions.new(name); a.use_fake_user = True
    return a

# submit: the hips down with the paws held by IK, the result baked into the bones (no constraints in the file)
LEGS = [("Bone.002_L.002", 2, "Bone.002_L.003"), ("Bone.002_R.002", 2, "Bone.002_R.003"), ("Bone.001_L.003", 3, "Bone.001_L.004"), ("Bone.001_R.003", 3, "Bone.001_R.004")]
def crouch(low, head, tail, ears, breath):
    start_from("idle", 0)
    targets, paws = [], {}
    for ik_bone, chain, paw in LEGS:
        e = bpy.data.objects.new("ik_" + paw, None); sc.collection.objects.link(e)
        e.location = rig.matrix_world @ P[paw].matrix.translation; targets.append(e)
        c = P[ik_bone].constraints.new("IK"); c.target = e; c.chain_count = chain
        paws[paw] = P[paw].matrix.copy()
    vl.update()
    move(P["Bone.001"], (0, 0.03, -low))
    turn(P["Bone.002"], 6 + breath)
    mats = {pb.name: pb.matrix.copy() for pb in P}
    for pb in P:
        for c in list(pb.constraints): pb.constraints.remove(c)
    vl.update()
    for pb in sorted(P, key=lambda pb: len(pb.parent_recursive)): pb.matrix = mats[pb.name]; vl.update()
    for paw, m in paws.items():                                   # the paws flat, where the legs put them
        pb = P[paw]; mm = m.copy(); mm.translation = pb.matrix.translation; pb.matrix = mm; vl.update()
    for e in targets: bpy.data.objects.remove(e)
    turn(P["Bone.003"], head * 0.6); turn(P["Bone.004"], head * 0.5)
    for b in ("Bone.004_L", "Bone.004_R"): turn(P[b], -ears)
    turn(P["Bone.005"], -tail); turn(P["Bone.006"], -tail * 0.5); turn(P["Bone.007"], -tail * 0.3)
a = new_action("submit")
for f, br in ((1, 0.0), (13, 2.5), (25, 0.0)):                    # (a slow breath, a little trembling)
    crouch(0.2, 26, 55, 55, br); use(a); key_all(f)
# bite: (frame, neck, head, forward m)
b = new_action("bite")
for f, nk, hd, fw in ((1, 0, 0, 0), (5, -14, -10, -0.03), (9, 24, 16, 0.12), (13, 6, 4, 0.04), (17, 0, 0, 0)):
    start_from("idle", 0); use(b)
    move(P["Bone.001"], (0, -fw, 0)); turn(P["Bone.003"], nk); turn(P["Bone.004"], hd)
    key_all(f)
use(bpy.data.actions["idle"]); sc.frame_set(0)

for o in bpy.data.objects: o.select_set(o.name in ("wolf_rig", "Cube"))
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
                          export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True, export_frame_range=False,
                          export_skins=True, export_image_format="JPEG", export_materials="EXPORT", export_cameras=False, export_lights=False)
print("written", OUT, os.path.getsize(OUT) // 1024, "KB; animations:", ", ".join(a.name for a in bpy.data.actions))
