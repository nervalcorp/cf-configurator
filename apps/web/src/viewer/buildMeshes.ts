/**
 * Turns a core ComponentTree into Three.js objects. This is the only place
 * that knows about meshes; everything it draws comes from the tree.
 * All geometry is in mm; the caller scales the root group to metres.
 */
import * as THREE from 'three';
import type { BoxPart, ComponentTree, Dimension, Part, SlabPart, WallPart } from '@wic/core';
import type { Materials } from './materials';

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
    mesh.userData = { partId: part.id, label: part.label, doorId: 'doorId' in part ? part.doorId : undefined };
    root.add(mesh);
    if (OUTLINED.has(part.kind)) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 15), mats.edge);
      edges.position.copy(mesh.position);
      edges.rotation.copy(mesh.rotation);
      root.add(edges);
    }
    if (part.label && part.kind !== 'floor' && part.kind !== 'roof') pickable.push(mesh);
  }

  for (const d of tree.dimensions) addDimension(dims, d, mats);
  root.add(dims);
  return { root, dims, pickable };
}

const OUTLINED = new Set<Part['kind']>(['post', 'wall', 'door-leaf', 'door-frame', 'floor', 'roof', 'track', 'housing', 'curtain', 'guide']);

function partMesh(part: Part, mats: Materials): THREE.Mesh | null {
  switch (part.kind) {
    case 'post':
      return boxMesh(part, mats.interior);
    case 'wall':
      return wallMesh(part, mats);
    case 'door-leaf':
      return boxMesh(part, part.color ? tinted(mats.doorLeaf, part.color) : mats.doorLeaf);
    case 'door-frame':
      return boxMesh(part, mats.frame);
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
      return boxMesh(part, mats.track);
    case 'housing':
      return boxMesh(part, mats.exterior);
    case 'curtain':
      return boxMesh(part, mats.curtain);
    case 'hinge-pin': {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(part.radius, part.radius, part.height, 12), mats.chrome);
      m.position.set(...part.center);
      return m;
    }
    case 'floor':
    case 'roof':
      return slabMesh(part, part.kind === 'floor' ? mats.floor : mats.roof);
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
 * Wall profile extruded along local +Z (inside face at z = 0, outside at z = T).
 * ExtrudeGeometry puts both caps in group 0 (z = 0 cap first, then z = T);
 * split it so only the outside cap gets the exterior finish.
 */
function wallMesh(p: WallPart, mats: Materials) {
  const shape = new THREE.Shape(p.profile.map(([x, y]) => new THREE.Vector2(x, y)));
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
  const m = new THREE.Mesh(geo, [mats.interior, mats.exterior]);
  m.position.set(...p.origin);
  m.rotation.y = p.rotationY;
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
