# The moon (the sky by night, sky.js): the mesh read from the user's 3ds Max scene (tools/max-mesh.py: "Moon 001", a
# sphere with its craters carved in, 3104 quads) made light for the game with Blender's Python: centred, radius 1,
# decimated to about 2400 triangles, flat (its facets are part of its look), exported as a raw GLB (positions only:
# sky.js shades it itself). Then tools/build-moon.mjs compresses it into public/models/luna.glb.
#   python moon-export.py <moon.obj> <out.glb>
import sys, bpy, bmesh
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
src, out = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=src)
o = bpy.context.selected_objects[0]; bpy.context.view_layer.objects.active = o
bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS"); o.location = (0, 0, 0)
r = max(o.dimensions) / 2; o.scale = (1 / r, 1 / r, 1 / r)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
m = o.modifiers.new("dec", "DECIMATE"); m.ratio = 2400 / (len(o.data.polygons) * 2)
bpy.ops.object.modifier_apply(modifier="dec")
bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(o.data); bm.free()
o.name = o.data.name = "Luna"
print("triangoli:", len(o.data.polygons))
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_normals=False, export_texcoords=False, export_materials="NONE", export_apply=True, export_yup=True)
