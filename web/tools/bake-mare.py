# Bakes the user's calm sea into the water's texture: assets/sorgenti/mare/mare_calmo.blend (the user's, 27/11) is a
# surface made by Blender's Ocean modifier (Phillips spectrum, 50 m a period, waves up to ~0.8 m, no foam) under a
# plain blue material. One period of it is seamless: its displaced surface (heights and the sideways "choppy" shifts)
# gives the normal of every point. Written to src/game3d/mare_calmo_n.jpg, 512 px (Fourier resampled: still
# seamless): R, G the normal's x and z (z along the picture's rows, top to bottom: load it with flipY = false),
# B the height (0..1 from the lowest to the highest point). water.js lays it on the sea and the rivers.
# Needs Python 3.13 with bpy (pip install bpy), numpy and pillow. Usage: python tools/bake-mare.py
import os, sys
import numpy as np
import bpy
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "..", "assets", "sorgenti", "mare", "mare_calmo.blend")
OUT = os.path.join(HERE, "..", "src", "game3d", "mare_calmo_n.jpg")
SIZE = 512

bpy.ops.wm.open_mainfile(filepath=SRC, load_ui=False)
obj = next(o for o in bpy.data.objects if any(m.type == "OCEAN" for m in o.modifiers))
mod = next(m for m in obj.modifiers if m.type == "OCEAN")
T = float(mod.spatial_size)
ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
me = ev.to_mesh()
co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co)
ev.to_mesh_clear()
side = int(round((len(co) // 3) ** 0.5))
G = co.reshape(side, side, 3)                                    # [row: y, column: x], repeat_x x repeat_y periods
N = (side - 1) // mod.repeat_x
s = T / N
tile = G[:N, :N]
assert np.abs(G[:N, N:2 * N] - tile - [T, 0, 0]).max() < 1e-3, "not one period"
rest = np.stack(list(np.meshgrid(np.arange(N) * s, np.arange(N) * s, indexing="xy")) + [np.zeros((N, N))], -1)
D = tile - rest                                                  # the displacement (+ the grid's corner: no matter)

du = lambda A: (np.roll(A, -1, axis=1) - np.roll(A, 1, axis=1)) / (2 * s)
dv = lambda A: (np.roll(A, -1, axis=0) - np.roll(A, 1, axis=0)) / (2 * s)
Pu = np.stack([1 + du(D[..., 0]), du(D[..., 1]), du(D[..., 2])], -1)   # the surface's tangents
Pv = np.stack([dv(D[..., 0]), 1 + dv(D[..., 1]), dv(D[..., 2])], -1)
n = np.cross(Pu, Pv)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
H = D[..., 2]

def resample(A):                                                 # periodic: through the Fourier transform
    F = np.fft.fftshift(np.fft.fft2(A))
    P = np.zeros((SIZE, SIZE), complex)
    a = (SIZE - N) // 2
    P[a:a + N, a:a + N] = F
    return np.real(np.fft.ifft2(np.fft.ifftshift(P))) * (SIZE * SIZE) / (N * N)

nx, ny, h = resample(n[..., 0]), resample(n[..., 1]), resample(H)
l = np.sqrt(nx ** 2 + ny ** 2 + np.clip(1 - nx ** 2 - ny ** 2, 0, 1))
rgb = np.stack([nx / l * 0.5 + 0.5, ny / l * 0.5 + 0.5, (h - h.min()) / (h.max() - h.min())], -1)
Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)).save(OUT, quality=92)
slope = np.sqrt(n[..., 0] ** 2 + n[..., 1] ** 2) / n[..., 2]
print(f"mare_calmo_n.jpg: {SIZE} px for {T:g} m; heights {H.min():.2f} .. {H.max():.2f} m, slope rms {np.sqrt((slope ** 2).mean()):.3f}, "
      f"{os.path.getsize(OUT) // 1024} KB")
