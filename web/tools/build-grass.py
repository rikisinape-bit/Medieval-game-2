# Makes web/src/game3d/erba.jpg, the grass of the ground (512 px, repeated every few metres by engine.js), from the
# hand-painted grass texture in assets/sorgenti/erba_dipinta/ (third-party original: not in the repository), lighter
# (the original is much darker than the old grass colour) and a little less saturated. Usage: python3 tools/build-grass.py   (needs Pillow)
from pathlib import Path
from PIL import Image, ImageEnhance

here = Path(__file__).resolve().parent
src = here.parent.parent / "assets" / "sorgenti" / "erba_dipinta" / "Stone_Base_Color.tga"
out = here.parent / "src" / "game3d" / "erba.jpg"
im = Image.open(src).convert("RGB").resize((512, 512), Image.LANCZOS)
im = ImageEnhance.Color(im).enhance(0.9)
im = ImageEnhance.Brightness(im).enhance(1.6)
im.save(out, "JPEG", quality=84, optimize=True)
print(out, out.stat().st_size // 1024, "KB")
