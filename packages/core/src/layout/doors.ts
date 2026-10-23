/**
 * Door placement on walls. Pure functions over a Compartment.
 *
 * A door occupies an interval of its wall's inside run: the opening, plus its
 * frame or guides on both sides, plus slide travel on one side for sliding
 * doors. Two doors on one wall may not have overlapping intervals.
 */
import { type Compartment, type Door, LIMITS, newDoor } from '../config';
import { type DoorFamilyId, doorSize, getDoorFamily } from '../catalog';
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

const overlaps = (a: DoorSpan, b: DoorSpan) => a.from < b.to + LIMITS.doorGap && b.from < a.to + LIMITS.doorGap;

/**
 * First offset (scanning left to right in 1" steps) where the door fits on the
 * wall without touching other doors. Prefers `near` when given.
 */
export function findFreeOffset(c: Compartment, door: Door, wall: number, near?: number): number | null {
  const frame = framesFor(c)[wall];
  if (!frame) return null;
  const [lo, hi] = offsetRange(door, frame.length);
  if (hi < lo) return null;
  const others = c.doors.filter((o) => o.id !== door.id && o.wall === wall).map((o) => doorSpan(o));
  const free = (off: number) => {
    const s = doorSpan(door, off);
    return others.every((o) => !overlaps(s, o));
  };
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
