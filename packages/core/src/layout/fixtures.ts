/**
 * Things mounted on the outside of the walls that are not doors: checker
 * plate squares and the controller. Both work in a wall's frame (u along the
 * inside run from its left end, v up from the floor).
 */
import type { CheckerSquare, Compartment, Door } from '../config';
import { CHECKER_PLATE, CONTROL_HEIGHT, getControl, doorSize } from '../catalog';
import { doorOpening, doorSpan, framesFor } from './doors';
import type { Opening } from './build';

const S = CHECKER_PLATE.size;

/** Openings of the doors and glass units on a wall. */
export function wallOpenings(c: Compartment, wall: number): (Opening & { doorId: string })[] {
  return c.doors.filter((d) => d.wall === wall).map((d) => ({ ...doorOpening(d, c.height), doorId: d.id }));
}

const intersects = (a: Opening, b: Opening, pad = 1) =>
  a.from < b.to - pad && b.from < a.to - pad && a.bottom < b.top - pad && b.bottom < a.top - pad;

/** Columns and rows of whole 1-ft squares that fit on a wall. */
export function checkerGrid(c: Compartment, wall: number): { cols: number; rows: number } {
  const f = framesFor(c)[wall];
  if (!f) return { cols: 0, rows: 0 };
  return { cols: Math.floor(f.length / S + 1e-6), rows: Math.floor(c.height / S + 1e-6) };
}

export const squareRect = (q: CheckerSquare): Opening => ({ from: q.col * S, to: (q.col + 1) * S, bottom: q.row * S, top: (q.row + 1) * S });

/** Why a square can't go there, or null if it can. */
export function squareBlocker(c: Compartment, q: CheckerSquare): string | null {
  const { cols, rows } = checkerGrid(c, q.wall);
  if (q.col < 0 || q.row < 0 || q.col >= cols || q.row >= rows) return 'off the wall';
  const r = squareRect(q);
  if (wallOpenings(c, q.wall).some((o) => intersects(r, o))) return 'over a door opening';
  const ctl = controlRect(c);
  if (ctl && ctl.wall === q.wall && intersects(r, ctl)) return 'over the controller';
  return null;
}

const key = (q: CheckerSquare) => `${q.wall}:${q.col}:${q.row}`;

/** Add or remove one square. Squares that would be blocked are not added. */
export function toggleSquare(c: Compartment, q: CheckerSquare): Compartment {
  const list = c.accessories.checker;
  const has = list.some((x) => key(x) === key(q));
  if (!has && squareBlocker(c, q)) return c;
  const checker = has ? list.filter((x) => key(x) !== key(q)) : [...list, q];
  return { ...c, accessories: { ...c.accessories, checker } };
}

/** Set squares on or off in bulk (a painted stroke). Blocked squares are skipped. */
export function paintSquares(c: Compartment, qs: CheckerSquare[], on: boolean): Compartment {
  const map = new Map(c.accessories.checker.map((q) => [key(q), q]));
  for (const q of qs) {
    if (on && !squareBlocker(c, q)) map.set(key(q), q);
    if (!on) map.delete(key(q));
  }
  return { ...c, accessories: { ...c.accessories, checker: [...map.values()] } };
}

/**
 * Squares that fill the space under a raised glass unit: whole squares below
 * its bottom, across every column it covers.
 */
export function squaresBelow(c: Compartment, d: Door): CheckerSquare[] {
  if (d.elevation < S - 0.5) return [];
  const w = doorSize(d).width;
  const c0 = Math.floor(d.offset / S);
  const c1 = Math.ceil((d.offset + w) / S) - 1;
  const r1 = Math.floor(d.elevation / S + 1e-6) - 1;
  const out: CheckerSquare[] = [];
  for (let col = c0; col <= c1; col++) for (let row = 0; row <= r1; row++) out.push({ wall: d.wall, col, row });
  return out.filter((q) => !squareBlocker(c, q));
}

/** Controller face on its wall, or null when there is none. */
export function controlRect(c: Compartment): (Opening & { wall: number }) | null {
  const def = getControl(c.control.model);
  if (!def) return null;
  const { offset, height, wall } = c.control;
  return { wall, from: offset - def.width / 2, to: offset + def.width / 2, bottom: height - def.height / 2 - (def.tail ?? 0), top: height + def.height / 2 };
}

/**
 * Starting place for the controller: beside the first door on its latch side
 * (the side people reach for), 4" clear of the door's hardware, at eye level.
 * Falls back to the other side, then the middle of the front wall.
 */
export function defaultControlPlacement(c: Compartment): Compartment['control'] {
  const def = getControl(c.control.model === 'none' ? 'TSC2000' : c.control.model)!;
  const frames = framesFor(c);
  const half = def.width / 2;
  const clear = 101.6;
  const door = c.doors.find((d) => d.family !== 'glass') ?? c.doors[0];
  const base = { model: c.control.model, height: CONTROL_HEIGHT.default };
  if (door && frames[door.wall]) {
    const f = frames[door.wall];
    const s = doorSpan(door);
    const left = s.from - clear - half;
    const right = s.to + clear + half;
    const latchLeft = door.hinge === 'right';
    const order = latchLeft ? [left, right] : [right, left];
    for (const off of order) {
      const cand = { ...c, control: { ...base, wall: door.wall, offset: off } };
      if (off - half >= 0 && off + half <= f.length && !controlBlocked(cand)) return cand.control;
    }
  }
  const f = frames[door?.wall ?? 0] ?? frames[0];
  return { ...base, wall: f.edge, offset: f.length / 2 };
}

/** Why the controller can't sit where it is, or null. */
export function controlBlocked(c: Compartment): string | null {
  const r = controlRect(c);
  if (!r) return null;
  const f = framesFor(c)[r.wall];
  if (!f) return 'not on a wall';
  if (r.from < -0.5 || r.to > f.length + 0.5) return 'past the end of the wall';
  if (wallOpenings(c, r.wall).some((o) => intersects(r, o, -12))) return 'over or too close to a door opening';
  return null;
}
