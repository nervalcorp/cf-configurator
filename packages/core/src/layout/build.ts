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
import { CHECKER_PLATE, DOOR_WINDOW, GLASS_FRAME, RAMP, SHELVING, getControl, rampServes, TRAFFIC_FINISHES, doorMount, doorSize, doorSku, doorTag, getDoorFamily, getGlassSeries } from '../catalog';
import { type Vec2, bounds, edgeLength, edgeNormal, isClockwise, isInsideCorner, offsetPolygon } from '../geometry';
import { formatInches, inToMm } from '../units';
import { footprint } from './shapes';
import { type WallFrame, findFrontEdge, jointNumber, postSigns, wallFrames } from './walls';
import { BAY_PITCH, facingVector, gravityKey, shelfHeights, shelvingSize } from './shelving';
import { GASKET, SEMI_FRAME, SEMI_OVERLAP, doorOpening } from './doors';

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
  | 'latch'
  | 'glass'
  | 'logo'
  | 'plate'
  | 'control-body'
  | 'screen'
  | 'shelf-post'
  | 'shelf-wire'
  | 'shelf-brace'
  | 'shelf-bar'
  | 'shelf-bracket'
  | 'price-tag'
  | 'gravity-bed'
  | 'gravity-divider';

export type Face = '+x' | '-x' | '+z' | '-z';

export interface BoxPart extends Base {
  kind: BoxKind;
  center: Vec3;
  /** Size along the part's local axes (before rotationY). */
  size: Vec3;
  /** Faces that are on the outside of the walk-in (corner posts). */
  exteriorFaces?: Face[];
  rotationY?: number;
  /** Tilt about the part's own x axis, applied after rotationY (gravity trays, braces). */
  rotationX?: number;
  /** Colour override (traffic-door finish, handle finish). */
  color?: string;
  /** Show the brand logo on the front (local +Z) face. */
  logo?: boolean;
  /** For kind 'logo': the logo in white with no background, as printed on glass. */
  logoStyle?: 'white';
  /**
   * For kind 'plate': the square's place on its wall in mm [u0, v0, u1, v1], so
   * the tread pattern can be mapped in wall coordinates and line up across squares.
   */
  wallRect?: [number, number, number, number];
  /** For kind 'screen': which controller face to draw. */
  screen?: 'TSC2000' | 'TC1000';
  joint?: number;
  doorId?: string;
}

export interface CylinderPart extends Base {
  kind: 'hinge-pin' | 'cable';
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
  /** Recessed floors show as a concrete slab running out past the walls. */
  concrete?: boolean;
}

/**
 * Aluminum ramp outside a door. `origin` is on the ground at the outside face
 * of the wall, at the ramp's left edge (seen from outside); the ramp runs
 * `width` along the wall and `length` away from it, rising to `height` at the wall.
 */
export interface RampPart extends Base {
  kind: 'ramp';
  origin: Vec3;
  rotationY: number;
  width: number;
  length: number;
  height: number;
  doorId: string;
}

/**
 * A wall: one or more 2D outlines in (u, v) with door openings cut up from the
 * bottom edge, extruded from the inside face (w = 0) to the outside face (w = T).
 * The w = T cap is the exterior. A full-height opening splits the wall, so a
 * wall can have several outlines.
 */
export interface WallOutline {
  outline: Vec2[];
  /** Openings that don't reach the floor (raised glass units). */
  holes: Vec2[][];
}

export interface WallPart extends Base {
  kind: 'wall';
  letter: string;
  edgeIndex: number;
  profiles: WallOutline[];
  origin: Vec3;
  rotationY: number;
  thickness: number;
}

export type Part = BoxPart | CylinderPart | SlabPart | WallPart | RampPart;

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
  /** D1, D2… or G1, G2… */
  tag: string;
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

export interface Opening {
  from: number;
  to: number;
  bottom: number;
  top: number;
}

/** Merge overlapping or touching openings that share a bottom, so outlines stay simple. */
function mergeOpenings(list: Opening[]): Opening[] {
  const s = [...list].sort((x, y) => x.from - y.from);
  const out: Opening[] = [];
  for (const o of s) {
    const last = out[out.length - 1];
    if (last && o.from <= last.to + 0.5 && Math.abs(o.bottom - last.bottom) < 0.5) {
      last.to = Math.max(last.to, o.to);
      last.top = Math.max(last.top, o.top);
    } else out.push({ ...o });
  }
  return out;
}

/** Outline of one wall run [s, e] with notches cut up from the bottom for each opening. */
function runOutline(s0: number, e0: number, height: number, ops: Opening[]): Vec2[] {
  const pts: Vec2[] = [];
  if (!ops.length || ops[0].from > s0 + 0.5) pts.push([s0, 0]);
  for (const o of ops) {
    if (o.from > s0 + 0.5) pts.push([o.from, 0]);
    pts.push([o.from, o.top], [o.to, o.top]);
    if (o.to < e0 - 0.5) pts.push([o.to, 0]);
  }
  const lastB = ops.length ? ops[ops.length - 1].to : s0;
  if (!ops.length || lastB < e0 - 0.5) pts.push([e0, 0]);
  pts.push([e0, height], [s0, height]);
  return pts;
}

/**
 * Wall outlines for a wall of `length` × `height` with openings cut in.
 * Openings from the floor are notches; full-height ones split the wall into
 * separate runs; raised ones (glass units) become holes.
 */
export function wallProfiles(length: number, height: number, openings: Opening[]): WallOutline[] {
  const clipped = openings
    .map((o) => ({ from: Math.max(0, o.from), to: Math.min(length, o.to), bottom: Math.max(0, o.bottom), top: Math.min(o.top, height) }))
    .filter((o) => o.to - o.from > 1 && o.top - o.bottom > 1);
  const floor = mergeOpenings(clipped.filter((o) => o.bottom < 0.5).map((o) => ({ ...o, bottom: 0 })));
  const raised = mergeOpenings(clipped.filter((o) => o.bottom >= 0.5));
  const out: WallOutline[] = [];
  let start = 0;
  let partial: Opening[] = [];
  const flush = (end: number) => {
    if (end - start > 3) {
      const holes = raised
        .filter((o) => o.from >= start - 0.5 && o.to <= end + 0.5)
        .map((o) => [[o.from, o.bottom], [o.to, o.bottom], [o.to, o.top], [o.from, o.top]] as Vec2[]);
      out.push({ outline: runOutline(start, end, height, partial), holes });
    }
    partial = [];
  };
  for (const o of floor) {
    if (o.top >= height - 0.5) {
      flush(o.from);
      start = o.to;
    } else partial.push(o);
  }
  flush(length);
  return out;
}

/** Single-outline wall (no full-height openings, no holes). */
export function wallProfile(length: number, height: number, openings: [number, number, number][]): Vec2[] {
  return wallProfiles(length, height, openings.map(([from, to, top]) => ({ from, to, bottom: 0, top })))[0]?.outline ?? [];
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

  if (c.finishes.floor === 'recessed') {
    // Concrete slab running 4" past the walls, as on recessed installs.
    parts.push({ kind: 'floor', id: `${c.id}:floor`, label: 'Recessed floor', polygon: offsetPolygon(fp, inToMm(4)), y: 0, thickness: floorT, concrete: true });
  } else if (hasFloor) {
    parts.push({ kind: 'floor', id: `${c.id}:floor`, label: 'Floor', polygon: fp, y: 0, thickness: floorT });
  }
  if (site === 'outdoor') parts.push({ kind: 'roof', id: `${c.id}:roof`, label: 'Roof', polygon: fp, y: fTop + wallH, thickness: T });

  // ── Corner posts ──
  const signs = postSigns(fp);
  fp.forEach((p, i) => {
    const joint = jointNumber(i, raw, front);
    const inside = isInsideCorner(fp, i);
    parts.push({
      kind: 'post',
      id: `${c.id}:joint-${joint}`,
      label: `Joint ${joint}${inside ? ' (inside)' : ''}`,
      joint,
      // An outside corner shows two faces to the outside; an inside corner is hidden by the walls.
      exteriorFaces: inside ? [] : [signs[i][0] > 0 ? '-x' : '+x', signs[i][1] > 0 ? '-z' : '+z'],
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
      profiles: wallProfiles(len, wallH, openings.map((o) => ({ ...o, from: o.from - EP, to: o.to - EP }))),
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
    const tag = doorTag(c.doors, d.id);
    const label = `${d.family === 'glass' ? 'Glass doors' : 'Door'} ${tag} · ${sku}`;
    doors.push({ id: d.id, index: k + 1, sku, wall: f.letter, offset: d.offset, label, tag });
    parts.push(...doorParts(c, d, f, y0, label));
  });

  // ── Ramps outside 34" doors, on floors that stand proud of the ground ──
  if (c.accessories.ramp === 'exterior' && (c.finishes.floor === 'standard' || c.finishes.floor === 'durafloor')) {
    for (const d of c.doors) {
      const f = frames[d.wall];
      if (!f || !rampServes(d)) continue;
      const mid = d.offset + doorSize(d).width / 2;
      const u0 = mid - RAMP.width / 2;
      parts.push({
        kind: 'ramp',
        id: `${c.id}:${d.id}:ramp`,
        label: `${RAMP.label} (${RAMP.sku})`,
        origin: [f.origin[0] + f.u[0] * u0 + f.n[0] * T, 0, f.origin[1] + f.u[1] * u0 + f.n[1] * T],
        rotationY: Math.atan2(f.n[0], f.n[1]),
        width: RAMP.width,
        length: RAMP.length,
        height: fTop,
        doorId: d.id,
      });
    }
  }

  // ── Checker plate squares: 1' × 1' on the wall grid, on the outside face ──
  const S = CHECKER_PLATE.size;
  for (const q of c.accessories.checker) {
    const f = frames[q.wall];
    if (!f) continue;
    const u = (q.col + 0.5) * S;
    const v = (q.row + 0.5) * S;
    const w = T + CHECKER_PLATE.thickness / 2;
    parts.push({
      kind: 'plate',
      id: `${c.id}:plate-${q.wall}-${q.col}-${q.row}`,
      label: `Checker plate, wall ${f.letter}`,
      center: [f.origin[0] + f.u[0] * u + f.n[0] * w, y0 + v, f.origin[1] + f.u[1] * u + f.n[1] * w],
      size: [S, S, CHECKER_PLATE.thickness],
      rotationY: Math.atan2(f.n[0], f.n[1]),
      wallRect: [q.col * S, q.row * S, (q.col + 1) * S, (q.row + 1) * S],
    });
  }

  // ── Shelving inside ──
  for (const u of c.accessories.shelving) parts.push(...shelvingParts(c, u, b, fTop));

  // ── Controller ──
  const ctl = getControl(c.control.model);
  const cf = frames[c.control.wall];
  if (ctl && cf) parts.push(...controlParts(c, ctl, cf, fTop));

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
  // Height on the outside of the front-right corner, which faces the default view.
  let hc = 0;
  fp.forEach((p, i) => {
    if (!isInsideCorner(fp, i) && p[0] + p[1] > fp[hc][0] + fp[hc][1]) hc = i;
  });
  {
    const p = fp[hc];
    const n1 = edgeNormal(fp[(hc - 1 + n) % n], p, cw);
    const n2 = edgeNormal(p, fp[(hc + 1) % n], cw);
    const bx = (n1[0] + n2[0]) / Math.SQRT2;
    const bz = (n1[1] + n2[1]) / Math.SQRT2;
    const out = 180;
    dimensions.push({
      a: [p[0] + bx * out, fTop, p[1] + bz * out],
      b: [p[0] + bx * out, fTop + wallH, p[1] + bz * out],
      label: formatInches(c.height),
      labelOffset: [bx * 110, 0, bz * 110],
    });
  }

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
  const { width: W, height: H } = doorSize(d);
  const x0 = d.offset;
  const x1 = d.offset + W;
  const mid = (x0 + x1) / 2;
  const rot = Math.atan2(f.n[0], f.n[1]);
  // Glass units can be raised off the floor; everything else stands on it.
  const lift = fam.kind === 'glass' ? d.elevation : 0;
  const at = (u: number, v: number, w: number): Vec3 => [
    f.origin[0] + f.u[0] * u + f.n[0] * w,
    y0 + lift + v,
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

    // Both mounts use the same leaf: exactly W × H (34" × 78" for a man door).
    leafTop = H;
    hingeEdge = d.hinge === 'right' ? x1 : x0;
    latchEdge = d.hinge === 'right' ? x0 : x1;

    if (mount === 'semi-buried') {
      // The leaf stands proud of a heavy frame and laps over the opening behind it.
      const OV = SEMI_OVERLAP;
      const SF = SEMI_FRAME;
      const SLAB = inToMm(2.5);
      const proud = 20;
      const o0 = x0 + OV;
      const o1 = x1 - OV;
      const oh = H - OV;
      onWall = T + proud;
      front = T + proud + SLAB;
      out.push(box('door-frame', 'frame-l', o0 - SF / 2, (oh + SF) / 2, (T + proud) / 2, [SF, oh + SF, T + proud]));
      out.push(box('door-frame', 'frame-r', o1 + SF / 2, (oh + SF) / 2, (T + proud) / 2, [SF, oh + SF, T + proud]));
      out.push(box('door-frame', 'frame-t', (o0 + o1) / 2, oh + SF / 2, (T + proud) / 2, [o1 - o0, SF, T + proud]));
      out.push(box('door-leaf', 'plug', (o0 + o1) / 2, oh / 2, T / 2, [o1 - o0 - 6, oh - 6, T]));
      out.push(box('door-leaf', 'leaf', mid, H / 2, T + proud + SLAB / 2, [W, H, SLAB], { label }));
    } else {
      // The leaf sits flush in a frame proud of the wall by 10 mm, with a dark gasket around it.
      const g = GASKET;
      front = T + 3;
      onWall = T + 10;
      out.push(box('door-frame', 'frame-l', x0 - g - F / 2, (H + g + F) / 2, T / 2 + 5, [F, H + g + F, T + 10]));
      out.push(box('door-frame', 'frame-r', x1 + g + F / 2, (H + g + F) / 2, T / 2 + 5, [F, H + g + F, T + 10]));
      out.push(box('door-frame', 'frame-t', mid, H + g + F / 2, T / 2 + 5, [W + 2 * g, F, T + 10]));
      out.push(box('gasket', 'gasket-l', x0 - g / 2, (H + g) / 2, T / 2 + 2, [g, H + g, T]));
      out.push(box('gasket', 'gasket-r', x1 + g / 2, (H + g) / 2, T / 2 + 2, [g, H + g, T]));
      out.push(box('gasket', 'gasket-t', mid, H + g / 2, T / 2 + 2, [W, g, T]));
      out.push(box('door-leaf', 'leaf', mid, H / 2, T / 2 + 3, [W, H, T], { label }));
      out.push(box('gasket', 'sweep', mid, 15, front + 6, [W - 2 * g, 30, 12]));
    }

    const span = Math.abs(latchEdge - hingeEdge);
    // Hinge bases and the strike sit in the middle of the frame showing beside the leaf.
    const frameMid = mount === 'semi-buried' ? (SEMI_FRAME - SEMI_OVERLAP) / 2 : GASKET + F / 2;
    const inward = -hs; // from the hinge edge toward the latch edge, along u
    // Cam-lift hinges: strap on the leaf, knuckle at the edge, base plate on the wall or frame.
    const hingeFracs = mount === 'semi-buried' ? [0.13, 0.285, 0.895] : [0.13, 0.27, 0.83];
    hingeFracs.forEach((fr, k) => {
      const v = leafTop * (1 - fr);
      out.push(box('hinge', `hinge-${k + 1}`, hingeEdge + inward * 120, v, front + 9, [240, 42, 18]));
      out.push(pin(`pin-${k + 1}`, hingeEdge + hs * 18, v, front + 6, 16, 120));
      out.push(box('hinge', `hinge-base-${k + 1}`, hingeEdge + hs * frameMid, v, onWall + (front - onWall) / 2, [40, 130, front - onWall + 12]));
      out.push(box('hinge', `hinge-arm-${k + 1}`, hingeEdge + (hs * frameMid) / 2, v, front - 8, [frameMid, 30, 16]));
    });

    // Latch handle about mid height on the latch side, strike on the wall or frame.
    const lv = leafTop * 0.53;
    out.push(box('handle', 'handle', latchEdge - inward * 175, lv, front + 48, [240, 26, 26], { color: handle }));
    out.push(box('handle', 'handle-post-1', latchEdge - inward * 70, lv, front + 22, [22, 22, 44], { color: handle }));
    out.push(box('handle', 'handle-post-2', latchEdge - inward * 280, lv, front + 22, [22, 22, 44], { color: handle }));
    out.push(box('latch', 'latch', latchEdge - inward * 28, lv, front + 26, [60, 110, 52]));
    out.push(box('latch', 'strike', latchEdge + inward * frameMid, lv, onWall + (front - onWall) / 2 + 10, [50, 90, front - onWall + 30]));

    // Self closer (standard on these doors): vertical body across the top edge, latch side.
    const cu = hingeEdge + inward * span * (mount === 'semi-buried' ? 0.84 : 0.8);
    out.push(box('latch', 'self-closer', cu, leafTop - 10, front + 22, [42, 170, 44], { label: 'Self closer' }));
    out.push(box('latch', 'self-closer-base', cu, leafTop + 50, onWall + 12, [70, 50, 24]));

    // Brand badge high on the leaf; higher when a window takes its place.
    const badgeV = d.window ? leafTop * (1 - 0.09) : leafTop * (1 - 0.2);
    // Logo proportions (422 × 270); the logo goes on the front face.
    out.push(box('badge', 'badge', mid, badgeV, front + 2, [150, 96, 4], { color: DARK, label: 'Badge', logo: true }));

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

  if (fam.kind === 'glass') return glassParts(d, box, label, T, H, x0, x1);

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

/** Colours per glass series and finish, read off the ICC Glass Doors photos. */
function glassColors(series: string, finish: string) {
  if (finish === 'AN') {
    return series === 'signature'
      ? { frame: '#c8ccd0', door: '#c8ccd0', frit: '#d3d6d8', rail: '#8f959b', handle: '#d2d6da' }
      : { frame: '#b9bec3', door: '#c4c8cc', frit: '#c4c8cc', rail: '#6d7378', handle: '#c9cdd1' };
  }
  if (series === 'select') return { frame: '#141516', door: '#0f1011', frit: '#0f1011', rail: '#2a2c2e', handle: '#0f1011' };
  if (series === 'signature') return { frame: '#1c1e20', door: '#1c1e20', frit: '#3b423f', rail: '#2c3033', handle: '#17181a' };
  return { frame: '#222426', door: '#1c1e20', frit: '#1c1e20', rail: '#34373a', handle: '#1c1e20' };
}

/**
 * Glass display door unit: aluminum outer frame, 2 or 3 doors, heater rails
 * top and bottom with hinge pins, glass, handles and a small white logo on the
 * last door. Hinges: 2-door units open from the centre (left door hinged left,
 * right door hinged right); 3-door units hinge left, right, right, as the
 * photos show.
 */
function glassParts(
  d: Door,
  box: (kind: BoxKind, name: string, u: number, v: number, w: number, size: Vec3, extra?: Partial<BoxPart>) => BoxPart,
  label: string,
  T: number,
  H: number,
  x0: number,
  x1: number,
): Part[] {
  const out: Part[] = [];
  const g = d.glass;
  const s = getGlassSeries(g.series);
  const col = glassColors(g.series, g.finish);
  const FG = GLASS_FRAME;
  const fw = T + 15; // front face of the outer frame and doors
  const depth = T + 15;

  // Outer frame
  out.push(box('door-frame', 'g-frame-l', x0 + FG / 2, H / 2, depth / 2, [FG, H, depth], { color: col.frame, label }));
  out.push(box('door-frame', 'g-frame-r', x1 - FG / 2, H / 2, depth / 2, [FG, H, depth], { color: col.frame, label }));
  out.push(box('door-frame', 'g-frame-t', (x0 + x1) / 2, H - FG / 2, depth / 2, [x1 - x0 - 2 * FG, FG, depth], { color: col.frame, label }));
  out.push(box('door-frame', 'g-frame-b', (x0 + x1) / 2, FG / 2, depth / 2, [x1 - x0 - 2 * FG, FG, depth], { color: col.frame, label }));
  // Heater rails just inside the frame, top and bottom
  out.push(box('trim', 'g-rail-t', (x0 + x1) / 2, H - FG - 9, fw - 12, [x1 - x0 - 2 * FG, 18, 20], { color: col.rail }));
  out.push(box('trim', 'g-rail-b', (x0 + x1) / 2, FG + 9, fw - 12, [x1 - x0 - 2 * FG, 18, 20], { color: col.rail }));

  const DW = s.doorWidth;
  const DH = s.doorHeight;
  const dv0 = FG;
  const r = s.doorFrame === 'pvc' ? 45 : s.doorFrame === 'aluminum' ? 28 : 0;
  const hingeSides: ('left' | 'right')[] = g.count === 2 ? ['left', 'right'] : ['left', 'right', 'right'];

  for (let i = 0; i < g.count; i++) {
    const du0 = x0 + FG + i * DW;
    const du1 = du0 + DW;
    const dm = (du0 + du1) / 2;
    const vm = dv0 + DH / 2;
    const gw = fw - 20; // glass centre
    const n = `g${i + 1}`;
    // Hinge pin: the small white square in the photos, at the top corner on each door's hinge side.
    const pinU = hingeSides[i] === 'left' ? du0 + 8 : du1 - 8;
    out.push(box('trim', `${n}-pin`, pinU, H - FG / 2, fw + 2, [10, 10, 4], { color: '#f2f2f2', label: 'Hinge' }));

    if (r > 0) {
      out.push(box('door-leaf', `${n}-stile-l`, du0 + r / 2, vm, fw - 20, [r, DH, 40], { color: col.door, label }));
      out.push(box('door-leaf', `${n}-stile-r`, du1 - r / 2, vm, fw - 20, [r, DH, 40], { color: col.door, label }));
      out.push(box('door-leaf', `${n}-top`, dm, dv0 + DH - r / 2, fw - 20, [DW - 2 * r, r, 40], { color: col.door, label }));
      out.push(box('door-leaf', `${n}-bottom`, dm, dv0 + r / 2, fw - 20, [DW - 2 * r, r, 40], { color: col.door, label }));
      out.push(box('glass', `${n}-glass`, dm, vm, gw, [DW - 2 * r, DH - 2 * r, 24], { label }));
    } else {
      // Frameless: glass edge to edge with a printed border.
      const rf = 22;
      out.push(box('glass', `${n}-glass`, dm, vm, gw, [DW - 6, DH - 6, 24], { label }));
      const fz = gw + 13;
      out.push(box('trim', `${n}-frit-l`, du0 + 3 + rf / 2, vm, fz, [rf, DH - 6, 2], { color: col.frit }));
      out.push(box('trim', `${n}-frit-r`, du1 - 3 - rf / 2, vm, fz, [rf, DH - 6, 2], { color: col.frit }));
      out.push(box('trim', `${n}-frit-t`, dm, dv0 + DH - 3 - rf / 2, fz, [DW - 6 - 2 * rf, rf, 2], { color: col.frit }));
      out.push(box('trim', `${n}-frit-b`, dm, dv0 + 3 + rf / 2, fz, [DW - 6 - 2 * rf, rf, 2], { color: col.frit }));
    }

    // Handle on the latch edge
    const latchRight = hingeSides[i] === 'left';
    const lu = latchRight ? du1 : du0;
    const intoDoor = latchRight ? -1 : 1;
    if (s.handle === 'full-length') {
      out.push(box('handle', `${n}-handle`, lu + intoDoor * Math.max(r / 2, 14), vm, fw + 14, [22, DH - 240, 26], { color: col.handle }));
    } else {
      const hu = lu + intoDoor * 45;
      const len = inToMm(18);
      out.push(box('handle', `${n}-handle`, hu, vm, fw + 26, [20, len, 20], { color: col.handle }));
      out.push(box('handle', `${n}-standoff-t`, hu, vm + len / 2 - 25, fw + 8, [16, 16, 22], { color: col.handle }));
      out.push(box('handle', `${n}-standoff-b`, hu, vm - len / 2 + 25, fw + 8, [16, 16, 22], { color: col.handle }));
    }

    // White logo, top right of the last door
    if (i === g.count - 1) {
      const inset = Math.max(r, 22) + 70;
      out.push(box('logo', 'g-logo', du1 - inset, dv0 + DH - inset + 10, gw + 13, [125, 80, 1], { logoStyle: 'white' }));
    }
  }
  return out;
}

/**
 * Controller on the outside of its wall, after the ICC product photos.
 * ICC-TSC2000: black housing with a teal bumper ring, black glass face with
 * the segment display and five touch buttons, cable and gland underneath.
 * ICC-TC1000: dark grey panel controller with a raised bezel.
 */
function controlParts(c: Compartment, def: NonNullable<ReturnType<typeof getControl>>, f: WallFrame, fTop: number): Part[] {
  const T = c.wallThickness;
  const rot = Math.atan2(f.n[0], f.n[1]);
  const u = c.control.offset;
  const v = c.control.height;
  const at = (du: number, dv: number, w: number): Vec3 => [
    f.origin[0] + f.u[0] * (u + du) + f.n[0] * w,
    fTop + v + dv,
    f.origin[1] + f.u[1] * (u + du) + f.n[1] * w,
  ];
  const id = (s: string) => `${c.id}:control:${s}`;
  const label = `${def.label} ${def.sku}`;
  const W = def.width;
  const H = def.height;
  const D = def.depth;
  const out: Part[] = [];
  if (def.id === 'TSC2000') {
    out.push({ kind: 'control-body', id: id('ring'), center: at(0, 0, T + D * 0.35), size: [W, H, D * 0.7], rotationY: rot, color: '#3bb6c6', label });
    out.push({ kind: 'control-body', id: id('body'), center: at(0, 0, T + D * 0.55), size: [W - 10, H - 10, D * 0.9], rotationY: rot, color: '#16181b', label });
    out.push({ kind: 'screen', id: id('face'), center: at(0, 0, T + D + 0.5), size: [W - 18, H - 18, 1], rotationY: rot, screen: 'TSC2000', label });
    // Cable and gland underneath
    out.push({ kind: 'cable', id: id('cable'), center: at(0, -H / 2 - 32, T + 14), radius: 4, height: 64, label });
    out.push({ kind: 'cable', id: id('gland'), center: at(0, -H / 2 - 70, T + 14), radius: 11, height: 16, label });
  } else {
    out.push({ kind: 'control-body', id: id('bezel'), center: at(0, 0, T + D / 2), size: [W, H, D], rotationY: rot, color: '#2b2e33', label });
    out.push({ kind: 'screen', id: id('face'), center: at(0, 0, T + D + 0.5), size: [W - 8, H - 8, 1], rotationY: rot, screen: 'TC1000', label });
  }
  return out;
}

const STEEL = '#1b1c1e';

/**
 * Heavy duty shelving, after the ICC product sheet: perforated posts with foot
 * plates and retainer brackets, wire shelves (a flat panel with a mesh
 * texture), a price tag strip on each shelf, diagonal side braces, stabilizer
 * bars along the top, and gravity flow trays where chosen.
 * Local frame: x along the run, z toward the shelves' front, y up.
 */
function shelvingParts(c: Compartment, u: Compartment['accessories']['shelving'][number], b: { cx: number; cy: number }, fTop: number): Part[] {
  const out: Part[] = [];
  const f = facingVector(u.facing);
  const a: Vec2 = [f[1], -f[0]];
  const rot = Math.atan2(f[0], f[1]);
  const { width: W, depth: D } = shelvingSize(u);
  const P = SHELVING.post;
  const SW = SHELVING.shelfWidth;
  const SD = D - P;
  const id = (s: string) => `${c.id}:shelf-${u.id}:${s}`;
  const label = `Shelving ${u.id.replace('sh', 'S')} · ${SHELVING.sku}`;
  const at = (lx: number, lz: number, y: number): Vec3 => [u.x - b.cx + a[0] * lx + f[0] * lz, fTop + y, u.y - b.cy + a[1] * lx + f[1] * lz];
  const box = (kind: BoxKind, name: string, lx: number, lz: number, y: number, size: Vec3, extra: Partial<BoxPart> = {}): BoxPart => ({
    kind,
    id: id(name),
    center: at(lx, lz, y),
    size,
    rotationY: rot,
    color: STEEL,
    label,
    ...extra,
  });

  const H = u.postHeight;
  const postX = (i: number) => -W / 2 + P / 2 + i * BAY_PITCH;
  const zFront = D / 2 - P / 2;
  // Posts, foot plates, retainer brackets
  for (let i = 0; i <= u.bays; i++) {
    for (const [side, z] of [['f', zFront], ['b', -zFront]] as const) {
      const x = postX(i);
      out.push(box('shelf-post', `post-${i}${side}`, x, z, H / 2, [P, H, P]));
      out.push(box('shelf-bracket', `foot-${i}${side}`, x, z + (side === 'f' ? 12 : -12), 2, [P + 26, 4, P + 40]));
      out.push(box('shelf-bracket', `retainer-${i}${side}`, x, z, H - 18, [P + 10, 36, P + 10], { label: 'Post retainer bracket' }));
    }
  }
  // Stabilizer bars along the top, front and back
  out.push(box('shelf-bar', 'stabilizer-f', 0, zFront, H - 70, [W - P, 12, 12], { label: 'Stabilizer bar' }));
  out.push(box('shelf-bar', 'stabilizer-b', 0, -zFront, H - 70, [W - P, 12, 12], { label: 'Stabilizer bar' }));

  const heights = shelfHeights(u);
  // Diagonal side braces: lower half and upper half, alternating direction
  const lowMid = heights[Math.floor((heights.length - 1) / 2)];
  const spans: [number, number, number][] = [
    [heights[0] + 40, lowMid - 40, 1],
    [lowMid + 40, heights[heights.length - 1] - 40, -1],
  ];
  for (let i = 0; i <= u.bays; i++) {
    spans.forEach(([y1, y2, dir], k) => {
      if (y2 - y1 < 80) return;
      const dz = (zFront - P / 2) * 2 * dir;
      const dy = y2 - y1;
      const len = Math.hypot(dz, dy);
      out.push(box('shelf-brace', `brace-${i}-${k}`, postX(i), 0, (y1 + y2) / 2, [16, len, 10], { rotationX: Math.atan2(dz, dy), label: 'Side brace' }));
    });
  }

  // Shelves
  const tilt = SHELVING.gravityTilt;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  for (let j = 0; j < u.bays; j++) {
    const cx = -W / 2 + P + SW / 2 + j * BAY_PITCH;
    heights.forEach((y, k) => {
      const gravity = u.gravity.includes(gravityKey(j, k));
      const n = `${j}-${k}`;
      if (!gravity) {
        out.push(box('shelf-wire', `shelf-${n}`, cx, 0, y, [SW, 10, SD], { color: undefined }));
        out.push(box('price-tag', `tag-${n}`, cx, SD / 2 + 3, y - 14, [SW, 32, 3], { color: undefined, label: 'Price tag holder' }));
        return;
      }
      // Gravity flow: the shelf tips down toward the front; bed, lane dividers and a front stop ride on it.
      const tilted = (h: number, z: number): [number, number] => [y + h * cos - z * sin, h * sin + z * cos];
      const glabel = `${SHELVING.gravityLabel} (${label})`;
      out.push(box('shelf-wire', `shelf-${n}`, cx, 0, y, [SW, 10, SD], { color: undefined, rotationX: tilt, label: glabel }));
      {
        const [yy, zz] = tilted(10, 0);
        out.push(box('gravity-bed', `bed-${n}`, cx, zz, yy, [SW - 16, 8, SD - 10], { color: '#2a2d30', rotationX: tilt, label: glabel }));
      }
      // Lane dividers are wire loops: a rod running front to back and an upright at the front.
      const lanes = Math.round((SW - 16) / inToMm(3.5));
      for (let l = 0; l <= lanes; l++) {
        const lx = cx - (SW - 16) / 2 + ((SW - 16) * l) / lanes;
        const [yy, zz] = tilted(58, -20);
        out.push(box('gravity-divider', `div-${n}-${l}`, lx, zz, yy, [4, 4, SD - 70], { color: '#d6dadd', rotationX: tilt, label: glabel }));
        const [y2, z2] = tilted(34, SD / 2 - 55);
        out.push(box('gravity-divider', `div-up-${n}-${l}`, lx, z2, y2, [4, 48, 4], { color: '#d6dadd', rotationX: tilt, label: glabel }));
      }
      {
        const [yy, zz] = tilted(36, SD / 2 - 8);
        out.push(box('gravity-divider', `stop-${n}`, cx, zz, yy, [SW - 16, 6, 6], { color: '#d6dadd', rotationX: tilt, label: glabel }));
        const [y2, z2] = tilted(14, SD / 2 - 8);
        out.push(box('gravity-divider', `stop-low-${n}`, cx, z2, y2, [SW - 16, 6, 6], { color: '#d6dadd', rotationX: tilt, label: glabel }));
      }
      out.push(box('price-tag', `tag-${n}`, cx, SD / 2 + 3, y - 14 - (SD / 2) * sin, [SW, 32, 3], { color: undefined, label: 'Price tag holder' }));
    });
  }
  return out;
}
