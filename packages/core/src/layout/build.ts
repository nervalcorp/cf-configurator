/**
 * buildCompartment: params in, component tree out.
 *
 * This is the icoolaca build() with the Three.js calls taken out. Every
 * component is plain data in mm, so the same tree can feed the 3D view, the
 * floor plan, the part list and (later) the PDF, and it can be unit-tested.
 *
 * World space (mm): X = footprint x, Z = footprint y (front = +Z), Y up.
 * The footprint is centred on its bounding box. The floor slab runs from
 * y = 0 to y = floorTop; walls start at floorTop.
 */
import type { Compartment, SiteType } from '../config';
import { LIMITS } from '../config';
import { type Vec2, bounds, edgeLength, edgeNormal, isClockwise, isInsideCorner } from '../geometry';
import { formatInches } from '../units';
import { footprint } from './shapes';
import { findDoorEdge, jointNumber, panelLetter } from './walls';

export type Vec3 = readonly [number, number, number];
export type Face = '+x' | '-x' | '+z' | '-z';

interface Base {
  id: string;
  /** Shown on hover and in the part list, e.g. "Panel C" or "Joint 3". */
  label?: string;
}

export interface BoxPart extends Base {
  kind: 'post' | 'panel' | 'door-leaf' | 'door-frame' | 'threshold' | 'hinge';
  center: Vec3;
  size: Vec3;
  /** Which face carries the exterior finish. Omitted = no exterior face. */
  exteriorFace?: Face;
  letter?: string;
  joint?: number;
  edgeIndex?: number;
}

export interface CylinderPart extends Base {
  kind: 'hinge-pin';
  center: Vec3;
  radius: number;
  height: number;
}

/** A flat polygon extruded upward: floor slab or roof. */
export interface SlabPart extends Base {
  kind: 'floor' | 'roof';
  polygon: Vec2[];
  y: number;
  thickness: number;
}

/** A 2D profile in a wall's own x/y, extruded along +Z. Used for door-wall panels. */
export interface ProfilePart extends Base {
  kind: 'door-wall';
  letter: string;
  edgeIndex: number;
  /** Profile in local x (along the wall) and y (up). */
  profile: Vec2[];
  /** World position of the profile's (0,0) on its back (−Z) face. */
  origin: Vec3;
  thickness: number;
  exteriorFace: '+z' | '-z';
}

export type Part = BoxPart | CylinderPart | SlabPart | ProfilePart;

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
  /** Outside length of the wall segment. */
  length: number;
  height: number;
  hasDoor: boolean;
}

export interface ComponentTree {
  compartmentId: string;
  /** Centred footprint (outside face). */
  footprint: Vec2[];
  doorEdge: number;
  overall: { width: number; depth: number; height: number };
  floorTop: number;
  wallHeight: number;
  parts: Part[];
  dimensions: Dimension[];
  walls: WallSummary[];
}

/** Gap between touching parts so faces never z-fight. */
const EP = 0.5;

export function buildCompartment(c: Compartment, site: SiteType): ComponentTree {
  const raw = footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);
  const doorEdge = findDoorEdge(raw);
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
  const wallY = fTop + EP + wallH / 2;

  const parts: Part[] = [];
  const dimensions: Dimension[] = [];
  const walls: WallSummary[] = [];

  if (hasFloor) {
    parts.push({ kind: 'floor', id: `${c.id}:floor`, label: 'Floor', polygon: fp, y: 0, thickness: floorT });
  }
  if (site === 'outdoor') {
    parts.push({ kind: 'roof', id: `${c.id}:roof`, label: 'Roof', polygon: fp, y: fTop + wallH, thickness: T });
  }

  // ── Corner posts ──
  interface Post { x: number; z: number; px: number; pz: number; signX: number; signZ: number }
  const posts: Post[] = [];
  for (let i = 0; i < n; i++) {
    const p = fp[i];
    const n1 = edgeNormal(fp[(i - 1 + n) % n], p, cw);
    const n2 = edgeNormal(p, fp[(i + 1) % n], cw);
    let ix = -(n1[0] + n2[0]);
    let iz = -(n1[1] + n2[1]);
    const il = Math.hypot(ix, iz) || 1;
    ix /= il;
    iz /= il;
    const signX = Math.sign(Math.round(ix * 1e6));
    const signZ = Math.sign(Math.round(iz * 1e6));
    const post: Post = { x: p[0] + (signX * T) / 2, z: p[1] + (signZ * T) / 2, px: p[0], pz: p[1], signX, signZ };
    posts.push(post);
    const joint = jointNumber(i, raw, doorEdge);
    parts.push({
      kind: 'post',
      id: `${c.id}:joint-${joint}`,
      label: `Joint ${joint}${isInsideCorner(fp, i) ? ' (inside)' : ''}`,
      joint,
      center: [post.x, fTop + EP + wallH / 2, post.z],
      size: [T, wallH, T],
    });
  }

  // ── Plain wall panels between posts ──
  for (let i = 0; i < n; i++) {
    const a = fp[i];
    const bb = fp[(i + 1) % n];
    const letter = panelLetter(i, doorEdge, n);
    if (i === doorEdge) continue;
    const pA = posts[i];
    const pB = posts[(i + 1) % n];
    const [nx, nz] = edgeNormal(a, bb, cw);
    const horizontal = Math.abs(bb[0] - a[0]) >= Math.abs(bb[1] - a[1]);
    walls.push({ letter, edgeIndex: i, length: edgeLength(a, bb), height: c.height, hasDoor: false });

    if (horizontal) {
      const forward = pA.px < pB.px;
      const aIn = forward ? pA.x + T / 2 : pA.x - T / 2;
      const bIn = forward ? pB.x - T / 2 : pB.x + T / 2;
      const x1 = Math.min(aIn, bIn) + EP;
      const x2 = Math.max(aIn, bIn) - EP;
      if (x2 - x1 < 3) continue;
      parts.push({
        kind: 'panel',
        id: `${c.id}:panel-${letter}`,
        label: `Panel ${letter}`,
        letter,
        edgeIndex: i,
        center: [(x1 + x2) / 2, wallY, (a[1] + bb[1]) / 2 - (nz * T) / 2],
        size: [x2 - x1, wallH, T],
        exteriorFace: nz > 0 ? '+z' : '-z',
      });
    } else {
      const forward = pA.pz < pB.pz;
      const aIn = forward ? pA.z + T / 2 : pA.z - T / 2;
      const bIn = forward ? pB.z - T / 2 : pB.z + T / 2;
      const z1 = Math.min(aIn, bIn) + EP;
      const z2 = Math.max(aIn, bIn) - EP;
      if (z2 - z1 < 3) continue;
      parts.push({
        kind: 'panel',
        id: `${c.id}:panel-${letter}`,
        label: `Panel ${letter}`,
        letter,
        edgeIndex: i,
        center: [(a[0] + bb[0]) / 2 - (nx * T) / 2, wallY, (z1 + z2) / 2],
        size: [T, wallH, z2 - z1],
        exteriorFace: nx > 0 ? '+x' : '-x',
      });
    }
  }

  // ── Door wall: Panel A + door + Panel B ──
  {
    const ea = fp[doorEdge];
    const eb = fp[(doorEdge + 1) % n];
    const [, fnz] = edgeNormal(ea, eb, cw);
    const postL = posts[doorEdge];
    const postR = posts[(doorEdge + 1) % n];
    const innerL = postL.px + postL.signX * T;
    const innerR = postR.px + postR.signX * T;
    const wallLeft = Math.min(innerL, innerR);
    const wallRight = Math.max(innerL, innerR);
    const zMid = (ea[1] + eb[1]) / 2 - (fnz * T) / 2;
    const exteriorFace = fnz > 0 ? '+z' : '-z';

    const frame = LIMITS.doorFrame;
    const doorT = LIMITS.doorThickness;
    const dW = c.door.width;
    const dH = Math.min(wallH - 61, LIMITS.doorMaxHeight);
    // Keep the opening inside the wall even if params say otherwise; validate() reports it.
    const maxOffset = Math.max(frame, wallRight - wallLeft - dW - frame);
    const offset = Math.min(Math.max(c.door.offset, frame), maxOffset);
    const doorLeft = wallLeft + offset;
    const doorRight = doorLeft + dW;
    const doorCX = doorLeft + dW / 2;

    const wallLen = edgeLength(ea, eb);
    walls.push({ letter: 'A', edgeIndex: doorEdge, length: doorCX - (ea[0] < eb[0] ? ea[0] : eb[0]), height: c.height, hasDoor: true });
    walls.push({ letter: 'B', edgeIndex: doorEdge, length: wallLen - walls[walls.length - 1].length, height: c.height, hasDoor: true });

    // Panel A: full height to the left of the frame, plus the header to door centre.
    const lx0 = wallLeft + EP;
    const fullA = doorLeft - frame - lx0;
    const totalA = doorCX - lx0;
    if (totalA > 3) {
      const profile: Vec2[] = [[0, 0]];
      if (fullA > 3) profile.push([fullA, 0], [fullA, dH]);
      else profile[0] = [0, dH];
      profile.push([totalA, dH], [totalA, wallH], [0, wallH]);
      parts.push({
        kind: 'door-wall',
        id: `${c.id}:panel-A`,
        label: 'Panel A',
        letter: 'A',
        edgeIndex: doorEdge,
        profile,
        origin: [lx0, fTop + EP, zMid - T / 2],
        thickness: T,
        exteriorFace,
      });
    }

    // Panel B: mirror of A.
    const rx0 = doorCX;
    const rx2 = wallRight - EP;
    const totalB = rx2 - rx0;
    const fullB = rx2 - (doorRight + frame);
    if (totalB > 3) {
      const profile: Vec2[] = [[0, dH], [0, wallH], [totalB, wallH], [totalB, 0]];
      if (fullB > 3) profile.push([totalB - fullB, 0], [totalB - fullB, dH]);
      else profile[3] = [totalB, dH];
      parts.push({
        kind: 'door-wall',
        id: `${c.id}:panel-B`,
        label: 'Panel B',
        letter: 'B',
        edgeIndex: doorEdge,
        profile,
        origin: [rx0, fTop + EP, zMid - T / 2],
        thickness: T,
        exteriorFace,
      });
    }

    // Frame, threshold, leaf, hinges.
    for (const s of [-1, 1]) {
      parts.push({
        kind: 'door-frame',
        id: `${c.id}:door-frame-${s < 0 ? 'l' : 'r'}`,
        center: [doorCX + s * (dW / 2 + frame / 2), fTop + dH / 2, zMid],
        size: [frame, dH, doorT],
      });
    }
    parts.push({ kind: 'door-frame', id: `${c.id}:door-frame-top`, center: [doorCX, fTop + dH + frame / 2, zMid], size: [dW + frame * 2, frame, doorT] });
    parts.push({ kind: 'threshold', id: `${c.id}:threshold`, center: [doorCX, fTop + 9, zMid], size: [dW + frame * 2, 18, doorT] });
    parts.push({ kind: 'door-leaf', id: `${c.id}:door`, label: `Door ${formatInches(dW)}`, center: [doorCX, fTop + dH / 2, zMid], size: [dW, dH, doorT] });

    const hingeX = c.door.hinge === 'right' ? 1 : -1;
    const hwZ = zMid + fnz * (doorT / 2 + 3);
    [0.85, 0.5, 0.15].forEach((pct, k) => {
      const y = fTop + dH * pct;
      parts.push({ kind: 'hinge', id: `${c.id}:hinge-${k + 1}`, center: [doorCX + hingeX * (dW / 2 - 46), y, hwZ], size: [137, 43, 8] });
      parts.push({ kind: 'hinge-pin', id: `${c.id}:hinge-pin-${k + 1}`, center: [doorCX + hingeX * (dW / 2 + 24), y, hwZ], radius: 9, height: 49 });
    });
  }

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

  return {
    compartmentId: c.id,
    footprint: fp,
    doorEdge,
    overall: { width: b.width, depth: b.depth, height: c.height + fTop },
    floorTop: fTop,
    wallHeight: wallH,
    parts,
    dimensions,
    walls: walls.sort((x, y) => x.letter.localeCompare(y.letter)),
  };
}
