# Reads the meshes of Editable Poly objects from a 3ds Max scene (the "Scene" stream: nested chunks), writes OBJ.
import sys, struct, olefile
f = olefile.OleFileIO(sys.argv[1])
data = f.openstream("Scene").read()

def chunks(buf, start, end, depth=0):
    out = []; p = start
    while p + 6 <= end:
        typ, size = struct.unpack_from("<HI", buf, p); hdr = 6
        if size == 0:
            if p + 14 > end: break
            size = struct.unpack_from("<Q", buf, p + 6)[0]; hdr = 14
            cont = bool(size & 0x8000000000000000); size &= 0x7FFFFFFFFFFFFFFF
        else:
            cont = bool(size & 0x80000000); size &= 0x7FFFFFFF
        if size < hdr or p + size > end: break
        c = {"type": typ, "start": p + hdr, "end": p + size, "cont": cont, "children": []}
        if cont: c["children"] = chunks(buf, p + hdr, p + size, depth + 1)
        out.append(c); p += size
    return out

root = chunks(data, 0, len(data))
polys = []
def walk(cs, path):
    for c in cs:
        if c["type"] == 0x08FE and c["cont"]: polys.append(c)
        walk(c["children"], path + [c["type"]])
walk(root, [])
print("poly chunks:", len(polys))
for k, pc in enumerate(polys):
    kids = {c["type"]: c for c in pc["children"]}
    print(" poly", k, "children:", [hex(c["type"]) for c in pc["children"]][:20])
    v = kids.get(0x0100); fch = kids.get(0x011A)
    if not v or not fch: continue
    d = data[v["start"]:v["end"]]
    n = struct.unpack_from("<i", d, 0)[0]; o = 4; verts = []
    while o + 16 <= len(d):
        fl = struct.unpack_from("<i", d, o)[0]; x, y, z = struct.unpack_from("<3f", d, o + 4); verts.append((x, y, z)); o += 16
    d = data[fch["start"]:fch["end"]]
    nf = struct.unpack_from("<i", d, 0)[0]; o = 4; faces = []
    try:
        while o < len(d):
            cnt = struct.unpack_from("<i", d, o)[0]; o += 4
            idx = list(struct.unpack_from("<%di" % cnt, d, o)); o += 4 * cnt
            flags = struct.unpack_from("<h", d, o)[0]; o += 2
            if flags & 0x01: o += 4
            if flags & 0x08: o += 2
            if flags & 0x10: o += 4
            if flags & 0x20: o += 4 * 2 * (cnt - 3)
            faces.append(idx)
    except struct.error as e:
        print("  faces stopped at", o, len(d), e)
    print("  verts", n, len(verts), "faces", nf, len(faces), "sizes", sorted({len(x) for x in faces})[:8])
    xs = [p[0] for p in verts]; ys = [p[1] for p in verts]; zs = [p[2] for p in verts]
    print("  bbox", min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))
    with open(sys.argv[2].replace(".obj", f"_{k}.obj"), "w") as w:
        for p in verts: w.write("v %f %f %f\n" % p)
        for fc in faces:
            if all(0 <= i < len(verts) for i in fc): w.write("f " + " ".join(str(i + 1) for i in fc) + "\n")
