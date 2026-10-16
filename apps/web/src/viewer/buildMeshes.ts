/**
 * Turns a core ComponentTree into Three.js objects. This is the only place
 * that knows about meshes; everything it draws comes from the tree.
 * All geometry is in mm; the caller scales the root group to metres.
 */
import * as THREE from 'three';
import type { BoxPart, ComponentTree, Dimension, Face, Part, ProfilePart, SlabPart } from '@wic/core';
import type { Materials } from './materials';

/** BoxGeometry material slots: [+x, -x, +y, -y, +z, -z]. */
const FACE_SLOT: Record<Face, number> = { '+x': 0, '-x': 1, '+z': 4, '-z': 5 };

export interface Built {
  root: THREE.Group;
  dims: THREE.Group;
  /** Meshes that show a hover label. */
  pickable: THREE.Mesh[];
}

export function buildMeshes(tree: ComponentTree, mats: Materials): Built {
  const root = new THREE.Group();
  const dims = new THREE.Group();
  const pickable: THREE.Mesh[] = [];

  for (const part of tree.parts) {
    const mesh = partMesh(part, mats);
    if (!mesh) continue;
    mesh.castShadow = part.kind !== 'roof';
    mesh.receiveShadow = true;
    mesh.userData = { partId: part.id, label: part.label };
    root.add(mesh);
    if (part.kind !== 'hinge' && part.kind !== 'hinge-pin' && part.kind !== 'threshold') {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 15), mats.edge);
      edges.position.copy(mesh.position);
      root.add(edges);
    }
    if (part.label && part.kind !== 'floor' && part.kind !== 'roof') pickable.push(mesh);
  }

  for (const d of tree.dimensions) addDimension(dims, d, mats);
  root.add(dims);
  return { root, dims, pickable };
}

function partMesh(part: Part, mats: Materials): THREE.Mesh | null {
  switch (part.kind) {
    case 'post':
      return boxMesh(part, mats.interior);
    case 'panel': {
      const slots: THREE.Material[] = Array(6).fill(mats.interior);
      if (part.exteriorFace) slots[FACE_SLOT[part.exteriorFace]] = mats.exterior;
      return boxMesh(part, slots);
    }
    case 'door-leaf':
      return boxMesh(part, mats.doorLeaf);
    case 'door-frame':
      return boxMesh(part, mats.frame);
    case 'threshold':
      return boxMesh(part, mats.threshold);
    case 'hinge':
      return boxMesh(part, mats.chrome);
    case 'hinge-pin': {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(part.radius, part.radius, part.height, 12), mats.chrome);
      m.position.set(...part.center);
      return m;
    }
    case 'floor':
    case 'roof':
      return slabMesh(part, part.kind === 'floor' ? mats.floor : mats.roof);
    case 'door-wall':
      return profileMesh(part, mats);
  }
}

function boxMesh(p: BoxPart, mat: THREE.Material | THREE.Material[]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...p.size), mat);
  m.position.set(...p.center);
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
 * Door-wall L-profile extruded along +Z. ExtrudeGeometry puts both caps in
 * group 0 (back cap first, then front); split it so only the outside cap gets
 * the exterior finish. The original build painted both caps.
 */
function profileMesh(p: ProfilePart, mats: Materials) {
  const shape = new THREE.Shape(p.profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: p.thickness, bevelEnabled: false });
  const caps = geo.groups.find((g) => g.materialIndex === 0);
  const sides = geo.groups.find((g) => g.materialIndex === 1);
  if (caps && sides) {
    const half = caps.count / 2;
    geo.clearGroups();
    geo.addGroup(caps.start, half, 0); // z = 0 (back, −Z)
    geo.addGroup(caps.start + half, half, 1); // z = depth (front, +Z)
    geo.addGroup(sides.start, sides.count, 2);
  }
  const back = p.exteriorFace === '-z' ? mats.exterior : mats.interior;
  const front = p.exteriorFace === '+z' ? mats.exterior : mats.interior;
  const m = new THREE.Mesh(geo, [back, front, mats.interior]);
  m.position.set(...p.origin);
  return m;
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
  ctx.strokeStyle = 'rgba(221,51,51,0.6)';
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
