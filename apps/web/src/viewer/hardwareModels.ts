/**
 * Door hardware modelled from John's artwork SVGs: vector outlines drawn over
 * a front-on product photo, plus angled photos for reference. Each outline
 * becomes a simple solid; the front-on photo is projected onto the parts'
 * faces, so screw heads, slots and the polished finish come from the photo.
 * Sides take polished stainless.
 *
 * Model space: SVG units, x right, y up (SVG y flipped), z out from the
 * surface the part is mounted on. Builders return an object scaled to mm.
 */
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import hingeSvg from '../assets/products/hinge-1238.svg?raw';
import closerSvg from '../assets/products/closer-20ss.svg?raw';

interface Photo {
  href: string;
  w: number;
  h: number;
  /** Placement in the SVG: translate then uniform scale. */
  tx: number;
  ty: number;
  s: number;
}

interface Art {
  /** Shapes of each vector element, in document order (model space, y up). */
  shapes: THREE.Shape[][];
  boxes: THREE.Box2[];
  photo: Photo;
}

/** Read an artwork SVG; `photoIndex` picks which <image> is the front-on photo. */
function readArt(svg: string, photoIndex: number): Art {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const img = doc.querySelectorAll('image')[photoIndex];
  const tf = img.getAttribute('transform') ?? '';
  const tr = tf.match(/translate\(\s*([-\d.]+)(?:[\s,]+([-\d.]+))?\s*\)/);
  const sc = tf.match(/scale\(\s*([-\d.]+)/);
  const photo: Photo = {
    href: img.getAttribute('href') ?? img.getAttribute('xlink:href') ?? '',
    w: Number(img.getAttribute('width')),
    h: Number(img.getAttribute('height')),
    tx: tr ? Number(tr[1]) : 0,
    ty: tr && tr[2] ? Number(tr[2]) : 0,
    s: sc ? Number(sc[1]) : 1,
  };
  const flip = (v: THREE.Vector2) => new THREE.Vector2(v.x, -v.y);
  const shapes = new SVGLoader().parse(svg).paths.map((p) =>
    p.toShapes().map((s) => {
      const out = new THREE.Shape(s.getPoints(6).map(flip));
      for (const h of s.holes) out.holes.push(new THREE.Path(h.getPoints(6).map(flip)));
      return out;
    }),
  );
  const boxes = shapes.map((ss) => {
    const b = new THREE.Box2();
    for (const s of ss) for (const p of s.getPoints()) b.expandByPoint(p);
    return b;
  });
  return { shapes, boxes, photo };
}

/** Project the front-on photo onto geometry from its x/y (model y = −SVG y). */
function projectUV(geo: THREE.BufferGeometry, p: Photo) {
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - p.tx) / (p.w * p.s);
    uv[i * 2 + 1] = 1 - (-pos.getY(i) - p.ty) / (p.h * p.s);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

interface Kit {
  photoMat: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  geometries: THREE.BufferGeometry[];
  photo: Photo;
}

const textures = new Map<string, THREE.Texture>();
function photoTexture(href: string) {
  let t = textures.get(href);
  if (!t) {
    t = new THREE.TextureLoader().load(href);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    textures.set(href, t);
  }
  return t;
}

function kit(photo: Photo): Kit {
  return {
    // Polished stainless: the photo on the faces, bright steel on the sides.
    photoMat: new THREE.MeshStandardMaterial({ map: photoTexture(photo.href), roughness: 0.28, metalness: 0.55 }),
    // Bright enough under the soft room light to read as polished stainless, not dark grey.
    steel: new THREE.MeshStandardMaterial({ color: 0xe4e7ea, roughness: 0.3, metalness: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.8 }),
    geometries: [],
    photo,
  };
}

/** Extrude shapes from z0 to z1; the front face (z1) gets the photo, the rest steel. */
function slab(k: Kit, shapes: THREE.Shape[], z0: number, z1: number, bevel = 0): THREE.Mesh {
  const depth = Math.max(0.5, z1 - z0 - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.7,
    bevelSegments: 2,
  });
  g.translate(0, 0, z0 + bevel);
  projectUV(g, k.photo);
  const caps = g.groups.find((x) => x.materialIndex === 0);
  const sides = g.groups.find((x) => x.materialIndex === 1);
  if (caps && sides) {
    g.clearGroups();
    g.addGroup(caps.start, caps.count / 2, 1); // back
    g.addGroup(caps.start + caps.count / 2, caps.count / 2, 0); // front
    g.addGroup(sides.start, sides.count, 1);
  }
  k.geometries.push(g);
  return new THREE.Mesh(g, [k.photoMat, k.steel]);
}

/** Box from a 2D box, z0 → z1. */
function block(k: Kit, b: THREE.Box2, z0: number, z1: number, bevel = 0): THREE.Mesh {
  const s = new THREE.Shape([
    new THREE.Vector2(b.min.x, b.min.y),
    new THREE.Vector2(b.max.x, b.min.y),
    new THREE.Vector2(b.max.x, b.max.y),
    new THREE.Vector2(b.min.x, b.max.y),
  ]);
  return slab(k, [s], z0, z1, bevel);
}

/** Cylinder along y (or x), with the photo projected on it. */
function rod(k: Kit, cx: number, cy: number, cz: number, r: number, len: number, axis: 'y' | 'x', mat?: THREE.Material): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r, r, len, 20);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  g.translate(cx, cy, cz);
  projectUV(g, k.photo);
  k.geometries.push(g);
  return new THREE.Mesh(g, mat ?? k.photoMat);
}

/** Low domed screw head facing out of the surface. */
function screw(k: Kit, cx: number, cy: number, z: number, r: number): THREE.Mesh {
  const g = new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  g.rotateX(Math.PI / 2);
  g.scale(1, 1, 0.35);
  g.translate(cx, cy, z);
  projectUV(g, k.photo);
  k.geometries.push(g);
  return new THREE.Mesh(g, k.photoMat);
}

export interface Built {
  object: THREE.Object3D;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

function finish(k: Kit, parts: THREE.Object3D[], origin: THREE.Vector2, scale: number): Built {
  const root = new THREE.Group();
  parts.forEach((p) => root.add(p));
  root.position.set(-origin.x * scale, -origin.y * scale, 0);
  root.scale.setScalar(scale);
  const holder = new THREE.Group();
  holder.add(root);
  holder.traverse((o) => {
    o.castShadow = true;
    o.userData.shared = true;
  });
  return { object: holder, geometries: k.geometries, materials: [k.photoMat, k.steel, k.dark] };
}

/**
 * ICC-1238 cam-lift hinge, left hand as drawn (strap reaching right onto the
 * door). Origin: centre of the base plate across, strap centre line up, on the
 * frame face. `standoff` (mm): how far the door face stands in front of the
 * frame face, so the strap lies on the door and the plate on the frame.
 *
 * Elements: 0 strap, 1 spine, 2 base plate, 3 pin block, 4 pin barrel, then circles (screws).
 */
export function buildHinge(standoff: number): Built {
  const art = readArt(hingeSvg, 1);
  const k = kit(art.photo);
  // 9" from pin to strap tip (CONFIRM against the ICC-1238 spec).
  const barrelB = art.boxes[4];
  const strapB = art.boxes[0];
  const pinX = (barrelB.min.x + barrelB.max.x) / 2;
  const scale = 228.6 / (strapB.max.x - pinX);
  const u = (mm: number) => mm / scale;
  const plateB = art.boxes[2];
  const strapY = (strapB.min.y + strapB.max.y) / 2;
  const origin = new THREE.Vector2((plateB.min.x + plateB.max.x) / 2, strapY);

  const plateT = u(4);
  const strapT = u(4);
  const zStrap = Math.max(u(standoff), plateT + u(6));
  const r = (barrelB.max.x - barrelB.min.x) / 2;
  const zPin = Math.max(plateT + r, zStrap - r * 0.35);
  const parts: THREE.Object3D[] = [];

  // Base plate on the frame, with its four screws.
  parts.push(slab(k, art.shapes[2], 0, plateT, u(0.8)));
  // Pin block standing out from the plate to the barrel.
  parts.push(block(k, art.boxes[3], plateT - 1, zPin, u(0.8)));
  // Pin barrel: knuckle at the top (under the strap), plain pin below the block.
  const top = barrelB.max.y;
  const bot = barrelB.min.y;
  const blockBottom = art.boxes[3].min.y;
  parts.push(rod(k, pinX, (top + blockBottom) / 2, zPin, r, top - blockBottom, 'y'));
  parts.push(rod(k, pinX, (blockBottom + bot) / 2, zPin, r * 0.72, blockBottom - bot, 'y'));
  parts.push(rod(k, pinX, top + u(1.5), zPin, r * 0.8, u(3), 'y', k.steel)); // cap
  // Strap on the door, raised spine down its middle.
  parts.push(slab(k, art.shapes[0], zStrap, zStrap + strapT, u(1)));
  parts.push(slab(k, art.shapes[1], zStrap + strapT - 0.5, zStrap + strapT + u(1.6), u(0.6)));
  // Screws: those over the plate sit on it; the rest on the strap.
  for (let i = 5; i < art.boxes.length; i++) {
    const b = art.boxes[i];
    const c = b.getCenter(new THREE.Vector2());
    const onPlate = c.x < plateB.max.x; // the four over the plate; the strap's are further out
    const rr = (b.max.x - b.min.x) / 2;
    parts.push(screw(k, c.x, c.y, onPlate ? plateT : zStrap + strapT + u(1.6), rr));
  }
  return finish(k, parts, origin, scale);
}

/**
 * ICC-20SS door closer: the closer body on the door leaf and the catch bracket
 * on the frame above, with the arm and roller between them (the roller and arm
 * come from the angled photo). Origin: centre of the body across, top edge of
 * the door leaf, on the leaf face. `standoff` (mm): how far the leaf face
 * stands in front of the frame face.
 *
 * Elements: 0 body, 1 bottom tab, 2 right tab, 3 left tab, 4 top cap, 5 hood,
 * 6 channel, 7 roller, 8 bracket, 9 left ear, 14 right ear; the rest are slots,
 * which the photo already shows.
 */
export function buildCloser(standoff: number): Built {
  const art = readArt(closerSvg, 1);
  const k = kit(art.photo);
  const body = art.boxes[0];
  // Body 2" wide (CONFIRM against the ICC-20SS spec).
  const scale = 50.8 / (body.max.x - body.min.x);
  const u = (mm: number) => mm / scale;
  const leafTop = body.max.y; // the body hangs from the top edge of the leaf
  const origin = new THREE.Vector2((body.min.x + body.max.x) / 2, leafTop);
  const D = u(32); // body depth off the leaf
  const zFrame = -u(standoff); // frame face, relative to the leaf face
  const tab = u(2);
  const parts: THREE.Object3D[] = [];

  // On the leaf: body, top cap, mounting tabs.
  parts.push(block(k, body, 0, D, u(1.2)));
  parts.push(block(k, art.boxes[4], 0, D + u(1.5), u(0.8)));
  for (const i of [1, 2, 3]) parts.push(block(k, art.boxes[i], 0, tab, u(0.4)));

  // On the frame: catch bracket with ears, channel and hood the roller rides in.
  const chanFront = D + u(4);
  for (const i of [9, 14]) parts.push(block(k, art.boxes[i], zFrame, zFrame + tab, u(0.4)));
  const br = art.boxes[8];
  const wall = u(2.5);
  parts.push(block(k, new THREE.Box2(new THREE.Vector2(br.min.x, br.min.y), new THREE.Vector2(br.min.x + wall, br.max.y)), zFrame, chanFront, u(0.4)));
  parts.push(block(k, new THREE.Box2(new THREE.Vector2(br.max.x - wall, br.min.y), new THREE.Vector2(br.max.x, br.max.y)), zFrame, chanFront, u(0.4)));
  parts.push(block(k, br, zFrame, zFrame + tab, u(0.4)));
  parts.push(slab(k, art.shapes[5], zFrame, chanFront, u(0.8)));
  parts.push(block(k, art.boxes[6], chanFront - u(3), chanFront, u(0.5)));

  // Arm and black roller, up from the top of the body into the channel.
  const rb = art.boxes[7];
  const rc = rb.getCenter(new THREE.Vector2());
  const rr = u(12);
  const zRoller = D * 0.55;
  parts.push(rod(k, rc.x, rc.y + u(4), zRoller, rr, rb.max.x - rb.min.x, 'x', k.dark));
  const pivotY = leafTop - u(10);
  const armLen = rc.y + u(4) - pivotY;
  for (const x of [rb.min.x - u(1.5), rb.max.x + u(1.5)]) {
    const g = new THREE.BoxGeometry(u(2), armLen, u(10));
    g.translate(x, pivotY + armLen / 2, zRoller);
    projectUV(g, k.photo);
    k.geometries.push(g);
    parts.push(new THREE.Mesh(g, k.steel));
  }
  return finish(k, parts, origin, scale);
}
