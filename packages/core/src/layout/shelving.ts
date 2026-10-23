/**
 * Heavy duty shelving inside a compartment: placement, the auto-place behind
 * glass doors, the space a unit takes, and the parts it is built from.
 */
import type { Compartment, Facing, ShelvingUnit } from '../config';
import { SHELVING, doorSize, getGlassSeries, GLASS_FRAME } from '../catalog';
import { type Vec2, bounds, offsetPolygon } from '../geometry';
import { footprint } from './shapes';
import { framesFor } from './doors';

const P = SHELVING.post;
/** Post spacing along the run: one shelf width plus one post. */
export const BAY_PITCH = SHELVING.shelfWidth + P;

export function shelvingSize(u: Pick<ShelvingUnit, 'bays'>): { width: number; depth: number } {
  return { width: u.bays * BAY_PITCH + P, depth: SHELVING.shelfDepth + P };
}

/** Unit vector the shelves face (toward the customer side), in floor-plan coordinates. */
export function facingVector(f: Facing): Vec2 {
  return f === 0 ? [0, 1] : f === 90 ? [1, 0] : f === 180 ? [0, -1] : [-1, 0];
}

/** Footprint rectangle in floor-plan coordinates (axis aligned, since facings are right angles). */
export function shelvingRect(u: ShelvingUnit): { minX: number; maxX: number; minY: number; maxY: number } {
  const { width, depth } = shelvingSize(u);
  const along = u.facing === 0 || u.facing === 180;
  const hw = (along ? width : depth) / 2;
  const hd = (along ? depth : width) / 2;
  return { minX: u.x - hw, maxX: u.x + hw, minY: u.y - hd, maxY: u.y + hd };
}

/** Corners of a unit in floor-plan coordinates, for drawing. */
export function shelvingCorners(u: ShelvingUnit): Vec2[] {
  const r = shelvingRect(u);
  return [[r.minX, r.minY], [r.maxX, r.minY], [r.maxX, r.maxY], [r.minX, r.maxY]];
}

function insidePoly(poly: Vec2[], [x, y]: Vec2) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Why a unit can't stand where it is, or null. */
export function shelvingBlocker(c: Compartment, u: ShelvingUnit): string | null {
  const fp = footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);
  const inner = offsetPolygon(fp, -c.wallThickness);
  const r = shelvingRect(u);
  const pts: Vec2[] = [];
  for (const fx of [0, 0.25, 0.5, 0.75, 1]) {
    for (const fy of [0, 0.5, 1]) pts.push([r.minX + (r.maxX - r.minX) * fx + (fx === 0 ? 1 : fx === 1 ? -1 : 0), r.minY + (r.maxY - r.minY) * fy + (fy === 0 ? 1 : fy === 1 ? -1 : 0)]);
  }
  if (!pts.every((p) => insidePoly(inner, p))) return 'outside the compartment';
  // A notch corner poking into the unit
  if (inner.some(([x, y]) => x > r.minX + 1 && x < r.maxX - 1 && y > r.minY + 1 && y < r.maxY - 1)) return 'outside the compartment';
  if (u.postHeight > c.height + 0.5) return 'taller than the walls';
  for (const o of c.accessories.shelving) {
    if (o.id === u.id) continue;
    const q = shelvingRect(o);
    if (r.minX < q.maxX - 0.5 && q.minX < r.maxX - 0.5 && r.minY < q.maxY - 0.5 && q.minY < r.maxY - 0.5) return 'overlapping other shelving';
  }
  return null;
}

const nextId = (c: Compartment) => {
  const n = c.accessories.shelving.reduce((m, u) => Math.max(m, Number(u.id.replace(/\D/g, '')) || 0), 0);
  return `sh${n + 1}`;
};

/**
 * A new unit behind the glass door unit nearest the middle of the compartment
 * that has no shelving yet: one bay per glass door, shelves facing the glass,
 * shelf levels lined up with the door opening. Without glass doors it goes
 * against the back wall. Gap between the shelves and the wall: 3".
 */
export function addShelving(c: Compartment): { compartment: Compartment; id: string } {
  const id = nextId(c);
  const fp = footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);
  const b = bounds(fp);
  const frames = framesFor(c);
  const gap = 76.2;
  const postHeight = Math.min(SHELVING.defaultHeight, c.height - 50);
  const { depth } = shelvingSize({ bays: 1 });
  const taken = (gx: number, gy: number) =>
    c.accessories.shelving.some((u) => {
      const r = shelvingRect(u);
      return gx > r.minX && gx < r.maxX && gy > r.minY && gy < r.maxY;
    });

  const glass = c.doors
    .filter((d) => d.family === 'glass' && frames[d.wall])
    .map((d) => {
      const f = frames[d.wall];
      const w = doorSize(d).width;
      const mid = d.offset + w / 2;
      // Point just inside the glass, then step in by the gap and half a unit depth.
      const into = gap + depth / 2;
      const px = f.origin[0] + f.u[0] * mid - f.n[0] * into;
      const py = f.origin[1] + f.u[1] * mid - f.n[1] * into;
      return { d, f, px, py, dist: Math.hypot(px - b.cx, py - b.cy) };
    })
    .filter((g) => !taken(g.px, g.py))
    .sort((a, b2) => a.dist - b2.dist);

  let unit: ShelvingUnit;
  if (glass.length) {
    const { d, f, px, py } = glass[0];
    const s = getGlassSeries(d.glass.series);
    const facing = (f.n[1] > 0.5 ? 0 : f.n[0] > 0.5 ? 90 : f.n[1] < -0.5 ? 180 : 270) as Facing;
    unit = {
      id,
      x: px,
      y: py,
      facing,
      bays: d.glass.count,
      levels: SHELVING.levels,
      bottom: d.elevation + GLASS_FRAME + 100,
      top: d.elevation + GLASS_FRAME + s.doorHeight - 250,
      postHeight,
      gravity: [],
    };
  } else {
    const back = frames.find((f) => f.n[1] < -0.5) ?? frames[0];
    const mid = back.length / 2;
    unit = {
      id,
      x: back.origin[0] + back.u[0] * mid - back.n[0] * (gap + depth / 2),
      y: back.origin[1] + back.u[1] * mid - back.n[1] * (gap + depth / 2),
      facing: 0,
      bays: 2,
      levels: SHELVING.levels,
      bottom: 150,
      top: postHeight - 300,
      postHeight,
      gravity: [],
    };
  }
  return { compartment: { ...c, accessories: { ...c.accessories, shelving: [...c.accessories.shelving, unit] } }, id };
}

export function updateShelving(c: Compartment, id: string, patch: Partial<ShelvingUnit>): Compartment {
  return { ...c, accessories: { ...c.accessories, shelving: c.accessories.shelving.map((u) => (u.id === id ? { ...u, ...patch } : u)) } };
}

export function removeShelving(c: Compartment, id: string): Compartment {
  return { ...c, accessories: { ...c.accessories, shelving: c.accessories.shelving.filter((u) => u.id !== id) } };
}

/** Shelf heights from the floor, evenly spaced between the lowest and highest shelf. */
export function shelfHeights(u: ShelvingUnit): number[] {
  if (u.levels <= 1) return [u.bottom];
  const step = (u.top - u.bottom) / (u.levels - 1);
  return Array.from({ length: u.levels }, (_, i) => u.bottom + i * step);
}

export const gravityKey = (bay: number, level: number) => `${bay}:${level}`;

export function toggleGravity(c: Compartment, id: string, bay: number, level: number): Compartment {
  const u = c.accessories.shelving.find((x) => x.id === id);
  if (!u) return c;
  const k = gravityKey(bay, level);
  const gravity = u.gravity.includes(k) ? u.gravity.filter((g) => g !== k) : [...u.gravity, k];
  return updateShelving(c, id, { gravity });
}

/** Turn the unit a quarter turn clockwise (seen from above) about its centre. */
export function rotateShelving(c: Compartment, id: string): Compartment {
  const u = c.accessories.shelving.find((x) => x.id === id);
  if (!u) return c;
  return updateShelving(c, id, { facing: (((u.facing + 90) % 360) as Facing) });
}
