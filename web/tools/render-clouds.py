# Renders the "Cumulonimbus Field" cloud volumes (VDB, in assets/sorgenti/nuvole/, third-party, not in the repository)
# to pictures with alpha for the sky (tools/build-clouds.mjs makes the atlas from them). It opens the pack's example
# scene (its cloud shader and its sky light), swaps in each volume and renders it from one side with an orthographic
# camera framing the whole field, transparent background. Runs with Blender's Python (Blender, or the bpy module):
#   python render-clouds.py Example/Cumulonimbus_Field_12_ExampleFile.blend render 1280 12 <file.vdb:name:side> ...
# name: n<field>_<frame>_<side> (build-clouds.mjs reads the field from it); side: a or b (from the opposite side).
# STEP=2 in the environment: coarser volume steps (twice as fast, the same look at this size).
import sys, bpy, mathutils, math, time
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
blend, outdir, size, samples = args[0], args[1], int(args[2]), int(args[3])
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
sc.render.film_transparent = True
sc.cycles.samples = samples
sc.cycles.use_denoising = True
sc.cycles.device = "CPU"; sc.cycles.volume_step_rate = float(__import__("os").environ.get("STEP", "1")); sc.cycles.volume_max_steps = 256
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
cloud = bpy.data.objects["Cloud"]; cam = bpy.data.objects["Camera"]
cam.data.type = "ORTHO"
for spec in args[4:]:
    path, name, side = spec.split(":")
    cloud.data.filepath = path
    cloud.data.grids.load()
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = cloud.evaluated_get(dg)
    pts = [ev.matrix_world @ mathutils.Vector(c) for c in ev.bound_box]
    mn = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
    ext = mx - mn; ctr = (mn + mx) / 2
    # look horizontally across the field's longer side
    horiz = 0 if ext.x >= ext.y else 1
    w, h = ext[horiz], ext.z
    sgn = 1 if side == "a" else -1
    if horiz == 0: cam.location = (ctr.x, ctr.y - sgn * (ext.y + 500), ctr.z); cam.rotation_euler = (math.pi / 2, 0, 0 if sgn > 0 else math.pi)
    else: cam.location = (ctr.x + sgn * (ext.x + 500), ctr.y, ctr.z); cam.rotation_euler = (math.pi / 2, 0, math.pi / 2 if sgn > 0 else -math.pi / 2)
    cam.data.ortho_scale = max(w, h) * 1.04
    cam.data.clip_end = 1e5
    if w >= h: sc.render.resolution_x, sc.render.resolution_y = size, max(16, int(size * h / w * 1.04 / 1.04))
    else: sc.render.resolution_x, sc.render.resolution_y = max(16, int(size * w / h)), size
    sc.render.resolution_percentage = 100
    sc.render.filepath = f"{outdir}/{name}.png"
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {name} {sc.render.resolution_x}x{sc.render.resolution_y} ext {tuple(round(v) for v in ext)} {time.time()-t0:.1f}s", flush=True)
