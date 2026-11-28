# The user's house of 28/11 (Pure3d "Medieval", p3d_medieval_enterable_bld-13: a half-timbered house with a thatched
# roof, T-shaped, one storey, enterable) as a source model for build-case.mjs:
#   assets/models/architetture/casa_paglia.glb
#     casa_paglia   the house (8391 triangles, 11.6 x 10.9 m, 5.5 m high), in metres; its main doorway (1 m wide, in the
#                   gable of the T's stem) in the middle of the +z side (three.js: x right, y up, z towards the doorway);
#                   the floor 2 cm above the ground (the model sinks 10 cm: its sills and posts reach below its floor)
#     casa_porta    a door for its doorways (1 x 1.95 m, 6 cm thick): its hinge on the local origin, the leaf along +x
#                   (the plank door with the iron latch of wood_doors-d)
# Materials (Casa_*): base colour and normal map of the pack's textures, shrunk; the plaster's colour map (walls_plaster-d)
# was not among the files: it is made here from its normal and specular maps (a warm lime white, stains where the
# specular map is light, darker in the cracks).
# Needs Python 3.13 with bpy (pip install bpy) and pillow. Usage:
#   python tools/casa-paglia.py <the house's .obj> <folder with its .tga textures>
import os, sys, math, tempfile
import bpy, bmesh
from mathutils import Matrix
from PIL import Image, ImageFilter, ImageChops

obj, texdir = sys.argv[1:3]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "assets", "models", "architetture", "casa_paglia.glb")
TMP = tempfile.mkdtemp()
T = lambda name: os.path.join(texdir, name + ".tga")

def save(im, name, size, png=False):                      # a texture shrunk to `size` (w, h), JPEG (PNG with alpha)
    im = im.resize(size, Image.LANCZOS)
    path = os.path.join(TMP, name + (".png" if png else ".jpg"))
    im.save(path, **({} if png else {"quality": 88}))
    return path

def plaster():                                            # walls_plaster-d, made from its -n and -s maps
    n = Image.open(T("walls_plaster-n")).convert("RGB"); s = Image.open(T("walls_plaster-s")).convert("L")
    w, h = n.size
    nz = n.split()[2]                                     # the normal's z: low in the cracks and on the edges
    cav = nz.point(lambda v: 255 if v > 235 else max(0, 255 - (235 - v) * 5)).filter(ImageFilter.GaussianBlur(1))
    stain = s.filter(ImageFilter.GaussianBlur(6)).point(lambda v: min(255, v * 2))
    base = Image.new("RGB", (w, h), (226, 212, 184))
    dirt = Image.new("RGB", (w, h), (176, 158, 126))
    out = Image.composite(dirt, base, stain.point(lambda v: v * 0.45))
    out = ImageChops.multiply(out, Image.merge("RGB", [cav.point(lambda v: 150 + v * 105 // 255)] * 3))
    grain = s.point(lambda v: 255 - v // 6)               # fine grain of the specular map
    return ImageChops.multiply(out, Image.merge("RGB", [grain] * 3))

def glass():                                              # windows_glas with the opacity map as alpha
    d = Image.open(T("windows_glas-d")).convert("RGB"); a = Image.open(T("windows_glas-opac")).convert("L")
    return Image.merge("RGBA", (*d.split(), a))

DOOR = (632, 0, 1162, 1024)                               # the plank door with the latch, in wood_doors (2048 x 1024)
# material of the OBJ -> (our name, colour map, its size, normal map, its size)
MATS = {
    "wood_pillar": ("Casa_Travi", lambda: Image.open(T("wood_pillar-d")), (512, 64), "wood_pillar-n", (512, 64)),
    "walls_plaster": ("Casa_Intonaco", plaster, (512, 1024), "walls_plaster-n", (256, 512)),
    "windows_glas": ("Casa_Vetri", glass, (512, 512), None, None),
    "roof_wood": ("Casa_Scandole", lambda: Image.open(T("roof_woodtile-d")), (512, 512), "roof_woodtile-n", (256, 256)),
    "wood_planks": ("Casa_Assi", lambda: Image.open(T("wood_planks-d")), (512, 512), "wood_planks-n", (256, 256)),
    "roof_hatch": ("Casa_Paglia", lambda: Image.open(T("roof_hatch-d")), (1024, 1024), "roof_hatch-n", (512, 512)),
    "wood_floor": ("Casa_Pavimento", lambda: Image.open(T("wood_floor-d")), (512, 512), "wood_floor-n", (256, 256)),
}

def material(name, color_path, normal_path=None, alpha=False):
    m = bpy.data.materials.new(name)
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.92; bsdf.inputs["Metallic"].default_value = 0
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = bpy.data.images.load(color_path)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        m.surface_render_method = "BLENDED"
    if normal_path:
        nm = nt.nodes.new("ShaderNodeTexImage"); nm.image = bpy.data.images.load(normal_path); nm.image.colorspace_settings.name = "Non-Color"
        nn = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(nm.outputs["Color"], nn.inputs["Color"]); nt.links.new(nn.outputs["Normal"], bsdf.inputs["Normal"])
    return m

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=obj)
house = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
house.name = house.data.name = "casa_paglia"
# centimetres -> metres; the main doorway's middle (x 0.25 m in the file) on x = 0; 10 cm into the ground; half a turn
# (its doorway, on the file's +y, comes to -y: the exporter's +z)
house.data.transform(house.matrix_world)                  # (the importer turns the object, not its mesh: y up -> z up)
house.matrix_world = Matrix.Identity(4)
house.data.transform(Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Translation((-0.25, 0, -0.1)) @ Matrix.Scale(0.01, 4))
for slot in house.material_slots:
    src = slot.material.name.split(".")[0]
    name, color, csize, normal, nsize = MATS[src]
    im = color(); alpha = im.mode == "RGBA"
    slot.material = material(name, save(im.convert("RGBA" if alpha else "RGB"), name, csize, alpha),
                             normal and save(Image.open(T(normal)).convert("RGB"), name + "_n", nsize), alpha)

# the door: a board 1 x 1.95 x 0.06 m, its hinge on the origin, the leaf along +x; the door's picture on both faces
# (each seen the right way round), its edges of the same wood
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=(1.0, 0.06, 1.95), verts=bm.verts)          # (Blender: z up; y is the door's thickness)
bmesh.ops.translate(bm, vec=(0.5, 0, 0.975), verts=bm.verts)
uv = bm.loops.layers.uv.new()
for f in bm.faces:
    n = f.normal
    for l in f.loops:
        x, y, z = l.vert.co
        if abs(n.y) > 0.5: u, v = (1 - x if n.y < 0 else x), z / 1.95      # front (-y: the outside) and back, each seen unmirrored
        else: u, v = 0.02 + 0.04 * (x + y), z / 1.95                        # edges: a strip of the door's own planks
        l[uv].uv = (u, v)
me = bpy.data.meshes.new("casa_porta"); bm.to_mesh(me); bm.free()
door = bpy.data.objects.new("casa_porta", me); bpy.context.scene.collection.objects.link(door)
dd = Image.open(T("wood_doors-d")).convert("RGB").crop(DOOR); dn = Image.open(T("wood_doors-n")).convert("RGB").crop(DOOR)
me.materials.append(material("Casa_Porta", save(dd, "Casa_Porta", (256, 512)), save(dn, "Casa_Porta_n", (128, 256))))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True, export_image_format="AUTO",
                          export_texcoords=True, export_normals=True, export_materials="EXPORT")
print("written", OUT, os.path.getsize(OUT), "bytes")
