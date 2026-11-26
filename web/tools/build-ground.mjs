// Builds src/game3d/terreno_erba.jpg, the grass of the ground (see src/game3d/ground.js), from the photo texture of
// the "Grass" material in grass.blend: the packed image "grass-1_diffuse.jpg" (2048 px, seamless, about 2.5 m of lawn).
// grass.blend is not in the repository (assets/sorgenti/terreno/, a third-party material, probably from BlenderKit):
// the image is read straight out of the .blend (zstd-compressed or not). A .jpg/.png can be given instead.
// The colours are graded for the dark-fantasy palette (darker, less saturated), the size reduced to SIZE px and saved
// as JPEG (mozjpeg: on this noisy picture much smaller than WebP). It goes inside the code as a data: URL (vite.config).
// Usage: node tools/build-ground.mjs [path/grass.blend | path/image.jpg]
import fs from "node:fs";
import zlib from "node:zlib";
import sharp from "sharp";

const SRC = process.argv[2] || new URL("../../assets/sorgenti/terreno/grass.blend", import.meta.url).pathname;
const OUT = new URL("../src/game3d/terreno_erba.jpg", import.meta.url).pathname;
const IMAGE = "grass-1_diffuse.jpg";     // name of the packed image inside the .blend
const SIZE = 1024, QUALITY = 60, BRIGHTNESS = 1.25, SATURATION = 0.6;

// Blender compresses .blend files with zstd in the "seekable" format: independent frames, and at the end a table with
// the size of each one (Node decodes one frame per call).
function unzstd(d) {
  if (d.readUInt32LE(d.length - 4) !== 0x8f92eab1) return zlib.zstdDecompressSync(d);
  const n = d.readUInt32LE(d.length - 9), entry = d[d.length - 5] & 0x80 ? 12 : 8, table = d.length - 9 - n * entry;
  const parts = [];
  for (let k = 0, off = 0; k < n; k++) { const size = d.readUInt32LE(table + k * entry); parts.push(zlib.zstdDecompressSync(d.subarray(off, off + size))); off += size; }
  return Buffer.concat(parts);
}

// The bytes of a packed JPEG: the first one after the image's name, from its SOI marker to its EOI marker.
function jpegFromBlend(file) {
  let d = fs.readFileSync(file);
  if (d.readUInt32LE(0) === 0xfd2fb528) d = unzstd(d);                            // Blender 3.0+ can compress with zstd
  if (d.subarray(0, 7).toString() !== "BLENDER") throw new Error(`${file}: not a .blend file`);
  const at = d.indexOf(`IM${IMAGE}\0`);
  if (at < 0) throw new Error(`${file}: no image "${IMAGE}"`);
  const s = d.indexOf(Buffer.from([0xff, 0xd8, 0xff]), at);
  if (s < 0) throw new Error(`${file}: the image "${IMAGE}" is not packed in the file`);
  for (let i = s + 2; i + 4 <= d.length;) {                                        // walk the JPEG segments
    if (d[i] !== 0xff) throw new Error("broken JPEG");
    const mk = d[i + 1];
    if (mk === 0xd9) return d.subarray(s, i + 2);
    if (mk === 0xd8 || mk === 0x01 || (mk >= 0xd0 && mk <= 0xd7)) { i += 2; continue; }
    i += 2 + d.readUInt16BE(i + 2);
    if (mk === 0xda) {                                                             // entropy-coded data up to the next marker
      while (i + 1 < d.length && !(d[i] === 0xff && d[i + 1] !== 0 && !(d[i + 1] >= 0xd0 && d[i + 1] <= 0xd7))) i++;
    }
  }
  throw new Error("JPEG without end");
}

const input = /\.blend$/i.test(SRC) ? jpegFromBlend(SRC) : fs.readFileSync(SRC);
const meta = await sharp(input).metadata();
const out = await sharp(input).resize(SIZE, SIZE).modulate({ brightness: BRIGHTNESS, saturation: SATURATION }).jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
fs.writeFileSync(OUT, out);
console.log(`${SRC} (${meta.width}x${meta.height}) -> ${OUT}: ${SIZE}x${SIZE}, ${(out.length / 1024).toFixed(0)} KB`);
