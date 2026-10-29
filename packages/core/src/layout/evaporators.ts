/**
 * Evaporators at the ceiling: where a unit sits, how far it throws, which
 * placement rules it breaks, and the suggested layout for a room.
 *
 * Rules of thumb encoded here (EVAP_RULES): never over a door; rear gap at
 * least the coil height and never under 12"; one unit throws about 25' and
 * covers about 15' of width; keep product 12" clear. The rules decide how many
 * units and where; the customer picks the model.
 *
 * Coordinates are floor-plan mm (x right, y toward the front), like shelving.
 */
import type { Compartment, Evaporator } from '../config';
import { EVAP_RULES, getEvaporator } from '../catalog';
import { type Vec2, offsetPolygon } from '../geometry';
import { footprint } from './shapes';
import { type WallFrame, findFrontEdge, wallFrames } from './walls';
import { doorOpening } from './doors';
import { shelvingRect } from './shelving';

export const requiredGap = (model: string) => Math.max(EVAP_RULES.minRearGap, getEvaporator(model).height);

const fpOf = (c: Compartment) => footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);
const framesOf = (c: Compartment) => wallFrames(fpOf(c), c.wallThickness);
const innerOf = (c: Compartment) => offsetPolygon(fpOf(c), -c.wallThickness);

/** Plan geometry of a unit: centre, corners, the direction it blows, and its front-centre. */
export function evaporatorPlan(c: Compartment, e: Evaporator, f: WallFrame = framesOf(c)[e.wall]) {
  const def = getEvaporator(e.model);
  const into: Vec2 = [-f.n[0], -f.n[1]]; // blows away from its wall
  // The frame origin is on the inside face of the wall.
  const back: Vec2 = [f.origin[0] + f.u[0] * e.offset + into[0] * e.gap, f.origin[1] + f.u[1] * e.offset + into[1] * e.gap];
  const center: Vec2 = [back[0] + into[0] * (def.depth / 2), back[1] + into[1] * (def.depth / 2)];
  const front: Vec2 = [back[0] + into[0] * def.depth, back[1] + into[1] * def.depth];
  const hl = def.length / 2;
  const corners: Vec2[] = [
    [back[0] - f.u[0] * hl, back[1] - f.u[1] * hl],
    [back[0] + f.u[0] * hl, back[1] + f.u[1] * hl],
    [front[0] + f.u[0] * hl, front[1] + f.u[1] * hl],
    [front[0] - f.u[0] * hl, front[1] - f.u[1] * hl],
  ];
  return { def, center, front, into, corners, frame: f };
}

/** Distance from a point along a direction to the first inside wall face. */
export function rayToWall(inner: Vec2[], p: Vec2, d: Vec2): number {
  let best = Infinity;
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i];
    const b = inner[(i + 1) % inner.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
    const s = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den;
    if (t > 1 && s >= -1e-6 && s <= 1 + 1e-6) best = Math.min(best, t);
  }
  return best;
}

/** How far a unit's air has to travel: from its front to the wall it blows at. */
export function evaporatorThrow(c: Compartment, e: Evaporator): number {
  const p = evaporatorPlan(c, e);
  return rayToWall(innerOf(c), p.front, p.into);
}

/** Wall spans that are door openings (plus the margin), along each wall. */
function doorSpans(c: Compartment, wall: number): [number, number][] {
  return c.doors
    .filter((d) => d.wall === wall)
    .map((d) => {
      const o = doorOpening(d, c.height);
      return [o.from - EVAP_RULES.doorMargin, o.to + EVAP_RULES.doorMargin] as [number, number];
    });
}

function insidePoly(poly: Vec2[], [x, y]: Vec2) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface EvapCheck {
  errors: string[];
  warnings: string[];
}

/** Rule check for one unit. */
export function checkEvaporator(c: Compartment, e: Evaporator): EvapCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const f = framesOf(c)[e.wall];
  if (!f) return { errors: ['is not on a wall'], warnings };
  const p = evaporatorPlan(c, e, f);
  const def = p.def;
  const inch = (mm: number) => `${Math.round(mm / 25.4)}"`;
  const ft = (mm: number) => `${Math.round(mm / 304.8)}'`;

  // Never over a door (on its wall, within the unit's length plus a margin).
  const a0 = e.offset - def.length / 2;
  const a1 = e.offset + def.length / 2;
  if (doorSpans(c, e.wall).some(([s0, s1]) => a0 < s1 && s0 < a1)) {
    errors.push('is over a door. Warm air from the door would ice the coil; move it to another wall or along this one');
  }
  if (a0 < -0.5 || a1 > f.length + 0.5) errors.push('runs past the end of its wall');
  const need = requiredGap(e.model);
  if (e.gap < need - 0.5) errors.push(`needs ${inch(need)} behind it for return air (the coil height, at least 12"); it has ${inch(e.gap)}`);
  // The whole unit inside the room
  const inner = innerOf(c);
  if (!p.corners.every((q) => insidePoly(inner, q))) errors.push('is outside the room');
  // Throw
  const t = evaporatorThrow(c, e);
  if (t > EVAP_RULES.throwMax) {
    errors.push(`would have to throw ${ft(t)}; one unit reaches about 25'. Add a unit facing back from the far wall, or use Suggest layout`);
  } else if (t > EVAP_RULES.throwComfort) {
    warnings.push(`throws ${ft(t)}, near the 25' limit`);
  }
  // Width coverage on this wall
  const onWall = c.evaporators.filter((x) => x.wall === e.wall).length;
  if (f.length / onWall > EVAP_RULES.coverWidth + 1) {
    warnings.push(`covers about 15' of width; wall ${f.letter} is ${ft(f.length)} with ${onWall} unit${onWall === 1 ? '' : 's'}. Add units or use Suggest layout`);
  }
  // Headroom under the unit
  const bottom = c.height - EVAP_RULES.ceilingGap - def.height;
  if (bottom < 1981) warnings.push(`hangs down to ${inch(bottom)}; that is low for walking under`);
  // Product clear of the unit: shelving in the 12" in front of it, reaching up close
  for (const u of c.accessories.shelving) {
    const r = shelvingRect(u);
    const zone = [...p.corners, [p.front[0] + p.into[0] * EVAP_RULES.productClear, p.front[1] + p.into[1] * EVAP_RULES.productClear] as Vec2];
    const xs = zone.map((q) => q[0]);
    const ys = zone.map((q) => q[1]);
    const near = Math.min(...xs) < r.maxX && r.minX < Math.max(...xs) && Math.min(...ys) < r.maxY && r.minY < Math.max(...ys);
    if (near && u.postHeight > bottom - EVAP_RULES.productClear) {
      errors.push(`has shelving ${u.id.replace('sh', 'S')} within 12" of it. Keep product clear so air can get through`);
    }
  }
  // Two units blowing straight at each other in a short room
  for (const o of c.evaporators) {
    if (o.id === e.id) continue;
    const q = evaporatorPlan(c, o);
    const facing = p.into[0] * q.into[0] + p.into[1] * q.into[1] < -0.9;
    if (!facing) continue;
    const lateral = Math.abs((q.center[0] - p.center[0]) * f.u[0] + (q.center[1] - p.center[1]) * f.u[1]);
    if (lateral < def.length && t <= EVAP_RULES.throwMax) warnings.push(`blows straight at ${o.id.replace('ev', 'E')}; in a room this size they fight each other`);
  }
  // Overlap with another unit
  for (const o of c.evaporators) {
    if (o.id === e.id) continue;
    const q = evaporatorPlan(c, o);
    const bx = (pts: Vec2[]) => [Math.min(...pts.map((v) => v[0])), Math.max(...pts.map((v) => v[0])), Math.min(...pts.map((v) => v[1])), Math.max(...pts.map((v) => v[1]))];
    const [ax0, ax1, ay0, ay1] = bx(p.corners);
    const [bx0, bx1, by0, by1] = bx(q.corners);
    if (ax0 < bx1 - 1 && bx0 < ax1 - 1 && ay0 < by1 - 1 && by0 < ay1 - 1) errors.push(`overlaps ${o.id.replace('ev', 'E')}`);
  }
  return { errors, warnings };
}

// ── Coverage and the suggested layout ──

interface Cell {
  p: Vec2;
}

/** Floor grid (1 ft) of points inside the room. */
function cells(c: Compartment): Cell[] {
  const inner = innerOf(c);
  const xs = inner.map((q) => q[0]);
  const ys = inner.map((q) => q[1]);
  const step = 304.8;
  const out: Cell[] = [];
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
    for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) if (insidePoly(inner, [x, y])) out.push({ p: [x, y] });
  }
  return out;
}

/**
 * Cells a unit's air reaches when planning: 15' wide and up to the comfortable
 * 20' (or the far wall), straight out from it. Planning at 20' rather than the
 * 25' limit matches the rule of thumb that rooms over 20' long take two units.
 */
function reach(c: Compartment, e: Evaporator, grid: Cell[], inner: Vec2[]): boolean[] {
  const p = evaporatorPlan(c, e);
  const t = Math.min(EVAP_RULES.throwComfort, rayToWall(inner, p.front, p.into));
  const u = p.frame.u;
  return grid.map(({ p: q }) => {
    const dx = q[0] - p.front[0];
    const dy = q[1] - p.front[1];
    const along = dx * p.into[0] + dy * p.into[1];
    const side = dx * u[0] + dy * u[1];
    // Behind the unit (back to its wall) counts too: that is where the air returns.
    return along >= -(p.def.depth + e.gap + 1) && along <= t && Math.abs(side) <= EVAP_RULES.coverWidth / 2;
  });
}

/** Share of the floor the units' air reaches (0-1). */
export function evaporatorCoverage(c: Compartment, list: Evaporator[] = c.evaporators): number {
  const grid = cells(c);
  if (!grid.length) return 1;
  const inner = innerOf(c);
  const hit = new Array(grid.length).fill(false);
  for (const e of list) reach(c, e, grid, inner).forEach((h, i) => h && (hit[i] = true));
  return hit.filter(Boolean).length / grid.length;
}

const nextId = (list: Evaporator[]) => `ev${list.reduce((m, e) => Math.max(m, Number(e.id.replace(/\D/g, '')) || 0), 0) + 1}`;

/** Main door: the first walk-through door, else any door. */
function mainDoorWall(c: Compartment, frames: WallFrame[]): WallFrame | null {
  const d = c.doors.find((x) => x.family !== 'glass') ?? c.doors[0];
  return d ? frames[d.wall] ?? null : frames[findFrontEdge(fpOf(c))] ?? null;
}

/**
 * Best place for one more unit, given the ones already there: the spot whose
 * air reaches the most floor not yet reached, preferring walls that face the
 * main door (so the unit blows toward it). Spots over doors, without room for
 * the rear gap, or overlapping other units are skipped.
 */
function bestSpot(c: Compartment, existing: Evaporator[], model: string, grid: Cell[], covered: boolean[]): Evaporator | null {
  const frames = framesOf(c);
  const inner = innerOf(c);
  const def = getEvaporator(model);
  const gap = requiredGap(model);
  const door = mainDoorWall(c, frames);
  let best: { e: Evaporator; score: number } | null = null;
  const id = nextId(existing);
  for (const f of frames) {
    if (f.length < def.length) continue;
    // Facing the main door's wall: their normals point opposite ways.
    const facesDoor = door ? f.n[0] * door.n[0] + f.n[1] * door.n[1] < -0.9 : false;
    const step = 152.4;
    for (let off = def.length / 2; off <= f.length - def.length / 2 + 0.01; off += step) {
      const e: Evaporator = { id, model, wall: f.edge, offset: off, gap };
      const trial = { ...c, evaporators: [...existing, e] };
      const chk = checkEvaporator(trial, e);
      if (chk.errors.some((m) => /over a door|outside the room|overlaps|past the end/.test(m))) continue;
      const r = reach(c, e, grid, inner);
      let gain = 0;
      r.forEach((h, i) => h && !covered[i] && gain++);
      // Never suggest a spot that would throw past the 25' limit.
      const t = rayToWall(inner, evaporatorPlan(c, e, f).front, [-f.n[0], -f.n[1]]);
      if (t > EVAP_RULES.throwMax) continue;
      // Prefer: blowing toward the door, centred on its wall.
      const centred = 1 - Math.abs(off - f.length / 2) / f.length;
      const score = gain * (facesDoor ? 1.15 : 1) + centred * 2;
      if (!best || score > best.score) best = { e, score };
    }
  }
  return best && best.score > 0 ? best.e : null;
}

/** One more unit in the best open spot (the "Add evaporator" button). */
export function addEvaporator(c: Compartment, model?: string): { compartment: Compartment; id: string | null } {
  const m = model ?? defaultModel(c);
  const grid = cells(c);
  const inner = innerOf(c);
  const covered = new Array(grid.length).fill(false);
  for (const e of c.evaporators) reach(c, e, grid, inner).forEach((h, i) => h && (covered[i] = true));
  const spot = bestSpot(c, c.evaporators, m, grid, covered);
  if (!spot) return { compartment: c, id: null };
  return { compartment: { ...c, evaporators: [...c.evaporators, spot] }, id: spot.id };
}

/**
 * The suggested layout (the "Suggest layout" button): add units one at a time
 * where they reach the most uncovered floor until about all of it is reached,
 * then even out units sharing a wall into equal sections. Handles long rooms
 * (a second unit from the far wall), wide walls (units side by side) and
 * L-shaped rooms (a unit for the leg). Keeps the model already in use.
 */
export function suggestEvaporators(c: Compartment): { compartment: Compartment; count: number; coverage: number } {
  const model = c.evaporators[0]?.model ?? defaultModel(c);
  const grid = cells(c);
  const inner = innerOf(c);
  const covered = new Array(grid.length).fill(false);
  let list: Evaporator[] = [];
  for (let k = 0; k < 8; k++) {
    if (covered.filter(Boolean).length >= grid.length * 0.97) break;
    const spot = bestSpot({ ...c, evaporators: list }, list, model, grid, covered);
    if (!spot) break;
    list = [...list, spot];
    reach(c, spot, grid, inner).forEach((h, i) => h && (covered[i] = true));
  }
  list = evenOut(c, list);
  // Drop any unit the others already cover once evenly spaced (greedy order can over-add).
  const target = Math.min(0.97, evaporatorCoverage(c, list) - 0.005);
  for (const e of [...list].reverse()) {
    if (list.length <= 1) break;
    const without = evenOut(c, list.filter((x) => x.id !== e.id));
    if (evaporatorCoverage(c, without) >= target && without.every((x) => !checkEvaporator({ ...c, evaporators: without }, x).errors.length)) list = without;
  }
  list = list.map((e, i) => ({ ...e, id: `ev${i + 1}` }));
  const next = { ...c, evaporators: list };
  return { compartment: next, count: list.length, coverage: evaporatorCoverage(next) };
}

/** Units sharing a wall, centred each in an equal section of it (when that breaks no rule). */
function evenOut(c: Compartment, list: Evaporator[]): Evaporator[] {
  const frames = framesOf(c);
  const byWall = new Map<number, Evaporator[]>();
  list.forEach((e) => byWall.set(e.wall, [...(byWall.get(e.wall) ?? []), e]));
  let out = list;
  for (const [wall, group] of byWall) {
    if (group.length < 2) continue; // a lone unit stays where it does the most good
    const f = frames[wall];
    const even = [...group].sort((a, b) => a.offset - b.offset).map((e, i) => ({ ...e, offset: ((i + 0.5) * f.length) / group.length }));
    const trial = out.map((e) => even.find((x) => x.id === e.id) ?? e);
    if (even.every((e) => !checkEvaporator({ ...c, evaporators: trial }, e).errors.length)) out = trial;
  }
  return out;
}

export function defaultModel(c: Compartment): string {
  return c.temperature === 'freezer' ? 'ICC-EVF1500' : 'ICC-EVC1500';
}

export function updateEvaporator(c: Compartment, id: string, patch: Partial<Evaporator>): Compartment {
  return { ...c, evaporators: c.evaporators.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

export function removeEvaporator(c: Compartment, id: string): Compartment {
  return { ...c, evaporators: c.evaporators.filter((e) => e.id !== id) };
}
