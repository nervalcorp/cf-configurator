/**
 * Several compartments on one site. Each keeps its own layout, finish, doors
 * and controller; they share the site type. Positions are the centre of each
 * footprint's bounding box, so a compartment can be placed beside another by
 * adding half of each one's size.
 */
import type { Compartment, Configuration } from './config';
import { type Polygon, type Vec2, bounds } from './geometry';
import { footprint } from './layout/shapes';

const nextId = (cfg: Configuration) => {
  const n = cfg.compartments.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, '')) || 0), 0);
  return `c${n + 1}`;
};
const nextName = (cfg: Configuration) => {
  const taken = new Set(cfg.compartments.map((c) => c.name));
  let n = cfg.compartments.length + 1;
  while (taken.has(`Compartment ${n}`)) n++;
  return `Compartment ${n}`;
};

/** Footprint of a compartment in site coordinates (mm). */
export function siteFootprint(c: Compartment): Vec2[] {
  const fp = footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);
  const b = bounds(fp);
  return fp.map(([x, y]) => [x - b.cx + c.position.x, y - b.cy + c.position.z]);
}

export type Side = 'left' | 'right' | 'behind' | 'front';

/** Position that puts `c` touching `ref` on the given side, centred on it. */
export function besidePosition(c: Compartment, ref: Compartment, side: Side): { x: number; z: number } {
  const { x, z } = ref.position;
  switch (side) {
    case 'right':
      return { x: x + ref.boxW / 2 + c.boxW / 2, z };
    case 'left':
      return { x: x - ref.boxW / 2 - c.boxW / 2, z };
    case 'behind':
      return { x, z: z - ref.boxD / 2 - c.boxD / 2 };
    case 'front':
      return { x, z: z + ref.boxD / 2 + c.boxD / 2 };
  }
}

/** Right of everything already on the site, touching, lined up with the first compartment's front. */
function placeAtRight(cfg: Configuration, c: Compartment): { x: number; z: number } {
  let right = -Infinity;
  let ref = cfg.compartments[0];
  for (const o of cfg.compartments) {
    const r = o.position.x + o.boxW / 2;
    if (r > right) {
      right = r;
      ref = o;
    }
  }
  if (!ref) return { x: 0, z: 0 };
  // Keep fronts in line.
  const front = ref.position.z + ref.boxD / 2;
  return { x: right + c.boxW / 2, z: front - c.boxD / 2 };
}

export function addCompartment(cfg: Configuration, make: (id: string, name: string) => Compartment): { config: Configuration; id: string } {
  const id = nextId(cfg);
  const c = make(id, nextName(cfg));
  const placed = { ...c, position: placeAtRight(cfg, c) };
  return { config: { ...cfg, compartments: [...cfg.compartments, placed] }, id };
}

/** Copy a compartment (doors, finish, controller and all) and place it to the right. */
export function duplicateCompartment(cfg: Configuration, sourceId: string): { config: Configuration; id: string } {
  const src = cfg.compartments.find((c) => c.id === sourceId);
  if (!src) return { config: cfg, id: sourceId };
  const copy = (id: string, name: string): Compartment => ({
    ...(JSON.parse(JSON.stringify(src)) as Compartment),
    id,
    name: `${src.name} copy`.length > 40 ? name : `${src.name} copy`,
  });
  return addCompartment(cfg, copy);
}

export function removeCompartment(cfg: Configuration, id: string): Configuration {
  if (cfg.compartments.length <= 1) return cfg;
  return { ...cfg, compartments: cfg.compartments.filter((c) => c.id !== id) };
}

/** Edges cross or one footprint lies inside the other. Touching edges are fine. */
export function footprintsOverlap(a: Polygon, b: Polygon): boolean {
  const ba = bounds(a);
  const bb = bounds(b);
  if (ba.maxX <= bb.minX + 0.5 || bb.maxX <= ba.minX + 0.5 || ba.maxY <= bb.minY + 0.5 || bb.maxY <= ba.minY + 0.5) return false;
  const inside = (poly: Polygon, [x, y]: Vec2) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  // Probe points a hair inside each footprint, near every edge midpoint and corner.
  const probes = (poly: Polygon): Vec2[] => {
    const b = bounds(poly);
    const out: Vec2[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      for (const t of [0.02, 0.5, 0.98]) {
        const m: Vec2 = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        const toward: Vec2 = [Math.sign(b.cx - m[0]) * 2, Math.sign(b.cy - m[1]) * 2];
        for (const d of [[toward[0], 0], [0, toward[1]], toward] as Vec2[]) {
          const pt: Vec2 = [m[0] + d[0], m[1] + d[1]];
          if (inside(poly, pt)) out.push(pt);
        }
      }
    }
    out.push([b.cx, b.cy]);
    return out.filter((pt) => inside(poly, pt));
  };
  return probes(a).some((p) => inside(b, p)) || probes(b).some((p) => inside(a, p));
}

/** Pairs of compartment ids whose footprints overlap. */
export function overlappingCompartments(cfg: Configuration): [string, string][] {
  const fps = cfg.compartments.map((c) => [c.id, siteFootprint(c)] as const);
  const out: [string, string][] = [];
  for (let i = 0; i < fps.length; i++) {
    for (let j = i + 1; j < fps.length; j++) {
      if (footprintsOverlap(fps[i][1], fps[j][1])) out.push([fps[i][0], fps[j][0]]);
    }
  }
  return out;
}

/**
 * Where a resized compartment should sit. With other compartments on the site
 * it grows away from its nearest neighbour on each axis: the edge facing that
 * neighbour stays put. Alone (or with nobody in line on an axis) it grows from
 * its centre.
 */
export function resizedPosition(cfg: Configuration, before: Compartment, after: Compartment): { x: number; z: number } {
  let { x, z } = after.position;
  const others = cfg.compartments.filter((o) => o.id !== before.id);
  if (!others.length) return { x, z };
  const ext = (c: Compartment) => ({
    left: c.position.x - c.boxW / 2,
    right: c.position.x + c.boxW / 2,
    back: c.position.z - c.boxD / 2,
    front: c.position.z + c.boxD / 2,
  });
  const me = ext(before);
  if (Math.abs(after.boxW - before.boxW) > 0.01) {
    // Neighbours in line along x: their depth range overlaps ours.
    const inLine = others.map(ext).filter((o) => o.back < me.front - 1 && me.back < o.front - 1);
    const gapRight = Math.min(...inLine.filter((o) => o.left >= me.right - 1).map((o) => o.left - me.right), Infinity);
    const gapLeft = Math.min(...inLine.filter((o) => o.right <= me.left + 1).map((o) => me.left - o.right), Infinity);
    if (gapRight < Infinity || gapLeft < Infinity) {
      x = gapRight <= gapLeft ? me.right - after.boxW / 2 : me.left + after.boxW / 2;
    }
  }
  if (Math.abs(after.boxD - before.boxD) > 0.01) {
    const inLine = others.map(ext).filter((o) => o.left < me.right - 1 && me.left < o.right - 1);
    const gapFront = Math.min(...inLine.filter((o) => o.back >= me.front - 1).map((o) => o.back - me.front), Infinity);
    const gapBack = Math.min(...inLine.filter((o) => o.front <= me.back + 1).map((o) => me.back - o.front), Infinity);
    if (gapFront < Infinity || gapBack < Infinity) {
      z = gapFront <= gapBack ? me.front - after.boxD / 2 : me.back + after.boxD / 2;
    }
  }
  return { x, z };
}
