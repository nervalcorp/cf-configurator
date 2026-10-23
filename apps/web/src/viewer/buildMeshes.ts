/**
 * Turns a core ComponentTree into Three.js objects. This is the only place
 * that knows about meshes; everything it draws comes from the tree.
 * All geometry is in mm; the caller scales the root group to metres.
 */
import * as THREE from 'three';
import type { BoxPart, ComponentTree, Dimension, Face, Part, RampPart, SlabPart, WallPart } from '@wic/core';
import type { Materials, Skin } from './materials';

export interface Built {
  root: THREE.Group;
  dims: THREE.Group;
  /** Meshes that show a hover label. */
  pickable: THREE.Mesh[];
}

/** BoxGeometry material slots: [+x, -x, +y, -y, +z, -z]. */
const FACE_SLOT: Record<Face, number> = { '+x': 0, '-x': 1, '+z': 4, '-z': 5 };

/**
 * @param flags part id → problems with that part; flagged parts get a red overlay
 *              and their messages on hover.
 */
export function buildMeshes(tree: ComponentTree, mats: Materials, skin: Skin, flags: Map<string, string[]> = new Map()): Built {
  const root = new THREE.Group();
  const dims = new THREE.Group();
  const pickable: THREE.Mesh[] = [];

  for (const part of tree.parts) {
    const mesh = partMesh(part, mats, skin);
    if (!mesh) continue;
    mesh.castShadow = part.kind !== 'roof';
    mesh.receiveShadow = true;
    const problems = flags.get(part.id);
    mesh.userData = { partId: part.id, label: part.label, doorId: 'doorId' in part ? part.doorId : undefined, problems };
    root.add(mesh);
    if (problems) {
      const overlay = new THREE.Mesh(mesh.geometry, mats.flag);
      overlay.renderOrder = 2;
      overlay.userData.overlay = true;
      mesh.add(overlay);
    }
    if (OUTLINED.has(part.kind)) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 15), mats.edge);
      edges.position.copy(mesh.position);
      edges.rotation.copy(mesh.rotation);
      root.add(edges);
    }
    if ((part.label && part.kind !== 'floor' && part.kind !== 'roof') || problems) pickable.push(mesh);
  }

  for (const d of tree.dimensions) addDimension(dims, d, mats);
  root.add(dims);
  return { root, dims, pickable };
}

const OUTLINED = new Set<Part['kind']>(['post', 'wall', 'door-leaf', 'door-frame', 'floor', 'roof', 'track', 'housing', 'curtain', 'guide', 'glass', 'plate']);

function partMesh(part: Part, mats: Materials, skin: Skin): THREE.Mesh | null {
  switch (part.kind) {
    case 'post': {
      const slots: THREE.Material[] = Array(6).fill(mats.interior);
      for (const f of part.exteriorFaces ?? []) slots[FACE_SLOT[f]] = skin.exteriorPlain;
      return boxMesh(part, slots);
    }
    case 'wall':
      return wallMesh(part, mats, skin);
    case 'ramp':
      return rampMesh(part, mats);
    case 'badge': {
      if (!part.logo) return boxMesh(part, tinted(mats.threshold, part.color ?? '#1f2a33'));
      const slots: THREE.Material[] = Array(6).fill(mats.badgeBody);
      slots[4] = mats.badgeFace;
      return boxMesh(part, slots);
    }
    case 'gasket':
      return boxMesh(part, mats.threshold);
    case 'trim':
      return boxMesh(part, part.color ? tinted(mats.frame, part.color) : mats.frame);
    case 'latch':
      return boxMesh(part, part.color ? tinted(mats.chrome, part.color) : mats.chrome);
    case 'door-leaf':
      return boxMesh(part, part.color ? tinted(mats.doorLeaf, part.color) : mats.doorLeaf);
    case 'door-frame':
      return boxMesh(part, part.color ? tinted(mats.frame, part.color) : mats.frame);
    case 'glass':
      return boxMesh(part, mats.displayGlass);
    case 'logo':
      return boxMesh(part, mats.logoWhite);
    case 'threshold':
      return boxMesh(part, mats.threshold);
    case 'hinge':
    case 'closer':
      return boxMesh(part, mats.chrome);
    case 'handle':
      return boxMesh(part, part.color ? tinted(mats.chrome, part.color) : mats.chrome);
    case 'window':
      return boxMesh(part, mats.glass);
    case 'track':
    case 'guide':
    case 'housing':
      return boxMesh(part, part.color ? tinted(mats.track, part.color) : mats.track);
    case 'curtain':
      return boxMesh(part, part.color ? tinted(mats.curtain, part.color) : mats.curtain);
    case 'hinge-pin':
    case 'cable': {
      const seg = part.kind === 'cable' && part.radius > 8 ? 6 : 12; // the gland is a hex nut
      const m = new THREE.Mesh(new THREE.CylinderGeometry(part.radius, part.radius, part.height, seg), part.kind === 'cable' ? mats.cable : mats.chrome);
      m.position.set(...part.center);
      return m;
    }
    case 'plate':
      return plateMesh(part, mats);
    case 'control-body':
      return boxMesh(part, tinted(mats.badgeBody, part.color ?? '#16181b'));
    case 'screen': {
      const slots: THREE.Material[] = Array(6).fill(mats.cable);
      slots[4] = part.screen === 'TC1000' ? mats.screenTC : mats.screenTSC;
      return boxMesh(part, slots);
    }
    case 'floor':
    case 'roof':
      return slabMesh(part, part.kind === 'roof' ? skin.roof : part.concrete ? mats.concrete : mats.floor);
  }
}

/** A one-off copy of a shared material in another colour; disposed with the model. */
function tinted(base: THREE.MeshStandardMaterial, color: string) {
  const m = base.clone();
  m.color.set(color);
  return m;
}

function boxMesh(p: BoxPart, mat: THREE.Material | THREE.Material[]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...p.size), mat);
  m.position.set(...p.center);
  if (p.rotationY) m.rotation.y = p.rotationY;
  return m;
}

/** Footprint polygon extruded up. Shape y is negated so rotateX(-90°) lands it on +Z. */
function slabMesh(p: SlabPart, mat: THREE.Material) {
  const shape = new THREE.Shape(p.polygon.map(([x, y]) => new THREE.Vector2(x, -y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: p.thickness, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = p.y;
  return m;
}

/**
 * Wall outlines extruded along local +Z (inside face at z = 0, outside at z = T).
 * ExtrudeGeometry puts both caps of a shape in one group (z = 0 cap first, then
 * z = T) and the sides in the next; split the caps so only the outside one
 * gets the exterior finish. One geometry per outline keeps the groups simple.
 */
function wallMesh(p: WallPart, mats: Materials, skin: Skin) {
  const geos = p.profiles.map(({ outline, holes }) => {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: p.thickness, bevelEnabled: false });
    const caps = geo.groups.find((g) => g.materialIndex === 0);
    const sides = geo.groups.find((g) => g.materialIndex === 1);
    if (caps && sides) {
      const half = caps.count / 2;
      geo.clearGroups();
      geo.addGroup(caps.start, half, 0);
      geo.addGroup(caps.start + half, half, 1);
      geo.addGroup(sides.start, sides.count, 0);
    }
    return geo;
  });
  const geo = geos.length === 1 ? geos[0] : mergeWithGroups(geos);
  const m = new THREE.Mesh(geo, [mats.interior, skin.exterior]);
  m.position.set(...p.origin);
  m.rotation.y = p.rotationY;
  return m;
}

/**
 * ICC-R3436 ramp, after the product photo: a polished aluminium wedge with four
 * grit strips across the slope, a grit nosing at each end, and a handle slot in
 * each side near the high end. Local x runs along the wall, local z away from it.
 */
function rampMesh(p: RampPart, mats: Materials) {
  const L = p.length;
  const H = Math.max(p.height, 6);
  const W = p.width;
  const lip = Math.min(6, H * 0.15);
  // Side profile in (z, y), extruded along x.
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(L, 0), new THREE.Vector2(L, lip), new THREE.Vector2(0, H)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false });
  // Profile x → local z, extrusion → local x.
  geo.rotateY(-Math.PI / 2);
  geo.translate(W, 0, 0);
  const body = new THREE.Mesh(geo, mats.rampBody);
  const slope = Math.atan2(H - lip, L);
  const surfaceY = (z: number) => H - ((H - lip) * z) / L;
  for (const t of [0.04, 0.22, 0.42, 0.62, 0.82, 0.97]) {
    const z = t * L;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(W - 10, 3, t === 0.04 || t === 0.97 ? 30 : 22), mats.rampGrit);
    strip.position.set(W / 2, surfaceY(z) + 1.5, z);
    strip.rotation.x = slope;
    body.add(strip);
  }
  if (H > 35) {
    for (const x of [-0.6, W + 0.6]) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(2, H * 0.35, L * 0.12), mats.rampSlot);
      slot.position.set(x, H * 0.45, L * 0.1);
      body.add(slot);
    }
  }
  body.position.set(...p.origin);
  body.rotation.y = p.rotationY;
  body.castShadow = true;
  return body;
}

/**
 * A checker plate square. Its outside face gets UVs in feet of wall, so the
 * one-foot tread texture continues from square to square.
 */
function plateMesh(p: BoxPart, mats: Materials) {
  const geo = new THREE.BoxGeometry(...p.size);
  const [u0, v0, u1, v1] = p.wallRect ?? [0, 0, 304.8, 304.8];
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  // Face 4 (+Z, the outside) owns vertices 16-19.
  for (let i = 16; i < 20; i++) {
    uv.setXY(i, (u0 + uv.getX(i) * (u1 - u0)) / 304.8, (v0 + uv.getY(i) * (v1 - v0)) / 304.8);
  }
  uv.needsUpdate = true;
  const slots: THREE.Material[] = Array(6).fill(mats.track);
  slots[4] = mats.checker;
  const m = new THREE.Mesh(geo, slots);
  m.position.set(...p.center);
  m.rotation.y = p.rotationY ?? 0;
  return m;
}

/** Concatenate non-indexed geometries, keeping each one's material groups. */
function mergeWithGroups(geos: THREE.BufferGeometry[]) {
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'uv'] as const;
  let offset = 0;
  for (const name of names) {
    const arrays = geos.map((g) => g.getAttribute(name).array as Float32Array);
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const merged = new Float32Array(total);
    let at = 0;
    for (const a of arrays) {
      merged.set(a, at);
      at += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(merged, geos[0].getAttribute(name).itemSize));
  }
  for (const g of geos) {
    for (const grp of g.groups) out.addGroup(grp.start + offset, grp.count, grp.materialIndex);
    offset += g.getAttribute('position').count;
    g.dispose();
  }
  return out;
}

function addDimension(group: THREE.Group, d: Dimension, mats: Materials) {
  const a = new THREE.Vector3(...d.a);
  const b = new THREE.Vector3(...d.b);
  const line = (p: THREE.Vector3, q: THREE.Vector3) =>
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, q]), mats.dimLine));
  line(a, b);
  // End ticks, perpendicular to the line and to the label direction.
  const dir = b.clone().sub(a).normalize();
  const off = new THREE.Vector3(...d.labelOffset).normalize();
  const tick = new THREE.Vector3().crossVectors(dir, off).normalize().multiplyScalar(40);
  if (tick.lengthSq() < 1) tick.set(0, 40, 0);
  for (const p of [a, b]) line(p.clone().sub(tick), p.clone().add(tick));

  const sprite = labelSprite(d.label);
  sprite.position.copy(a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(...d.labelOffset)));
  group.add(sprite);
}

function labelSprite(text: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 80;
  const ctx = c.getContext('2d')!;
  ctx.font = '600 40px "IBM Plex Mono", ui-monospace, monospace';
  const w = Math.min(240, ctx.measureText(text).width + 32);
  const x = (256 - w) / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.beginPath();
  ctx.roundRect(x, 12, w, 56, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(14,154,167,0.65)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 41);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(720, 225, 1);
  s.renderOrder = 10;
  return s;
}

export function disposeTree(obj: THREE.Object3D, keep: Set<THREE.Material>) {
  obj.traverse((o) => {
    if (o.userData.overlay) return; // shares its geometry with the parent
    const anyO = o as THREE.Mesh;
    anyO.geometry?.dispose();
    const m = anyO.material as THREE.Material | THREE.Material[] | undefined;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      if (keep.has(mat)) continue;
      (mat as THREE.SpriteMaterial).map?.dispose();
      mat.dispose();
    }
  });
}
