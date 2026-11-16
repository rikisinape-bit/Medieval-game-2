// Turns every .glb in a folder into a .js module that exports the file as base64 (for hosts that only serve text/JS).
import fs from "node:fs";
import path from "node:path";
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".glb"))) {
  const b64 = fs.readFileSync(path.join(dir, f)).toString("base64");
  fs.writeFileSync(path.join(dir, f.replace(/\.glb$/, ".js")), `export default "${b64}";\n`);
  fs.unlinkSync(path.join(dir, f));
  console.log(`${f} -> ${f.replace(/\.glb$/, ".js")}`);
}
