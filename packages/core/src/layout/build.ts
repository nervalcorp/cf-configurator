/**
 * buildCompartment: params in, component tree out.
 *
 * Every component is plain data in mm, so the same tree feeds the 3D view, the
 * floor plan, the part list and (later) the PDF, and it can be unit-tested.
 *
 * World space (mm): X = footprint x, Z = footprint y (front = +Z), Y up.
 * The footprint is centred on its bounding box. The floor slab runs from
 * y = 0 to y = floorTop; walls start at floorTop.
 *
 * Walls are built in their own frame: u along the wall (left → right seen
 * from outside), v up, w from the inside face (0) to the outside face (T).
 * A part with rotationY θ maps local +X to u and local +Z to the outward normal.
 */
import type { Compartment, Door, SiteType } from '../config';
import { LIMITS } from '../config';
import { DOOR_WINDOW, TRAFFIC_FINISHES, doorMount, doorSku, getDoorFamily } from '../catalog';
import { type Vec2, bounds, edgeLength, edgeNormal, isClockwise, isInsideCorner } from '../geometry';
import { formatInches, inToMm } from '../units';
import { footprint } from './shapes';
import { type WallFrame, findFrontEdge, jointNumber, postSigns, wallFrames } from './walls';

export type Vec3 = readonly [number, number, number];

interface Base {
  id: string;
  /** Shown on hover and in the part list, e.g. "Wall C" or "Joint 3". */
  label?: string;
}

export type BoxKind =
  | 'post'
  | 'door-leaf'
  | 'door-frame'
  | 'threshold'
  | 'hinge'
  | 'handle'
  | 'closer'
  | 'window'
  | 'track'
  | 'guide'
  | 'housing'
  | 'curtain'
  | 'badge'
  | 'gasket'
  | 'trim'
  | 'latch';

export interface BoxPart extends Base {
  kind: BoxKind;
  center: Vec3;
  /** Size along the part's local axes (before rotationY). */
  size: Vec3;
  rotationY?: number;
  /** Colour override (traffic-door finish, handle finish). */
  color?: string;
  joint?: number;
  doorId?: string;
}

export interface CylinderPart extends Base {
  kind: 'hinge-pin';
  center: Vec3;
  radius: number;
  height: number;
  doorId?: string;
}

/** A flat polygon extruded upward: floor slab or roof. */
export interface SlabPart extends Base {
  kind: 'floor' | 'roof';
  polygon: Vec2[];
  y: number;
  thickness: number;
}

/**
 * A wall: one or more 2D outlines in (u, v) with door openings cut up from the
 * bottom edge, extruded from the inside face (w = 0) to the outside face (w = T).
 * The w = T cap is the exterior. A full-height opening splits the wall, so a
 * wall can have several outlines.
 */
export interface WallPart extends Base {
  kind: 'wall';
  letter: string;
  edgeIndex: number;
  profiles: Vec2[][];
  origin: Vec3;
  rotationY: number;
  thickness: number;
}

export type Part = BoxPart | CylinderPart | SlabPart | WallPart;

export interface Dimension {
  a: Vec3;
  b: Vec3;
  label: string;
  /** Where the label sits relative to the line's midpoint. */
  labelOffset: Vec3;
}

export interface WallSummary {
  letter: string;
  edgeIndex: number;
  /** Outside length, corner to corner. */
  length: number;
  /** Inside run between corner posts. */
  insideLength: number;
  height: number;
  doors: number;
}

export interface DoorSummary {
  id: string;
  index: number;
  sku: string;
  wall: string;
  offset: number;
  label: string;
}

export interface ComponentTree {
  compartmentId: string;
  /** Centred footprint (outside face). */
  footprint: Vec2[];
  frontEdge: number;
  overall: { width: number; depth: number; height: number };
  floorTop: number;
  wallHeight: number;
  parts: Part[];
  dimensions: Dimension[];
  walls: WallSummary[];
  doors: DoorSummary[];
}

/** Gap between touching parts so faces never z-fight. */
const EP = 0.5;

/** Merge overlapping [a, b, h] openings so the wall profile stays a simple polygon. */
function mergeOpenings(list: [number, number, number][]): [number, number, number][] {
  const s = [...list].sort((x, y) => x[0] - y[0]);
  const out: [number, number, number][] = [];
  for (const o of s) {
    const last = out[out.length - 1];
    if (last && o[0] <= last[1]) {
      last[1] = Math.max(last[1], o[1]);
      last[2] = Math.max(last[2], o[2]);
    } else out.push([...o]);
  }
  return out;
}

/** Outline of one wall run [s, e] with notches cut up from the bottom for each (partial) opening. */
function runOutline(s0: number, e0: number, height: number, ops: [number, number, number][]): Vec2[] {
  const pts: Vec2[] = [];
  if (!ops.length || ops[0][0] > s0 + 0.5) pts.push([s0, 0]);
  for (const [a, b, h] of ops) {
    if (a > s0 + 0.5) pts.push([a, 0]);
    pts.push([a, h], [b, h]);
    if (b < e0 - 0.5) pts.push([b, 0]);
  }
  const lastB = ops.length ? ops[ops.length - 1][1] : s0;
  if (!ops.length || lastB < e0 - 0.5) pts.push([e0, 0]);
  pts.push([e0, height], [s0, height]);
  return pts;
}

/**
 * Wall outlines with openings [a, b, h] cut from the bottom edge. Openings
 * that reach the top split the wall into separate runs.
 */
export function wallProfiles(length: number, height: number, openings: [number, number, number][]): Vec2[][] {
  const ops = mergeOpenings(
    openings
      .map(([a, b, h]) => [Math.max(0, a), Math.min(length, b), Math.min(h, height)] as [number, number, number])
      .filter(([a, b]) => b - a > 1),
  );
  const out: Vec2[][] = [];
  let start = 0;
  let partial: [number, number, number][] = [];
  const flush = (end: number) => {
    if (end - start > 3) out.push(runOutline(start, end, height, partial));
    partial = [];
  };
  for (const o of ops) {
    if (o[2] >= height - 0.5) {
      flush(o[0]);
      start = o[1];
    } else partial.push(o);
  }
  flush(length);
  return out;
}

/** Single-outline wall (no full-height openings). */
export function wallProfile(length: number, height: number, openings: [number, number, number][]): Vec2[] {
  return wallProfiles(length, height, openings)[0] ?? [];
}

/** The hole a door needs in its wall: [from, to, height] along the wall's inside run. */
function doorOpening(d: Door, wallH: number): [number, number, number] {
  const fam = getDoorFamily(d.family);
  const F = LIMITS.doorFrame;
  const x0 = d.offset;
  const x1 = d.offset + fam.width;
  const mount = doorMount(d);
  if (mount === 'semi-buried') return [x0, x1, fam.height];
  if (fam.kind === 'rollup') return [x0 - F, x1 + F, Math.min(fam.height, wallH)];
  return [x0 - F, x1 + F, fam.height + F];
}

export function buildCompartment(c: Compartment, site: SiteType): ComponentTree {
  const raw = footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);
  const front = findFrontEdge(raw);
  const b = bounds(raw);
  const fp: Vec2[] = raw.map(([x, y]) => [x - b.cx, y - b.cy]);
  const n = fp.length;
  const cw = isClockwise(fp);

  const T = c.wallThickness;
  const hasFloor = c.finishes.floor !== 'none';
  const floorT = T * 0.6;
  const fTop = hasFloor ? floorT : 0;
  // Height is the wall panel height; the ceiling panel sits on top of the walls.
  const wallH = c.height;
  const y0 = fTop + EP;

  const parts: Part[] = [];
  const dimensions: Dimension[] = [];

  if (hasFloor) parts.push({ kind: 'floor', id: `${c.id}:floor`, label: 'Floor', polygon: fp, y: 0, thickness: floorT });
  if (site === 'outdoor') parts.push({ kind: 'roof', id: `${c.id}:roof`, label: 'Roof', polygon: fp, y: fTop + wallH, thickness: T });

  // ── Corner posts ──
  const signs = postSigns(fp);
  fp.forEach((p, i) => {
    const joint = jointNumber(i, raw, front);
    parts.push({
      kind: 'post',
      id: `${c.id}:joint-${joint}`,
      label: `Joint ${joint}${isInsideCorner(fp, i) ? ' (inside)' : ''}`,
      joint,
      center: [p[0] + (signs[i][0] * T) / 2, y0 + wallH / 2, p[1] + (signs[i][1] * T) / 2],
      size: [T, wallH, T],
    });
  });

  // ── Walls with door openings ──
  const frames = wallFrames(fp, T);
  for (const f of frames) {
    const openings = c.doors.filter((d) => d.wall === f.edge).map((d) => doorOpening(d, wallH));
    const len = f.length - 2 * EP;
    if (len < 3) continue;
    parts.push({
      kind: 'wall',
      id: `${c.id}:wall-${f.letter}`,
      label: `Wall ${f.letter}`,
      letter: f.letter,
      edgeIndex: f.edge,
      profiles: wallProfiles(len, wallH, openings.map(([a, bb, h]) => [a - EP, bb - EP, h])),
      origin: [f.origin[0] + f.u[0] * EP, y0, f.origin[1] + f.u[1] * EP],
      rotationY: Math.atan2(f.n[0], f.n[1]),
      thickness: T,
    });
  }

  // ── Doors ──
  const doors: DoorSummary[] = [];
  c.doors.forEach((d, k) => {
    const f = frames[d.wall];
    if (!f) return;
    const sku = doorSku(d, c.temperature);
    const label = `Door ${k + 1} · ${sku}`;
    doors.push({ id: d.id, index: k + 1, sku, wall: f.letter, offset: d.offset, label });
    parts.push(...doorParts(c, d, f, y0, label));
  });

  // ── Dimensions on the outside face, just above the walls ──
  const dimY = fTop + wallH + 91;
  for (let i = 0; i < n; i++) {
    const a = fp[i];
    const bb = fp[(i + 1) % n];
    const len = edgeLength(a, bb);
    if (len < 50) continue;
    const [nx, nz] = edgeNormal(a, bb, cw);
    const g = 37;
    dimensions.push({
      a: [a[0] + nx * g, dimY, a[1] + nz * g],
      b: [bb[0] + nx * g, dimY, bb[1] + nz * g],
      label: formatInches(len),
      labelOffset: [nx * 37, 46, nz * 37],
    });
  }
  const h0 = fp[0];
  dimensions.push({
    a: [h0[0] + 152, fTop, h0[1] + 152],
    b: [h0[0] + 152, fTop + wallH, h0[1] + 152],
    label: formatInches(c.height),
    labelOffset: [91, 0, 91],
  });

  const walls: WallSummary[] = frames
    .map((f) => ({
      letter: f.letter,
      edgeIndex: f.edge,
      length: f.outsideLength,
      insideLength: f.length,
      height: wallH,
      doors: c.doors.filter((d) => d.wall === f.edge).length,
    }))
    .sort((x, y) => x.letter.localeCompare(y.letter));

  return {
    compartmentId: c.id,
    footprint: fp,
    frontEdge: front,
    overall: { width: b.width, depth: b.depth, height: fTop + c.height + T },
    floorTop: fTop,
    wallHeight: wallH,
    parts,
    dimensions,
    walls,
    doors,
  };
}

const HANDLE_COLORS: Record<string, string> = {
  included: '#d8dce0',
  'ICC-P4': '#e4e7ea',
  'ICC-W58BL': '#1f2125',
  'ICC-W58BR': '#b08d45',
  'ICC-38': '#c9ced3',
};
const DARK = '#1f2a33';
const STAINLESS = '#c9cdd1';

/**
 * Door hardware and leaves, placed in the wall's frame.
 *
 * Swing doors follow the ICC door photos: three cam-lift hinges (two high, one
 * low) on the swing side, a latch handle at about mid height on the other
 * side, the self closer at the top on the latch side, and the brand badge
 * high on the leaf. Fractions below are measured off those photos.
 */
function doorParts(c: Compartment, d: Door, f: WallFrame, y0: number, label: string): Part[] {
  const T = c.wallThickness;
  const F = LIMITS.doorFrame;
  const fam = getDoorFamily(d.family);
  const W = fam.width;
  const H = fam.height;
  const x0 = d.offset;
  const x1 = d.offset + W;
  const mid = (x0 + x1) / 2;
  const rot = Math.atan2(f.n[0], f.n[1]);
  const at = (u: number, v: number, w: number): Vec3 => [
    f.origin[0] + f.u[0] * u + f.n[0] * w,
    y0 + v,
    f.origin[1] + f.u[1] * u + f.n[1] * w,
  ];
  const id = (s: string) => `${c.id}:${d.id}:${s}`;
  const box = (kind: BoxKind, name: string, u: number, v: number, w: number, size: Vec3, extra: Partial<BoxPart> = {}): BoxPart => ({
    kind,
    id: id(name),
    center: at(u, v, w),
    size,
    rotationY: rot,
    doorId: d.id,
    ...extra,
  });
  const pin = (name: string, u: number, v: number, w: number, r: number, h: number): CylinderPart => ({
    kind: 'hinge-pin',
    id: id(name),
    center: at(u, v, w),
    radius: r,
    height: h,
    doorId: d.id,
  });

  const out: Part[] = [];
  const hs = d.hinge === 'right' ? 1 : -1; // +1: hinges at the right end (u grows toward them)
  const handle = HANDLE_COLORS[d.handle];

  if (fam.kind === 'swing') {
    const mount = doorMount(d)!;
    // Hinge-side and latch-side edges of the visible leaf, its height, and its front face.
    let hingeEdge: number;
    let latchEdge: number;
    let leafTop: number;
    let front: number;
    let onWall: number; // w where hardware fixed to the wall or frame sits

    if (mount === 'semi-buried') {
      const OV = inToMm(1.5); // leaf overlap past the opening
      const SLAB = inToMm(2.5); // leaf thickness standing proud of the wall
      leafTop = H + OV;
      front = T + SLAB;
      hingeEdge = d.hinge === 'right' ? x1 + OV : x0 - OV;
      latchEdge = d.hinge === 'right' ? x0 - OV : x1 + OV;
      onWall = T;
      // Plug inside the opening, then the slab on the outside face.
      out.push(box('door-leaf', 'plug', mid, H / 2, T / 2, [W - 6, H - 6, T]));
      out.push(box('door-leaf', 'leaf', mid, leafTop / 2, T + SLAB / 2, [W + 2 * OV, leafTop, SLAB], { label }));
    } else {
      // Full-buried: frame ring proud of the wall by 10 mm, leaf flush inside it, dark gasket between.
      leafTop = H + F;
      front = T + 3;
      hingeEdge = d.hinge === 'right' ? x1 : x0;
      latchEdge = d.hinge === 'right' ? x0 : x1;
      onWall = T + 10;
      out.push(box('door-frame', 'frame-l', x0 - F / 2, (H + F) / 2, T / 2 + 5, [F, H + F, T + 10]));
      out.push(box('door-frame', 'frame-r', x1 + F / 2, (H + F) / 2, T / 2 + 5, [F, H + F, T + 10]));
      out.push(box('door-frame', 'frame-t', mid, H + F / 2, T / 2 + 5, [W, F, T + 10]));
      const g = 8;
      out.push(box('gasket', 'gasket-l', x0 + g / 2, H / 2, T / 2 + 2, [g, H, T]));
      out.push(box('gasket', 'gasket-r', x1 - g / 2, H / 2, T / 2 + 2, [g, H, T]));
      out.push(box('gasket', 'gasket-t', mid, H - g / 2, T / 2 + 2, [W, g, T]));
      out.push(box('door-leaf', 'leaf', mid, (H - g) / 2, T / 2 + 3, [W - 2 * g, H - g, T], { label }));
      out.push(box('gasket', 'sweep', mid, 15, front + 6, [W - 2 * g, 30, 12]));
    }

    const span = Math.abs(latchEdge - hingeEdge);
    const inward = -hs; // from the hinge edge toward the latch edge, along u
    // Cam-lift hinges: strap on the leaf, knuckle at the edge, base plate on the wall or frame.
    const hingeFracs = mount === 'semi-buried' ? [0.13, 0.285, 0.895] : [0.13, 0.27, 0.83];
    hingeFracs.forEach((fr, k) => {
      const v = leafTop * (1 - fr);
      out.push(box('hinge', `hinge-${k + 1}`, hingeEdge + inward * 120, v, front + 9, [240, 42, 18]));
      out.push(pin(`pin-${k + 1}`, hingeEdge + hs * 18, v, front + 6, 16, 120));
      out.push(box('hinge', `hinge-base-${k + 1}`, hingeEdge + hs * 48, v, onWall + (front - onWall) / 2, [40, 130, front - onWall + 12]));
    });

    // Latch handle about mid height on the latch side, strike on the wall or frame.
    const lv = leafTop * 0.53;
    out.push(box('handle', 'handle', latchEdge - inward * 175, lv, front + 48, [240, 26, 26], { color: handle }));
    out.push(box('handle', 'handle-post-1', latchEdge - inward * 70, lv, front + 22, [22, 22, 44], { color: handle }));
    out.push(box('handle', 'handle-post-2', latchEdge - inward * 280, lv, front + 22, [22, 22, 44], { color: handle }));
    out.push(box('latch', 'latch', latchEdge - inward * 28, lv, front + 26, [60, 110, 52]));
    out.push(box('latch', 'strike', latchEdge + inward * 40, lv, onWall + (front - onWall) / 2 + 10, [55, 90, front - onWall + 30]));

    // Self closer (standard on these doors): vertical body across the top edge, latch side.
    const cu = hingeEdge + inward * span * (mount === 'semi-buried' ? 0.84 : 0.8);
    out.push(box('latch', 'self-closer', cu, leafTop - 10, front + 22, [42, 170, 44], { label: 'Self closer' }));
    out.push(box('latch', 'self-closer-base', cu, leafTop + 50, onWall + 12, [70, 50, 24]));

    // Brand badge high on the leaf; higher when a window takes its place.
    const badgeV = d.window ? leafTop * (1 - 0.09) : leafTop * (1 - 0.2);
    out.push(box('badge', 'badge', mid, badgeV, front + 2, [110, 120, 4], { color: DARK, label: 'ICC badge' }));

    if (d.window) {
      // 12" × 16" heated window, white trim, top edge about 19% down the leaf.
      const ww = DOOR_WINDOW.width;
      const wh = DOOR_WINDOW.height;
      const wv = leafTop * (1 - 0.19) - wh / 2;
      const t = 25;
      out.push(box('window', 'window', mid, wv, T / 2 + 3, [ww, wh, T + 8], { label: 'Heated window 12" × 16"' }));
      out.push(box('trim', 'window-trim-l', mid - ww / 2 - t / 2, wv, front + 4, [t, wh + 2 * t, 8], { color: '#f6f6f4' }));
      out.push(box('trim', 'window-trim-r', mid + ww / 2 + t / 2, wv, front + 4, [t, wh + 2 * t, 8], { color: '#f6f6f4' }));
      out.push(box('trim', 'window-trim-t', mid, wv + wh / 2 + t / 2, front + 4, [ww, t, 8], { color: '#f6f6f4' }));
      out.push(box('trim', 'window-trim-b', mid, wv - wh / 2 - t / 2, front + 4, [ww, t, 8], { color: '#f6f6f4' }));
    }

    if (d.closer) {
      // Optional hydraulic closer (ICC-20SS) near the top of the hinge side.
      out.push(box('closer', 'closer', hingeEdge + inward * 260, leafTop - 110, front + 34, [280, 55, 65], { label: 'Door closer ICC-20SS' }));
    }
    return out;
  }

  if (fam.kind === 'rollup') {
    // Opening runs the full panel height; the coil housing sits above the walls.
    const Hh = Math.min(H, c.height);
    const G = 110;
    const gw = T + 60;
    out.push(box('guide', 'guide-l', x0 - G / 2, Hh / 2, gw, [G, Hh, 120], { color: STAINLESS }));
    out.push(box('guide', 'guide-r', x1 + G / 2, Hh / 2, gw, [G, Hh, 120], { color: STAINLESS }));
    for (const [name, u] of [['l', x0 - G / 2], ['r', x1 + G / 2]] as const) {
      out.push(box('badge', `label-${name}`, u, Hh * 0.45, gw + 62, [55, 110, 4], { color: '#b8322f' }));
      out.push(box('latch', `sensor-${name}`, u, 240, gw + 75, [60, 80, 40], { color: '#5a6068' }));
    }
    const cw = T + 75;
    out.push(box('curtain', 'curtain', mid, Hh / 2 + 20, cw, [W, Hh - 40, 18], { label, color: '#1f4bb8' }));
    for (let v = 254; v < Hh - 60; v += 254) {
      out.push(box('curtain', `rib-${Math.round(v)}`, mid, v, cw + 6, [W, 12, 10], { color: '#183c96' }));
    }
    out.push(box('gasket', 'bottom-bar', mid, 22, cw, [W, 45, 40]));
    const HW = W + 2 * G + 80;
    const hv = Hh + 260;
    out.push(box('housing', 'housing', mid, hv, T + 230, [HW, 520, 460], { label: 'Roll-up drum housing', color: STAINLESS }));
    for (const dv of [80, -60]) {
      out.push(box('track', `housing-band-${dv}`, mid, hv + dv, T + 462, [HW - 60, 40, 8], { color: '#8d9399' }));
    }
    out.push(box('badge', 'housing-label', mid + HW / 2 - 120, hv - 180, T + 462, [90, 40, 4], { color: '#2b4a8a' }));
    return out;
  }

  // Sliding and traffic doors: frame around the opening.
  const leafT = fam.kind === 'traffic' ? 38 : LIMITS.doorThickness;
  out.push(box('door-frame', 'frame-l', x0 - F / 2, H / 2, T / 2, [F, H, leafT]));
  out.push(box('door-frame', 'frame-r', x1 + F / 2, H / 2, T / 2, [F, H, leafT]));
  out.push(box('door-frame', 'frame-t', mid, H + F / 2, T / 2, [W + 2 * F, F, leafT]));
  out.push(box('threshold', 'threshold', mid, 9, T / 2, [W + 2 * F, 18, leafT]));

  if (fam.kind === 'slide') {
    const leafW = W + 200;
    const leafH = H + 75;
    out.push(box('door-leaf', 'leaf', mid, leafH / 2, T + 45, [leafW, leafH, 70], { label }));
    const from = d.hinge === 'right' ? x0 - 150 : x0 - W - 150;
    const to = d.hinge === 'right' ? x1 + W + 150 : x1 + 150;
    out.push(box('track', 'track', (from + to) / 2, leafH + 60, T + 40, [to - from, 70, 60], { label: 'Sliding track' }));
    const hu = d.hinge === 'right' ? x0 - 100 + 120 : x1 + 100 - 120;
    out.push(box('handle', 'handle', hu, 1050, T + 45 + 60, [40, 300, 50], { color: handle }));
    return out;
  }

  const color = TRAFFIC_FINISHES.find((t) => t.id === d.finish)?.color;
  if (d.family === 'traffic-double') {
    const lw = W / 2 - 3;
    out.push(box('door-leaf', 'leaf-l', x0 + lw / 2, H / 2, T / 2, [lw, H, leafT], { label, color }));
    out.push(box('door-leaf', 'leaf-r', x1 - lw / 2, H / 2, T / 2, [lw, H, leafT], { label, color }));
  } else {
    out.push(box('door-leaf', 'leaf', mid, H / 2, T / 2, [W - 6, H, leafT], { label, color }));
  }
  return out;
}
