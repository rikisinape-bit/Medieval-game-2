# The user's goblin (27/11: a static mesh, 5197 triangles, its colour, normal and roughness baked in; hunched, long
# arms and claws) rigged and animated for the game: web/public/models/goblin.glb.
# The rig is built here: its joints read off the model's front and side views (it stands hunched, knees bent forward,
# arms hanging to the knees), the mesh bound to it with Blender's automatic weights (vertices merged at their seams
# first, so the heat flows across the whole skin; any left without weights take the nearest bone). Its animations are
# keyed here on that rig: idle (breathing), walk, run, attack and attack2 (a claw swipe with the right and with the
# left), hit (it reels), death (it falls on its back). Scaled to 1.35 m, its feet at the origin, facing glTF +Z.
# goblin.js plays them. Needs Python 3.13 with bpy (pip install bpy). Usage:
#   python tools/goblin-glb.py <goblin.glb from the user> [contact-sheet-dir]
import os, sys, math
import bpy, bmesh
from mathutils import Matrix, Vector

src = sys.argv[1]
SHEET = sys.argv[2] if len(sys.argv) > 2 else None
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "models", "goblin.glb")
HEIGHT = 1.35

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
vl = bpy.context.view_layer
body = [o for o in sc.objects if o.type == "MESH"][0]
body.name = "goblin"
# its feet at the origin, its height HEIGHT
zs = [(body.matrix_world @ v.co).z for v in body.data.vertices]
k = HEIGHT / (max(zs) - min(zs))
body.data.transform(body.matrix_world); body.matrix_world.identity()
body.data.transform(Matrix.Translation((0, 0, -min(zs)))); body.data.transform(Matrix.Scale(k, 4))
# seams merged (the importer splits vertices where the UVs do): one skin for the weights
bm = bmesh.new(); bm.from_mesh(body.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.to_mesh(body.data); bm.free()

# ---- the joints (model units: 0.937 tall, centred; read off the front and side views), then scaled like the mesh
Z0 = -0.47
J = {
    "root": (0, 0.05, -0.47), "hips": (0, 0.08, -0.01), "spine": (0, 0.06, 0.08), "chest": (0, 0.02, 0.2), "neck": (0, -0.06, 0.3),
    "head": (0, -0.13, 0.33), "head_top": (0, -0.16, 0.47),
}
for s, x in (("L", 1), ("R", -1)):
    J.update({
        f"clav_{s}": (0.04 * x, -0.03, 0.27), f"shoulder_{s}": (0.19 * x, -0.02, 0.26), f"elbow_{s}": (0.315 * x, -0.03, 0.075),
        f"wrist_{s}": (0.32 * x, -0.11, -0.16), f"claws_{s}": (0.325 * x, -0.18, -0.31),
        f"hip_{s}": (0.08 * x, 0.06, -0.03), f"knee_{s}": (0.12 * x, -0.04, -0.13), f"ankle_{s}": (0.185 * x, 0.1, -0.39), f"toes_{s}": (0.19 * x, -0.09, -0.455),
    })
J = {n: Vector(((p[0]) * k, p[1] * k, (p[2] - Z0) * k)) for n, p in J.items()}
BONES = [  # name, head, tail, parent, deform
    ("root", "root", None, None, False),
    ("hips", "hips", "spine", "root", True), ("spine", "spine", "chest", "hips", True), ("chest", "chest", "neck", "spine", True),
    ("neck", "neck", "head", "chest", True), ("head", "head", "head_top", "neck", True),
]
for s in "LR":
    BONES += [(f"clavicle.{s}", f"clav_{s}", f"shoulder_{s}", "chest", True), (f"upper_arm.{s}", f"shoulder_{s}", f"elbow_{s}", f"clavicle.{s}", True),
              (f"forearm.{s}", f"elbow_{s}", f"wrist_{s}", f"upper_arm.{s}", True), (f"hand.{s}", f"wrist_{s}", f"claws_{s}", f"forearm.{s}", True),
              (f"thigh.{s}", f"hip_{s}", f"knee_{s}", "hips", True), (f"shin.{s}", f"knee_{s}", f"ankle_{s}", f"thigh.{s}", True),
              (f"foot.{s}", f"ankle_{s}", f"toes_{s}", f"shin.{s}", True)]
arm_data = bpy.data.armatures.new("goblin_rig"); rig = bpy.data.objects.new("goblin_rig", arm_data); sc.collection.objects.link(rig)
vl.objects.active = rig; bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
for name, h, t, parent, deform in BONES:
    b = eb.new(name); b.head = J[h]; b.tail = J[t] if t else J[h] + Vector((0, 0, 0.15)); b.use_deform = deform
    if parent: b.parent = eb[parent]; b.use_connect = False
bpy.ops.object.mode_set(mode="OBJECT")

# ---- the skin: automatic weights (bone heat); a vertex left without weights takes the nearest bone
bpy.ops.object.select_all(action="DESELECT"); body.select_set(True); rig.select_set(True); vl.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
deform = [b for b in arm_data.bones if b.use_deform]
groups = {g.index: g.name for g in body.vertex_groups}
def seg_d(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9))); return (a + ab * t - p).length
bare = 0
for v in body.data.vertices:
    if sum(g.weight for g in v.groups if groups.get(g.group) in arm_data.bones) > 1e-4: continue
    best = min(deform, key=lambda b: seg_d(v.co, b.head_local, b.tail_local))
    (body.vertex_groups.get(best.name) or body.vertex_groups.new(name=best.name)).add([v.index], 1.0, "REPLACE"); bare += 1
print("vertices without weights given the nearest bone:", bare)

# ---- the animations, keyed on the rig (turns about the world's axes through each bone's head)
P = rig.pose.bones
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
def rest():
    for pb in P: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
    vl.update()
def turn(name, axis, deg):
    pb = P[name]; h = pb.matrix.translation.copy()
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-h) @ pb.matrix
    vl.update()
def move(name, d):
    pb = P[name]; m = pb.matrix.copy(); m.translation += Vector(d); pb.matrix = m; vl.update()
def key(frame):
    for pb in P:
        for path in ("location", "rotation_quaternion", "scale"): pb.keyframe_insert(path, frame=frame, group=pb.name)
def action(name, frames, pose, loop=True):
    """pose(t) poses the rig at t (0..1 of the cycle); keyed every 2 frames, the last = the first if it loops"""
    a = bpy.data.actions.new(name); a.use_fake_user = True
    rig.animation_data_create(); rig.animation_data.action = a
    for f in range(0, frames + 1, 2):
        rest(); pose((f % frames) / frames if loop else f / frames); key(f + 1)
    return a
sin = lambda t, ph=0.0: math.sin((t + ph) * math.pi * 2)
ease = lambda t: t * t * (3 - 2 * t)
def seg(t, a, b): return ease(min(1.0, max(0.0, (t - a) / (b - a))))   # (0 before a, 1 after b, eased between)
F = -1   # (a "forward" turn about X brings a limb towards -Y, where the goblin looks; legs and arms swing about X)

def idle(t):
    turn("chest", X, 2.0 * sin(t)); turn("neck", X, -1.5 * sin(t)); turn("head", X, 3 * sin(t, 0.15)); move("hips", (0, 0, 0.006 * sin(t)))
    for s, sg in (("L", 1), ("R", -1)): turn(f"upper_arm.{s}", X, 3 * sin(t, 0.2) * sg); turn(f"hand.{s}", X, 6 * sin(t, 0.3))
def legs(t, swing, knee, arm, bob, lean):
    move("hips", (0, 0, bob * abs(sin(t)))); turn("spine", X, lean); turn("chest", Z, 6 * sin(t) * (swing / 22))
    for s, ph in (("L", 0.0), ("R", 0.5)):
        sw = sin(t, ph)                                                   # +: this leg forward
        turn(f"thigh.{s}", X, F * swing * sw)
        lift = max(0.0, sin(t, ph + 0.25))                                # (the knee bends while the leg swings forward)
        turn(f"shin.{s}", X, knee * lift); turn(f"foot.{s}", X, -knee * 0.4 * lift + 8 * sw)
        turn(f"upper_arm.{s}", X, -F * arm * sw); turn(f"forearm.{s}", X, F * arm * 0.4 * max(0.0, -sw))
def walk(t): legs(t, 22, 38, 16, 0.02, 4)
def run(t): legs(t, 36, 62, 34, 0.045, 12)
def swipe(side):
    o = "R" if side == "L" else "L"
    def pose(t):
        up, hit, back = seg(t, 0.0, 0.4), seg(t, 0.4, 0.58), seg(t, 0.6, 1.0)
        raise_ = up * (1 - hit); strike = hit * (1 - back)
        turn("chest", Z, (18 * raise_ - 26 * strike) * (1 if side == "R" else -1)); turn("spine", X, -6 * raise_ + 10 * strike)
        turn(f"upper_arm.{side}", X, 95 * raise_ - 70 * strike); turn(f"upper_arm.{side}", Y, (25 * raise_ - 20 * strike) * (1 if side == "R" else -1))
        turn(f"forearm.{side}", X, 40 * raise_ - 25 * strike); turn(f"hand.{side}", X, 25 * raise_ - 35 * strike)
        turn(f"upper_arm.{o}", X, -10 * raise_ + 8 * strike); turn("head", X, -10 * raise_ + 12 * strike)
        turn("thigh.L", X, F * 8 * strike); turn("thigh.R", X, F * 8 * strike)
    return pose
def hit(t):
    j = math.sin(min(1.0, t * 2.2) * math.pi) * (1 - seg(t, 0.5, 1.0) * 0.6)
    turn("spine", X, -14 * j); turn("chest", X, -10 * j); turn("head", X, -18 * j); move("hips", (0, 0.05 * j, 0))
    for s in "LR": turn(f"upper_arm.{s}", X, 20 * j)
def death(t):
    fall = seg(t, 0.0, 0.75); knees = seg(t, 0.0, 0.45)
    turn("root", X, -86 * fall); move("root", (0, 0.0, 0.13 * fall))     # (over on its back, lying on the ground, not in it)
    for s in "LR": turn(f"thigh.{s}", X, F * 35 * knees); turn(f"shin.{s}", X, 55 * knees); turn(f"upper_arm.{s}", X, 60 * fall); turn(f"hand.{s}", X, -30 * fall)
    turn("head", X, -25 * fall); turn("chest", X, -10 * fall)

action("idle", 48, idle); action("walk", 24, walk); action("run", 16, run)
action("attack", 20, swipe("R"), loop=False); action("attack2", 20, swipe("L"), loop=False)
action("hit", 10, hit, loop=False); action("death", 30, death, loop=False)
rig.animation_data.action = bpy.data.actions["idle"]; sc.frame_set(1)

if SHEET:                                                         # (a contact sheet to look at the poses)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.0; cam.location = (2.6, -2.6, 0.9); cam.rotation_euler = (math.radians(86), 0, math.radians(45))
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3; sun.rotation_euler = (math.radians(40), 0, math.radians(30)); sc.collection.objects.link(sun)
    sc.world = bpy.data.worlds.new("w"); sc.world.use_nodes = True; sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.45, 0.46, 0.5, 1)
    sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 8; sc.render.resolution_x = 260; sc.render.resolution_y = 300
    try: sc.render.image_settings.media_type = "IMAGE"
    except Exception: pass
    sc.render.image_settings.file_format = "PNG"
    for name, frames in (("idle", [1, 25]), ("walk", [1, 7, 13, 19]), ("run", [1, 5, 9, 13]), ("attack", [1, 9, 12, 17]), ("attack2", [9, 12]), ("hit", [5]), ("death", [11, 31])):
        rig.animation_data.action = bpy.data.actions[name]
        for f in frames:
            sc.frame_set(f); sc.render.filepath = os.path.join(SHEET, f"{name}_{f:02d}.png"); bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam); bpy.data.objects.remove(sun)
    rig.animation_data.action = bpy.data.actions["idle"]; sc.frame_set(1)

# its textures: the colour as it is (1024 px), the relief at 512 px, no metal/roughness map (rough all over)
mat = body.active_material
for n in list(mat.node_tree.nodes):
    if n.type == "TEX_IMAGE" and n.image and "metallic" in n.image.name.lower(): mat.node_tree.nodes.remove(n)
    elif n.type == "TEX_IMAGE" and n.image and "normal" in n.image.name.lower() and n.image.size[0] > 512: n.image.scale(512, 512)
bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Roughness"].default_value = 0.85; bsdf.inputs["Metallic"].default_value = 0.0
for o in sc.objects: o.select_set(o in (rig, body))
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
                          export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True, export_frame_range=False,
                          export_skins=True, export_image_format="JPEG", export_jpeg_quality=86, export_materials="EXPORT", export_cameras=False, export_lights=False)
print("written", OUT, os.path.getsize(OUT) // 1024, "KB; animations:", ", ".join(a.name for a in bpy.data.actions))
