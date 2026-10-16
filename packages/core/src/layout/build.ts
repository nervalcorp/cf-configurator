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
import { TRAFFIC_FINISHES, doorSku, getDoorFamily } from '../catalog';
import { type Vec2, bounds, edgeLength, edgeNormal, isClockwise, isInsideCorner } from '../geometry';
import { formatInches } from '../units';
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
  | 'curtain';

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
 * A wall panel: a 2D profile in (u, v), door openings cut from its bottom
 * edge, extruded from the inside face (w = 0) to the outside face (w = T).
 * The w = T cap is the exterior.
 */
export interface WallPart extends Base {
  kind: 'wall';
  letter: string;
  edgeIndex: number;
  profile: Vec2[];
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

/** Wall outline with notches cut up from the bottom edge for each opening. */
export function wallProfile(length: number, height: number, openings: [number, number, number][]): Vec2[] {
  const pts: Vec2[] = [];
  const ops = mergeOpenings(
    openings
      .map(([a, b, h]) => [Math.max(0, a), Math.min(length, b), Math.min(h, height - 1)] as [number, number, number])
      .filter(([a, b]) => b - a > 1),
  );
  if (!ops.length || ops[0][0] > 0.5) pts.push([0, 0]);
  for (const [a, b, h] of ops) {
    if (a > 0.5) pts.push([a, 0]);
    pts.push([a, h], [b, h]);
    if (b < length - 0.5) pts.push([b, 0]);
  }
  const lastB = ops.length ? ops[ops.length - 1][1] : 0;
  if (!ops.length || lastB < length - 0.5) pts.push([length, 0]);
  pts.push([length, height], [0, height]);
  return pts;
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
  // The ceiling panel takes one wall thickness of the overall height.
  const wallH = c.height - T;
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
  const F = LIMITS.doorFrame;
  for (const f of frames) {
    const onWall = c.doors.filter((d) => d.wall === f.edge);
    const openings = onWall.map((d) => {
      const fam = getDoorFamily(d.family);
      return [d.offset - F, d.offset + fam.width + F, fam.height + F] as [number, number, number];
    });
    const len = f.length - 2 * EP;
    if (len < 3) continue;
    parts.push({
      kind: 'wall',
      id: `${c.id}:wall-${f.letter}`,
      label: `Wall ${f.letter}`,
      letter: f.letter,
      edgeIndex: f.edge,
      profile: wallProfile(len, wallH, openings.map(([a, bb, h]) => [a - EP, bb - EP, h])),
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
      height: c.height,
      doors: c.doors.filter((d) => d.wall === f.edge).length,
    }))
    .sort((x, y) => x.letter.localeCompare(y.letter));

  return {
    compartmentId: c.id,
    footprint: fp,
    frontEdge: front,
    overall: { width: b.width, depth: b.depth, height: c.height + fTop },
    floorTop: fTop,
    wallHeight: wallH,
    parts,
    dimensions,
    walls,
    doors,
  };
}

/** Door hardware and leaves, placed in the wall's frame. */
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

  const out: Part[] = [];
  const leafT = fam.kind === 'traffic' ? 38 : LIMITS.doorThickness;
  // Frame around the opening, flush through the wall.
  out.push(box('door-frame', 'frame-l', x0 - F / 2, H / 2, T / 2, [F, H, leafT]));
  out.push(box('door-frame', 'frame-r', x1 + F / 2, H / 2, T / 2, [F, H, leafT]));
  out.push(box('door-frame', 'frame-t', mid, H + F / 2, T / 2, [W + 2 * F, F, leafT]));
  out.push(box('threshold', 'threshold', mid, 9, T / 2, [W + 2 * F, 18, leafT]));

  const hingeRight = d.hinge === 'right';
  const hs = hingeRight ? 1 : -1;
  const handleColor: Record<string, string> = {
    included: '#9aa0a6',
    'ICC-P4': '#d8dce0',
    'ICC-W58BL': '#1f2125',
    'ICC-W58BR': '#b08d45',
    'ICC-38': '#c9ced3',
  };

  switch (fam.kind) {
    case 'swing': {
      out.push(box('door-leaf', 'leaf', mid, H / 2, T / 2, [W, H, leafT], { label }));
      const outward = d.swing === 'out';
      const face = outward ? T / 2 + leafT / 2 : T / 2 - leafT / 2;
      const sgn = outward ? 1 : -1;
      const hu = hingeRight ? x1 : x0;
      [0.85, 0.5, 0.15].forEach((pct, i) => {
        out.push(box('hinge', `hinge-${i + 1}`, hu - hs * 46, H * pct, face + sgn * 4, [137, 43, 8]));
        const p = at(hu + hs * 24, H * pct, face + sgn * 4);
        out.push({ kind: 'hinge-pin', id: id(`pin-${i + 1}`), center: p, radius: 9, height: 49, doorId: d.id });
      });
      const lu = hingeRight ? x0 : x1;
      out.push(box('handle', 'handle', lu + hs * 90, 1000, face + sgn * 28, [40, 220, 50], { color: handleColor[d.handle] }));
      if (d.closer) {
        out.push(box('closer', 'closer', hu - hs * 230, H - 90, face + sgn * 34, [280, 55, 65], { label: 'Door closer ICC-20SS' }));
      }
      if (d.window) {
        out.push(box('window', 'window', mid, 1500, T / 2, [360, 450, leafT + 4], { label: 'Viewport window' }));
      }
      break;
    }
    case 'slide': {
      const leafW = W + 200;
      const leafH = H + 75;
      out.push(box('door-leaf', 'leaf', mid, leafH / 2, T + 45, [leafW, leafH, 70], { label }));
      const from = hingeRight ? x0 - 150 : x0 - W - 150;
      const to = hingeRight ? x1 + W + 150 : x1 + 150;
      out.push(box('track', 'track', (from + to) / 2, leafH + 60, T + 40, [to - from, 70, 60], { label: 'Sliding track' }));
      // Pull handle on the edge that leads when opening.
      const hu = hingeRight ? x0 - 100 + 120 : x1 + 100 - 120;
      out.push(box('handle', 'handle', hu, 1050, T + 45 + 60, [40, 300, 50], { color: handleColor[d.handle] }));
      break;
    }
    case 'rollup': {
      out.push(box('guide', 'guide-l', x0 - 45, H / 2, T + 45, [90, H, 90]));
      out.push(box('guide', 'guide-r', x1 + 45, H / 2, T + 45, [90, H, 90]));
      out.push(box('curtain', 'curtain', mid, H / 2, T + 30, [W, H, 25], { label }));
      out.push(box('housing', 'housing', mid, H + 190, T + 190, [W + 260, 380, 380], { label: 'Roll-up coil housing' }));
      break;
    }
    case 'traffic': {
      const color = TRAFFIC_FINISHES.find((t) => t.id === d.finish)?.color;
      if (d.family === 'traffic-double') {
        const lw = W / 2 - 3;
        out.push(box('door-leaf', 'leaf-l', x0 + lw / 2, H / 2, T / 2, [lw, H, leafT], { label, color }));
        out.push(box('door-leaf', 'leaf-r', x1 - lw / 2, H / 2, T / 2, [lw, H, leafT], { label, color }));
      } else {
        out.push(box('door-leaf', 'leaf', mid, H / 2, T / 2, [W - 6, H, leafT], { label, color }));
      }
      break;
    }
  }
  return out;
}
