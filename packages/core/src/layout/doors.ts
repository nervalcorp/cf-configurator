/**
 * Door placement on walls. Pure functions over a Compartment.
 *
 * A door occupies an interval of its wall's inside run: the opening, plus its
 * frame or guides on both sides, plus slide travel on one side for sliding
 * doors. Two doors on one wall may not have overlapping intervals.
 */
import { type Compartment, type Door, LIMITS, newDoor } from '../config';
import { type DoorFamilyId, doorMount, doorSize, getDoorFamily } from '../catalog';
import { inToMm } from '../units';
import { footprint } from './shapes';
import { type WallFrame, findFrontEdge, wallFrames } from './walls';

export interface DoorSpan {
  /** Start and end of the space the door uses along the wall (inside run). */
  from: number;
  to: number;
}

/** Space the door uses on its wall, including frame and slide travel. */
export function doorSpan(d: Door, offset = d.offset): DoorSpan {
  const f = getDoorFamily(d.family);
  const { width } = doorSize(d);
  let left = f.side;
  let right = f.side;
  if (f.kind === 'slide') {
    // The leaf parks beside the opening in the direction it slides.
    if (d.hinge === 'left') left += width;
    else right += width;
  }
  return { from: offset - left, to: offset + width + right };
}

/** Smallest inside run a wall needs to hold this door at all. */
export function doorMinRun(d: Door): number {
  const s = doorSpan(d, 0);
  return s.to - s.from;
}

export function framesFor(c: Compartment): WallFrame[] {
  return wallFrames(footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD), c.wallThickness);
}

/** Lowest and highest offset that keep the door's span inside its wall. */
export function offsetRange(d: Door, wallLength: number): [number, number] {
  const s = doorSpan(d, 0);
  return [-s.from, wallLength - s.to];
}

/**
 * Glass units of the same height and lift can sit side by side with their
 * frames touching. Anything else keeps its side clearance plus the door gap.
 */
export function canTouch(a: Door, b: Door): boolean {
  if (a.family !== 'glass' || b.family !== 'glass') return false;
  const ha = doorSize(a).height;
  const hb = doorSize(b).height;
  return Math.abs(ha - hb) < 0.5 && Math.abs(a.elevation - b.elevation) < 0.5;
}

/** True when two doors on the same wall are too close (or overlap). */
export function doorsClash(a: Door, b: Door, aOffset = a.offset, bOffset = b.offset): boolean {
  if (canTouch(a, b)) {
    const wa = doorSize(a).width;
    const wb = doorSize(b).width;
    return aOffset < bOffset + wb - 0.5 && bOffset < aOffset + wa - 0.5;
  }
  const sa = doorSpan(a, aOffset);
  const sb = doorSpan(b, bOffset);
  return sa.from < sb.to + LIMITS.doorGap && sb.from < sa.to + LIMITS.doorGap;
}

/**
 * The hole a door needs in its wall, along the wall's inside run and up from
 * the floor. Frames, gaskets and guides are included.
 */
export function doorOpening(d: Door, wallH: number): { from: number; to: number; bottom: number; top: number } {
  const fam = getDoorFamily(d.family);
  const F = LIMITS.doorFrame;
  const { width, height } = doorSize(d);
  const x0 = d.offset;
  const x1 = d.offset + width;
  const mount = doorMount(d);
  if (mount === 'semi-buried') {
    return { from: x0 + SEMI_OVERLAP - SEMI_FRAME, to: x1 - SEMI_OVERLAP + SEMI_FRAME, bottom: 0, top: height - SEMI_OVERLAP + SEMI_FRAME };
  }
  if (mount === 'full-buried') return { from: x0 - GASKET - F, to: x1 + GASKET + F, bottom: 0, top: height + GASKET + F };
  if (fam.kind === 'rollup') return { from: x0 - F, to: x1 + F, bottom: 0, top: Math.min(height, wallH) };
  if (fam.kind === 'glass') return { from: x0, to: x1, bottom: d.elevation, top: d.elevation + height };
  return { from: x0 - F, to: x1 + F, bottom: 0, top: height + F };
}

/** Semi-buried doors sit on a 4.75" frame; the leaf laps 1.5" over it, leaving 3.25" showing. */
export const SEMI_FRAME = inToMm(4.75);
/** How far a semi-buried leaf laps over its opening (and onto the frame). */
export const SEMI_OVERLAP = inToMm(1.5);
/** Gasket line between a full-buried leaf and its frame. */
export const GASKET = 8;

/**
 * First offset (scanning left to right in 1" steps) where the door fits on the
 * wall without touching other doors. Prefers `near` when given.
 */
export function findFreeOffset(c: Compartment, door: Door, wall: number, near?: number): number | null {
  const frame = framesFor(c)[wall];
  if (!frame) return null;
  const [lo, hi] = offsetRange(door, frame.length);
  if (hi < lo) return null;
  const others = c.doors.filter((o) => o.id !== door.id && o.wall === wall);
  const free = (off: number) => others.every((o) => !doorsClash(door, o, off));
  // Whole-inch positions only, so offsets read cleanly in the panel.
  const step = 25.4;
  const candidates: number[] = [];
  for (let off = Math.ceil(lo / step - 1e-9) * step; off <= hi + 0.01; off += step) candidates.push(Math.min(off, hi));
  if (!candidates.length) candidates.push(lo);
  if (near !== undefined) candidates.sort((a, b) => Math.abs(a - near) - Math.abs(b - near));
  return candidates.find(free) ?? null;
}

function nextId(c: Compartment): string {
  const max = c.doors.reduce((m, d) => Math.max(m, Number(d.id.replace(/\D/g, '')) || 0), 0);
  return `d${max + 1}`;
}

/**
 * Add a door of the given type, on the front wall if it fits, else on any wall
 * that has room. Lands as close to `near` (an offset) as possible, else leftmost.
 */
export function addDoor(
  c: Compartment,
  family: DoorFamilyId = 'man',
  near?: number,
  extra: Partial<Door> = {},
): { compartment: Compartment; id: string | null } {
  const fp = footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);
  const front = findFrontEdge(fp);
  const id = nextId(c);
  const draft: Door = { ...newDoor(id, front, 0), ...extra, family };
  const order = [front, ...fp.map((_, i) => i).filter((i) => i !== front)];
  for (const wall of order) {
    const off = findFreeOffset(c, { ...draft, wall }, wall, near);
    if (off !== null) return { compartment: { ...c, doors: [...c.doors, { ...draft, wall, offset: off }] }, id };
  }
  return { compartment: c, id: null };
}

export function removeDoor(c: Compartment, id: string): Compartment {
  return { ...c, doors: c.doors.filter((d) => d.id !== id) };
}

export function updateDoor(c: Compartment, id: string, patch: Partial<Door>): Compartment {
  return { ...c, doors: c.doors.map((d) => (d.id === id ? { ...d, ...patch } : d)) };
}

/**
 * Move a door to a wall, landing as close to `near` as the wall allows.
 * Returns the compartment unchanged if the door does not fit there.
 */
export function moveDoor(c: Compartment, id: string, wall: number, near?: number): Compartment {
  const d = c.doors.find((x) => x.id === id);
  if (!d) return c;
  const off = findFreeOffset(c, { ...d, wall }, wall, near ?? d.offset);
  return off === null ? c : updateDoor(c, id, { wall, offset: off });
}

/**
 * Switch shape. Edge indices mean different walls on a different shape, so
 * every door goes back to the new front wall (then any wall with room), in order.
 */
export function setShape(c: Compartment, shape: Compartment['shape'], nw: number, nd: number): Compartment {
  let next: Compartment = { ...c, shape, notchW: nw, notchD: nd, doors: [] };
  for (const d of c.doors) {
    const placed = addDoor(next, d.family, d.offset, d);
    if (!placed.id) continue; // no room anywhere; dropped (rare: very small box with many doors)
    const seat = placed.compartment.doors.at(-1)!;
    next = updateDoor(placed.compartment, placed.id, { ...d, wall: seat.wall, offset: seat.offset });
  }
  return next;
}

/**
 * Slide a door toward `target` along its wall, stopping where it would clash
 * with another door or leave the wall. Used while dragging, so doors never
 * pass through each other: they stop where they touch.
 */
export function slideDoor(c: Compartment, id: string, target: number): Compartment {
  const d = c.doors.find((x) => x.id === id);
  const f = d && framesFor(c)[d.wall];
  if (!d || !f) return c;
  const [lo, hi] = offsetRange(d, f.length);
  const goal = Math.min(hi, Math.max(lo, Math.round(target / 25.4) * 25.4));
  const others = c.doors.filter((o) => o.id !== id && o.wall === d.wall);
  const step = goal > d.offset ? 25.4 : -25.4;
  let at = d.offset;
  // Walk an inch at a time from where the door is; stop before the first clash.
  for (let next = at + step; step > 0 ? next <= goal + 0.01 : next >= goal - 0.01; next += step) {
    if (others.some((o) => doorsClash(d, o, next))) break;
    at = next;
  }
  if (Math.abs(goal - at) < 25.4 && !others.some((o) => doorsClash(d, o, goal))) at = goal;
  return at === d.offset ? c : updateDoor(c, id, { offset: at });
}

/** True when every wall is still long enough for the doors on it, side by side. */
export function doorsFit(c: Compartment): boolean {
  const frames = framesFor(c);
  return frames.every((f) => {
    const on = c.doors.filter((d) => d.wall === f.edge);
    if (!on.length) return true;
    const need = on.reduce((s, d) => s + doorMinRun(d), 0) + LIMITS.doorGap * (on.length - 1);
    return f.length >= need - 0.01;
  });
}
