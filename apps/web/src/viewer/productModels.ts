/**
 * Product models built from an artwork SVG: vector shapes for the parts, and
 * the embedded product photo as their texture.
 *
 * Each SVG holds one <image> (the photo) and one vector element per part,
 * drawn over the photo in the same coordinates. A recipe gives each element a
 * role (housing, boot, cable, gland…) and says how to turn it into 3D. Every
 * part's UVs are projected straight from the SVG's x/y onto the photo, so the
 * front of the model shows the photo exactly where the artwork put it.
 *
 * Model space: SVG units, x right, y up (SVG y flipped), z out of the wall.
 * The returned object is scaled to millimetres, with its origin at the centre
 * of the housing's back face (on the wall).
 *
 * Elements are matched by id when the SVG has them (id="housing" etc.), else
 * by order. Giving parts ids in future artwork makes recipes order-proof.
 */
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import tsc2000Svg from '../assets/products/tsc2000.svg?raw';
import { type Built, buildCloser, buildHinge } from './hardwareModels';
import { buildEvaporator } from './evaporatorModel';
import { buildIndoorUnit, buildOutdoorUnit, buildPackagedUnit } from './unitModels';

type Role = 'housing' | 'boot' | 'cable' | 'gland';

interface Recipe {
  svg: string;
  /** Role of each vector element, in document order (used when an element has no id). */
  order: Role[];
  /** Real width of the housing in mm; sets the SVG-unit → mm scale. */
  housingWidth: number;
  /** Real depths in mm. */
  depth: { housing: number; glass: number; gland: number };
}

const RECIPES: Record<string, Recipe> = {
  // ICC-TSC2000 Smart Control: 4.5" wide, 1" deep (cable not included).
  TSC2000: {
    svg: tsc2000Svg,
    order: ['housing', 'boot', 'cable', 'gland'],
    housingWidth: 114.3,
    depth: { housing: 25.4, glass: 2.5, gland: 8 },
  },
};

interface Template {
  root: THREE.Object3D;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  texture: THREE.Texture;
  /** Housing size in mm. */
  size: { width: number; height: number };
}

const templates = new Map<string, Template>();

/** Project SVG x/y onto the photo: u = x / width, v = 1 − y / height (geometry y is −SVG y). */
function projectUV(geo: THREE.BufferGeometry, imgW: number, imgH: number) {
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / imgW;
    uv[i * 2 + 1] = 1 + pos.getY(i) / imgH;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Shapes of an SVG node in model space (y up). */
function shapesOf(path: { toShapes: (ccw: boolean) => THREE.Shape[] }): THREE.Shape[] {
  return path.toShapes(true).map((s) => {
    const flip = (v: THREE.Vector2) => new THREE.Vector2(v.x, -v.y);
    const shape = new THREE.Shape(s.getPoints(4).map(flip));
    for (const h of s.holes) shape.holes.push(new THREE.Path(h.getPoints(4).map(flip)));
    return shape;
  });
}

function box2(shapes: THREE.Shape[]) {
  const b = new THREE.Box2();
  for (const s of shapes) for (const p of s.getPoints()) b.expandByPoint(p);
  return b;
}

function buildTemplate(id: string): Template | null {
  const r = RECIPES[id];
  if (!r) return null;
  const doc = new DOMParser().parseFromString(r.svg, 'image/svg+xml');
  const img = doc.querySelector('image');
  const href = img?.getAttribute('xlink:href') ?? img?.getAttribute('href') ?? '';
  const imgW = Number(img?.getAttribute('width') ?? 1);
  const imgH = Number(img?.getAttribute('height') ?? 1);

  const parsed = new SVGLoader().parse(r.svg).paths;
  const byRole = new Map<Role, THREE.Shape[]>();
  parsed.forEach((p, i) => {
    const node = p.userData?.node as Element | undefined;
    const role = ((node?.getAttribute('id') as Role | null) ?? r.order[i]) as Role | undefined;
    if (role) byRole.set(role, shapesOf(p));
  });
  const housing = byRole.get('housing');
  if (!housing) return null;

  const texture = new THREE.TextureLoader().load(href);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const hb = box2(housing);
  const scale = r.housingWidth / (hb.max.x - hb.min.x);
  const toUnits = (mm: number) => mm / scale;
  const D = toUnits(r.depth.housing);

  const photo = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.35, metalness: 0.05 });
  const glassMat = new THREE.MeshPhysicalMaterial({ map: texture, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: 0.75 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x2aa9ba, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: 0.25, metalness: 0.6 });
  const cableMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
  const geometries: THREE.BufferGeometry[] = [];
  const keep = (g: THREE.BufferGeometry) => (geometries.push(g), g);

  const root = new THREE.Group();

  // Housing: the octagon extruded with a rounded edge. The photo goes on the
  // front; the edge takes a teal band (the bumper in the photo) over dark rubber.
  const bevel = toUnits(2.2);
  const hg = keep(new THREE.ExtrudeGeometry(housing, { depth: D - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3 }));
  hg.translate(0, 0, bevel);
  projectUV(hg, imgW, imgH);
  // ExtrudeGeometry: group 0 = both caps (back first, then front), group 1 = sides and bevel.
  const caps = hg.groups.find((g) => g.materialIndex === 0);
  const sides = hg.groups.find((g) => g.materialIndex === 1);
  if (caps && sides) {
    hg.clearGroups();
    hg.addGroup(caps.start, caps.count / 2, 1); // back
    hg.addGroup(caps.start + caps.count / 2, caps.count / 2, 0); // front: photo
    hg.addGroup(sides.start, sides.count, 2); // edge
  }
  const housingMesh = new THREE.Mesh(hg, [photo, rubber, teal]);
  root.add(housingMesh);

  // Raised glass face: the same outline shrunk toward its centre, standing proud of the front.
  const c = hb.getCenter(new THREE.Vector2());
  const inset = 0.86;
  const glassShapes = housing.map((s) => new THREE.Shape(s.getPoints(4).map((p) => new THREE.Vector2(c.x + (p.x - c.x) * inset, c.y + (p.y - c.y) * inset))));
  const gg = keep(new THREE.ExtrudeGeometry(glassShapes, { depth: toUnits(r.depth.glass), bevelEnabled: false }));
  gg.translate(0, 0, D - toUnits(0.6));
  projectUV(gg, imgW, imgH);
  root.add(new THREE.Mesh(gg, glassMat));

  // Strain-relief boot: a tapered round boot from the trapezoid (top and bottom widths, height).
  const boot = byRole.get('boot');
  let bootBottom = hb.min.y;
  if (boot) {
    const pts = boot.flatMap((s) => s.getPoints());
    const b = box2(boot);
    const near = (y: number) => pts.filter((p) => Math.abs(p.y - y) < 2).map((p) => p.x);
    const topW = Math.max(...near(b.max.y)) - Math.min(...near(b.max.y));
    const botW = Math.max(...near(b.min.y)) - Math.min(...near(b.min.y));
    const h = b.max.y - b.min.y;
    const g = keep(new THREE.CylinderGeometry(topW / 2, botW / 2, h, 24));
    g.translate((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, D / 2);
    projectUV(g, imgW, imgH);
    root.add(new THREE.Mesh(g, cableMat));
    bootBottom = b.min.y;
  }

  // Cable and gland: the cable drops from the boot to the gland, then turns into the wall through it.
  const cable = byRole.get('cable');
  const gland = byRole.get('gland');
  if (cable) {
    const b = box2(cable);
    const rad = (b.max.x - b.min.x) / 2;
    const cx = (b.min.x + b.max.x) / 2;
    const glandY = gland ? box2(gland).getCenter(new THREE.Vector2()).y : b.min.y;
    const len = bootBottom - glandY;
    const g = keep(new THREE.CylinderGeometry(rad, rad, len, 16));
    g.translate(cx, bootBottom - len / 2, D / 2);
    projectUV(g, imgW, imgH);
    root.add(new THREE.Mesh(g, cableMat));
    // Short run back into the gland.
    const back = keep(new THREE.CylinderGeometry(rad, rad, D / 2, 16));
    back.rotateX(Math.PI / 2);
    back.translate(cx, glandY, D / 4);
    projectUV(back, imgW, imgH);
    root.add(new THREE.Mesh(back, cableMat));
  }
  if (gland) {
    // Hex nut seen face-on: extrude it with a hole for the cable, flat against the wall.
    const gb = box2(gland);
    const gc = gb.getCenter(new THREE.Vector2());
    const holeR = (gb.max.x - gb.min.x) * 0.2;
    const nut = gland.map((s) => {
      const sh = new THREE.Shape(s.getPoints());
      sh.holes.push(new THREE.Path().absarc(gc.x, gc.y, holeR, 0, Math.PI * 2, true) as THREE.Path);
      return sh;
    });
    const g = keep(new THREE.ExtrudeGeometry(nut, { depth: toUnits(r.depth.gland), bevelEnabled: true, bevelThickness: toUnits(0.8), bevelSize: toUnits(0.6), bevelSegments: 2 }));
    projectUV(g, imgW, imgH);
    root.add(new THREE.Mesh(g, steel));
  }

  // Origin at the centre of the housing's back face; scale to mm.
  root.position.set(-c.x * scale, -c.y * scale, 0);
  root.scale.setScalar(scale);
  const holder = new THREE.Group();
  holder.add(root);
  root.updateMatrix();
  holder.traverse((o) => {
    o.castShadow = true;
    o.userData.shared = true;
  });

  return {
    root: holder,
    geometries,
    materials: [photo, glassMat, rubber, teal, steel, cableMat],
    texture,
    size: { width: (hb.max.x - hb.min.x) * scale, height: (hb.max.y - hb.min.y) * scale },
  };
}

/** Door hardware built from artwork, keyed by model and fit (standoff in mm). */
const HARDWARE: Record<string, (p: Record<string, number>) => Built> = {
  'HINGE-1238': (p) => buildHinge(p.standoff ?? 0),
  'CLOSER-20SS': (p) => buildCloser(p.standoff ?? 0),
  EVAPORATOR: (p) => buildEvaporator(p.fans ?? 1, p.fanDiameter ?? 355.6, p.depth ?? 406.4),
  'CU-INDOOR': buildIndoorUnit,
  'CU-OUTDOOR': buildOutdoorUnit,
  PACKAGED: buildPackagedUnit,
};
const hardware = new Map<string, Built>();

/**
 * A copy of a product model (shares geometry, materials and texture with the
 * cached template). `params` select a fit (e.g. how far a door stands proud of
 * its frame); each distinct fit is built once. Null when there is no recipe.
 */
export function productModel(id: string, params: Record<string, number> = {}): THREE.Object3D | null {
  const make = HARDWARE[id];
  if (make) {
    // Two decimals: unit sizes come in inches.
    const key = `${id}|${Object.entries(params).map(([k, v]) => `${k}=${Math.round(v * 100) / 100}`).join(',')}`;
    let b = hardware.get(key);
    if (!b) {
      b = make(params);
      hardware.set(key, b);
    }
    return b.object.clone(true);
  }
  let t = templates.get(id);
  if (!t) {
    const built = buildTemplate(id);
    if (!built) return null;
    t = built;
    templates.set(id, t);
  }
  return t.root.clone(true);
}

export function hasProductModel(id: string): boolean {
  return id in RECIPES || id in HARDWARE;
}

export function disposeProductModels() {
  for (const t of templates.values()) {
    t.geometries.forEach((g) => g.dispose());
    t.materials.forEach((m) => m.dispose());
    t.texture.dispose();
  }
  templates.clear();
  for (const b of hardware.values()) {
    b.geometries.forEach((g) => g.dispose());
    b.materials.forEach((m) => m.dispose());
  }
  hardware.clear();
}
