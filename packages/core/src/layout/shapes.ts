/**
 * Parametric footprints: a bounding box (boxW × boxD) with an optional notch
 * sized as a fraction of the box. Ported from the icoolaca build's
 * SHAPE_PARAMS / NOTCH_RANGES / generateShapePoints, now in mm.
 *
 * Notch codes describe footprint space (y grows toward the front), so on the
 * floor plan, where the front is drawn at the bottom, `tr` appears bottom-right.
 * The codes are kept as-is so drag behaviour matches the original build.
 */
import type { Vec2 } from '../geometry';
import { inToMm, mmToIn } from '../units';

export type NotchCode = 'none' | 'tr' | 'bl' | 'tl' | 'br' | 'bc' | 'ml' | 'mr' | 'br-lg' | 'tl-lg';

export type ShapeId =
  | 'rectangle'
  | 'cutout-a'
  | 'cutout-b'
  | 'cutout-c'
  | 'cutout-d'
  | 'cutout-e'
  | 'cutout-f'
  | 'cutout-g'
  | 'cutout-h'
  | 'cutout-i';

export interface ShapeDef {
  id: ShapeId;
  label: string;
  notch: NotchCode;
  /** Default notch fractions applied when the shape is picked. */
  nw: number;
  nd: number;
  range: { nwMin: number; nwMax: number; ndMin: number; ndMax: number };
}

const corner = { nwMin: 0.15, nwMax: 0.5, ndMin: 0.15, ndMax: 0.5 };

export const SHAPES: readonly ShapeDef[] = [
  { id: 'rectangle', label: 'Rectangle', notch: 'none', nw: 0, nd: 0, range: { nwMin: 0, nwMax: 0, ndMin: 0, ndMax: 0 } },
  { id: 'cutout-a', label: 'Cut-out A', notch: 'tr', nw: 0.2, nd: 0.2, range: corner },
  { id: 'cutout-b', label: 'Cut-out B', notch: 'bl', nw: 0.2, nd: 0.2, range: corner },
  { id: 'cutout-c', label: 'Cut-out C', notch: 'tl', nw: 0.2, nd: 0.2, range: corner },
  { id: 'cutout-d', label: 'Cut-out D', notch: 'br', nw: 0.2, nd: 0.2, range: corner },
  { id: 'cutout-e', label: 'Cut-out E', notch: 'bc', nw: 0.4, nd: 0.2, range: { nwMin: 0.2, nwMax: 0.6, ndMin: 0.15, ndMax: 0.5 } },
  { id: 'cutout-f', label: 'Cut-out F', notch: 'ml', nw: 0.2, nd: 0.4, range: { nwMin: 0.15, nwMax: 0.5, ndMin: 0.2, ndMax: 0.6 } },
  { id: 'cutout-g', label: 'Cut-out G', notch: 'mr', nw: 0.2, nd: 0.4, range: { nwMin: 0.15, nwMax: 0.5, ndMin: 0.2, ndMax: 0.6 } },
  { id: 'cutout-h', label: 'Cut-out H', notch: 'br-lg', nw: 0.4, nd: 0.4, range: { nwMin: 0.2, nwMax: 0.6, ndMin: 0.2, ndMax: 0.6 } },
  { id: 'cutout-i', label: 'Cut-out I', notch: 'tl-lg', nw: 0.4, nd: 0.4, range: { nwMin: 0.2, nwMax: 0.6, ndMin: 0.2, ndMax: 0.6 } },
];

const byId = new Map(SHAPES.map((s) => [s.id, s]));

export function getShape(id: ShapeId): ShapeDef {
  const s = byId.get(id);
  if (!s) throw new Error(`Unknown shape: ${id}`);
  return s;
}

export const isShapeId = (v: string): v is ShapeId => byId.has(v as ShapeId);

/** Notch size in mm, rounded to the whole inch like the original build. */
const notchMm = (box: number, frac: number) => inToMm(Math.round(mmToIn(box) * frac));

/**
 * Footprint polygon (outside face of the walls), in mm, origin at the back-left
 * corner of the bounding box.
 */
export function footprint(shape: ShapeId, w: number, d: number, nwFrac: number, ndFrac: number): Vec2[] {
  const { notch } = getShape(shape);
  const nw = notchMm(w, nwFrac);
  const nd = notchMm(d, ndFrac);
  switch (notch) {
    case 'none':
      return [[0, 0], [w, 0], [w, d], [0, d]];
    case 'tr':
    case 'br-lg':
      return [[0, 0], [w, 0], [w, d - nd], [w - nw, d - nd], [w - nw, d], [0, d]];
    case 'bl':
      return [[0, 0], [w, 0], [w, d], [nw, d], [nw, d - nd], [0, d - nd]];
    case 'tl':
    case 'tl-lg':
      return [[nw, 0], [w, 0], [w, d], [0, d], [0, nd], [nw, nd]];
    case 'br':
      return [[0, 0], [w - nw, 0], [w - nw, nd], [w, nd], [w, d], [0, d]];
    case 'bc':
      return [[0, 0], [w, 0], [w, d], [(w + nw) / 2, d], [(w + nw) / 2, d - nd], [(w - nw) / 2, d - nd], [(w - nw) / 2, d], [0, d]];
    case 'ml':
      return [[0, 0], [w, 0], [w, d], [0, d], [0, (d + nd) / 2], [nw, (d + nd) / 2], [nw, (d - nd) / 2], [0, (d - nd) / 2]];
    case 'mr':
      return [[0, 0], [w, 0], [w, (d - nd) / 2], [w - nw, (d - nd) / 2], [w - nw, (d + nd) / 2], [w, (d + nd) / 2], [w, d], [0, d]];
  }
}
