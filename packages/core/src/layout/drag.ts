/**
 * Floor-plan vertex dragging, as pure functions. Ported from the icoolaca
 * pointer handlers.
 *
 * pickHandle() classifies the grabbed vertex once, on pointer-down; dragHandle()
 * maps the pointer (footprint mm) to new params. The polygon is regenerated
 * from params, so it can never become degenerate.
 *
 * Change from the original: the door-wall minimum is measured on the actual
 * footprint instead of a per-notch formula, which had `br` and `tr` swapped.
 */
import type { Compartment } from '../config';
import { LIMITS } from '../config';
import { mmToIn, inToMm } from '../units';
import { type NotchCode, footprint, getShape } from './shapes';
import { doorWallLength } from './walls';

export type DragHandle =
  | { type: 'box'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { type: 'notchW' | 'notchD' | 'notchBoth'; notch: NotchCode };

const near = (a: number, b: number) => Math.abs(a - b) < inToMm(2);

export function pickHandle(c: Compartment, vertexIndex: number): DragHandle | null {
  const fp = footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);
  const pt = fp[vertexIndex];
  if (!pt) return null;
  const onLeft = near(pt[0], 0);
  const onRight = near(pt[0], c.boxW);
  const onTop = near(pt[1], 0);
  const onBottom = near(pt[1], c.boxD);
  const { notch } = getShape(c.shape);
  const box = (): DragHandle => ({ type: 'box', dx: onRight ? 1 : onLeft ? -1 : 0, dy: onBottom ? 1 : onTop ? -1 : 0 });

  if (notch === 'none') return box();
  if ((onLeft || onRight) && (onTop || onBottom)) return box();
  if (!onLeft && !onRight && !onTop && !onBottom) return { type: 'notchBoth', notch };
  return onLeft || onRight ? { type: 'notchD', notch } : { type: 'notchW', notch };
}

const snap = (mm: number) => inToMm(Math.round(mmToIn(mm) / LIMITS.box.stepIn) * LIMITS.box.stepIn);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * New params for a pointer at `p` (footprint mm, origin at the box's back-left).
 * Returns the input unchanged when the move would break the door-wall minimum.
 */
export function dragHandle(c: Compartment, h: DragHandle, p: readonly [number, number]): Compartment {
  const sx = snap(p[0]);
  const sy = snap(p[1]);
  const ok = (next: Compartment) =>
    doorWallLength(footprint(next.shape, next.boxW, next.boxD, next.notchW, next.notchD)) >= LIMITS.doorWallMin - 0.01;

  if (h.type === 'box') {
    let next = c;
    if (h.dx !== 0) {
      const w = clamp(snap(h.dx > 0 ? sx : c.boxW - sx), LIMITS.box.min, LIMITS.box.max);
      const cand = { ...next, boxW: w };
      if (ok(cand)) next = cand;
    }
    if (h.dy !== 0) {
      const d = clamp(snap(h.dy > 0 ? sy : c.boxD - sy), LIMITS.box.min, LIMITS.box.max);
      const cand = { ...next, boxD: d };
      if (ok(cand)) next = cand;
    }
    return next;
  }

  const { range } = getShape(c.shape);
  const n = h.notch;
  let nw = c.notchW;
  let nd = c.notchD;

  if (h.type === 'notchW' || h.type === 'notchBoth') {
    if (n === 'tr' || n === 'br' || n === 'br-lg' || n === 'mr') nw = (c.boxW - sx) / c.boxW;
    else if (n === 'tl' || n === 'bl' || n === 'tl-lg' || n === 'ml') nw = sx / c.boxW;
    else if (n === 'bc') nw = (Math.abs(sx - c.boxW / 2) * 2) / c.boxW;
    nw = clamp(nw, range.nwMin, range.nwMax);
  }
  if (h.type === 'notchD' || h.type === 'notchBoth') {
    if (n === 'tl' || n === 'tl-lg' || n === 'br') nd = sy / c.boxD;
    else if (n === 'bl' || n === 'bc' || n === 'tr' || n === 'br-lg') nd = (c.boxD - sy) / c.boxD;
    else if (n === 'ml' || n === 'mr') nd = (Math.abs(sy - c.boxD / 2) * 2) / c.boxD;
    nd = clamp(nd, range.ndMin, range.ndMax);
  }
  const cand = { ...c, notchW: nw, notchD: nd };
  return ok(cand) ? cand : c;
}
