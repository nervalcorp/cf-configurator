/**
 * Evaporator model from John's artwork: three front views (1, 2 and 3 fans),
 * each a photo with matching outlines drawn below it. The outlines give the
 * housing, top lip, drain rail, side rails, hanger brackets, pipe stubs and
 * fan circles; the photos give the fans and the ICC badge as textures. The
 * frame is modelled in brushed aluminium like the photos rather than textured.
 *
 * Each outline set sits directly below its photo, same x, shifted down by
 * PHOTO_SHIFT (measured from the fan centres), so outline (x, y) shows photo
 * point (x, y - PHOTO_SHIFT).
 */
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import evapSvg from '../assets/products/evaporators.svg?raw';

const PHOTO_SHIFT = 527.8;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Unit {
  fans: number;
  body: Rect;
  rail: Rect;
  lip: Rect;
  brackets: Rect[];
  sideRails: Rect[];
  stubs: Rect[];
  flanges: Rect[];
  circles: { cx: number; cy: number; r: number }[];
  photo: { href: string; w: number; h: number; tx: number; ty: number; s: number };
}

let units: Unit[] | null = null;

/** Parse the artwork once: group shapes by unit (left to right) and give each a role by its size. */
function parse(): Unit[] {
  if (units) return units;
  const doc = new DOMParser().parseFromString(evapSvg, 'image/svg+xml');
  const photos = [...doc.querySelectorAll('image')].map((img) => {
    const tf = img.getAttribute('transform') ?? '';
    const tr = tf.match(/translate\(\s*([-\d.]+)(?:[\s,]+([-\d.]+))?\s*\)/);
    const sc = tf.match(/scale\(\s*([-\d.]+)/);
    return {
      href: img.getAttribute('href') ?? img.getAttribute('xlink:href') ?? '',
      w: Number(img.getAttribute('width')),
      h: Number(img.getAttribute('height')),
      tx: tr ? Number(tr[1]) : 0,
      ty: tr && tr[2] ? Number(tr[2]) : 0,
      s: sc ? Number(sc[1]) : 1,
    };
  });
  // Every vector element as a box (rects, including rotated ones) or a circle, in SVG coordinates.
  const items = new SVGLoader().parse(evapSvg).paths.map((p) => {
    const node = p.userData?.node as Element;
    const b = new THREE.Box2();
    for (const sp of p.subPaths) for (const pt of sp.getPoints()) b.expandByPoint(pt);
    return { tag: node.tagName, b };
  });
  const bodies = items.filter((i) => i.tag === 'rect' && Math.abs(i.b.max.y - i.b.min.y - 367.54) < 1).sort((a, b) => a.b.min.x - b.b.min.x);
  units = bodies.map((body, k) => {
    const x0 = body.b.min.x - 40;
    const x1 = body.b.max.x + 40;
    const mine = items.filter((i) => i !== body && i.b.min.x >= x0 && i.b.max.x <= x1);
    const rect = (i: (typeof items)[number]): Rect => ({ x: i.b.min.x, y: i.b.min.y, w: i.b.max.x - i.b.min.x, h: i.b.max.y - i.b.min.y });
    const near = (v: number, t: number) => Math.abs(v - t) < 1;
    const rects = mine.filter((i) => i.tag === 'rect').map(rect);
    const circles = mine
      .filter((i) => i.tag === 'circle')
      .map((i) => ({ cx: (i.b.min.x + i.b.max.x) / 2, cy: (i.b.min.y + i.b.max.y) / 2, r: (i.b.max.x - i.b.min.x) / 2 }))
      .sort((a, b) => a.cx - b.cx);
    return {
      fans: circles.length,
      body: rect(body),
      rail: rects.find((r) => near(r.h, 23.95))!,
      lip: rects.find((r) => near(r.h, 17.97))!,
      brackets: rects.filter((r) => near(r.w, 34.91)),
      sideRails: rects.filter((r) => near(r.w, 20.02)),
      stubs: rects.filter((r) => near(r.w, 16.17)),
      flanges: rects.filter((r) => near(r.w, 5.39)),
      circles,
      photo: photos[k],
    };
  });
  return units;
}

/** Project the unit's photo onto geometry: model (x, y) is SVG (x, -y). */
function projectUV(geo: THREE.BufferGeometry, ph: Unit['photo']) {
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = -pos.getY(i) - PHOTO_SHIFT;
    uv[i * 2] = (x - ph.tx) / (ph.w * ph.s);
    uv[i * 2 + 1] = 1 - (y - ph.ty) / (ph.h * ph.s);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const photoTextures = new Map<string, THREE.Texture>();
function photoTexture(href: string) {
  let t = photoTextures.get(href);
  if (!t) {
    t = new THREE.TextureLoader().load(href);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    photoTextures.set(href, t);
  }
  return t;
}

const mats = {
  aluminium: new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.38, metalness: 0.45 }),
  lip: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.3, metalness: 0.5 }),
  rail: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.45, metalness: 0.4 }),
  coil: new THREE.MeshStandardMaterial({ color: 0x5f666c, roughness: 0.7, metalness: 0.4 }),
  black: new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.6, metalness: 0.2 }),
  stud: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.25, metalness: 0.7 }),
};

export interface EvapModel {
  object: THREE.Object3D;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

/**
 * Build the n-fan evaporator, scaled so its fan circle is `fanDiameter` mm,
 * `depth` mm deep. Origin: centre of the housing (with the drain rail), local
 * +z out of the fan face (the way it blows).
 */
export function buildEvaporator(fans: number, fanDiameter: number, depth: number): EvapModel {
  const all = parse();
  const u = all.find((x) => x.fans === fans) ?? all[0];
  const k = fanDiameter / (2 * u.circles[0].r); // mm per SVG unit
  const D = depth / k;
  const geometries: THREE.BufferGeometry[] = [];
  const faceMats: THREE.Material[] = [];
  const root = new THREE.Group();
  const photoMat = new THREE.MeshStandardMaterial({ map: photoTexture(u.photo.href), roughness: 0.5, metalness: 0.1 });
  faceMats.push(photoMat);

  /** Box from an SVG rect, z0 → z1 (model y is −SVG y). */
  const box = (r: Rect, z0: number, z1: number, mat: THREE.Material) => {
    const g = new THREE.BoxGeometry(r.w, r.h, z1 - z0);
    g.translate(r.x + r.w / 2, -(r.y + r.h / 2), (z0 + z1) / 2);
    geometries.push(g);
    root.add(new THREE.Mesh(g, mat));
  };
  const front = D / 2;
  const back = -D / 2;
  const b = u.body;

  // Housing, coil at the back, top lip, drain rail (a touch deeper than the housing).
  box(b, back + 6, front, mats.aluminium);
  box({ x: b.x + 20, y: b.y + 30, w: b.w - 40, h: b.h - 50 }, back, back + 6, mats.coil);
  box(u.lip, back + 6, front + 3, mats.lip);
  box(u.rail, back, front + 4, mats.aluminium);
  // Side rails beside the fan panel, standing slightly proud.
  for (const r of u.sideRails) box(r, front, front + 5, mats.rail);
  // Hanger brackets on the face, with studs up through the top.
  for (const r of u.brackets) {
    box(r, front, front + 4, mats.lip);
    const g = new THREE.CylinderGeometry(5, 5, 40, 10);
    g.translate(r.x + r.w / 2, -b.y + 20, 0);
    geometries.push(g);
    root.add(new THREE.Mesh(g, mats.stud));
  }
  // Pipe stubs and flanges on both ends (black, round).
  for (const r of [...u.stubs, ...u.flanges]) {
    const g = new THREE.CylinderGeometry(r.h / 2, r.h / 2, r.w, 16);
    g.rotateZ(Math.PI / 2);
    g.translate(r.x + r.w / 2, -(r.y + r.h / 2), 0);
    geometries.push(g);
    root.add(new THREE.Mesh(g, mats.black));
  }
  // Fans: photo face (guard, blades, hub) with a black guard ring proud of it.
  for (const c of u.circles) {
    const guardR = c.r * 1.08;
    const face = new THREE.CircleGeometry(guardR, 48);
    face.translate(c.cx, -c.cy, front + 1);
    projectUV(face, u.photo);
    geometries.push(face);
    root.add(new THREE.Mesh(face, photoMat));
    const ring = new THREE.TorusGeometry(guardR, 6, 8, 48);
    ring.translate(c.cx, -c.cy, front + 4);
    geometries.push(ring);
    root.add(new THREE.Mesh(ring, mats.black));
  }
  // ICC badge, from the photo, at the right end of the face (measured on the artwork).
  const badge = new THREE.PlaneGeometry(85, 93);
  badge.translate(b.x + b.w - 87 + 42.5, -(908 + 46.5), front + 0.6);
  projectUV(badge, u.photo);
  geometries.push(badge);
  root.add(new THREE.Mesh(badge, photoMat));

  // Centre on the housing (body plus drain rail); scale to mm.
  const cx = b.x + b.w / 2;
  const cy = -(b.y + (b.h + u.rail.h) / 2);
  root.position.set(-cx * k, -cy * k, 0);
  root.scale.setScalar(k);
  const holder = new THREE.Group();
  holder.add(root);
  holder.traverse((o) => {
    o.castShadow = true;
    o.userData.shared = true;
  });
  return { object: holder, geometries, materials: faceMats };
}
