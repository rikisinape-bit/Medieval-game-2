// tools/export_data.mjs
// Converte i dati del gioco Three.js in JSON per Godot.
// Uso:  node tools/export_data.mjs <cartella src/game3d>
// Scrive data/world.json, data/items.json, data/dialogs.json.
// Le funzioni (es. applyEffect, condizioni) NON si esportano: vanno riscritte in GDScript;
// lo script le elenca alla fine.
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Hook: finto 'three' + import senza estensione (stile Vite).
const hooks = `
const THREE_NAMES = ${JSON.stringify(['Vector2','Vector3','Color','Euler','Quaternion','Matrix4','Mesh','Group','Object3D',
  'BoxGeometry','PlaneGeometry','CylinderGeometry','SphereGeometry','ConeGeometry','MeshLambertMaterial',
  'MeshStandardMaterial','MeshBasicMaterial','PointLight','DirectionalLight','AmbientLight','HemisphereLight',
  'Fog','FogExp2','Scene','PerspectiveCamera','WebGLRenderer','Clock','Raycaster','InstancedMesh','CanvasTexture',
  'Texture','Sprite','SpriteMaterial','BufferGeometry','Float32BufferAttribute','MathUtils'])};
export async function resolve(spec, ctx, next) {
  if (spec === 'three' || spec.startsWith('three/')) return { url: 'stub:three', shortCircuit: true };
  try { return await next(spec, ctx); }
  catch (e) {
    for (const ext of ['.js', '.mjs', '/index.js']) {
      try { return await next(spec + ext, ctx); } catch {}
    }
    throw e;
  }
}
export async function load(url, ctx, next) {
  if (url === 'stub:three') {
    const body = THREE_NAMES.map(n => 'export class ' + n + ' { constructor(){ return new Proxy(this,{get:(t,k)=>k in t?t[k]:()=>{}}); } }').join('\\n');
    return { format: 'module', source: body + '\\nexport default {};', shortCircuit: true };
  }
  return next(url, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hooks));

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('Uso: node tools/export_data.mjs <cartella src/game3d>');
  process.exit(1);
}
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const dropped = [];

// Copia profonda solo dei valori serializzabili; annota le funzioni scartate.
function clean(v, where) {
  if (typeof v === 'function') { dropped.push(where); return undefined; }
  if (Array.isArray(v)) return v.map((x, i) => clean(x, `${where}[${i}]`));
  if (v && typeof v === 'object') {
    if (v.constructor && v.constructor.name !== 'Object') { dropped.push(where + ' (' + v.constructor.name + ')'); return undefined; }
    const o = {};
    for (const [k, x] of Object.entries(v)) { const c = clean(x, `${where}.${k}`); if (c !== undefined) o[k] = c; }
    return o;
  }
  return v;
}

for (const name of ['world', 'items', 'dialogs']) {
  const file = path.join(src, name + '.js');
  if (!existsSync(file)) { console.warn('manca', file); continue; }
  try {
    const mod = await import(pathToFileURL(file).href);
    const out = { _source: name + '.js' };
    for (const [k, v] of Object.entries(mod)) {
      const c = clean(v, `${name}.${k}`);
      if (c !== undefined) out[k] = c;
    }
    writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(out, null, 2));
    console.log('OK', name + '.json:', Object.keys(out).filter(k => k !== '_source').join(', '));
  } catch (e) {
    console.error('ERRORE', name + '.js:', e.message);
  }
}
if (dropped.length) {
  console.log('\nDa riscrivere in GDScript (funzioni/oggetti non esportati):');
  for (const d of dropped) console.log('  -', d);
}
