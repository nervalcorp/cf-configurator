/**
 * Walls: which edge is the front, how walls are lettered, where each wall's
 * inside run starts and which way it faces. Everything that places something
 * on a wall (doors now; glass doors, shelving and lights later) goes through
 * wallFrames() so they all agree on the same coordinates.
 */
import { type Polygon, type Vec2, edgeLength, edgeNormal, isClockwise } from '../geometry';

/**
 * The front wall: the longest edge that runs along x and faces +y (front).
 * Uses winding, not the centroid, so it does not jump while a notch is dragged.
 * Wall lettering starts here.
 */
export function findFrontEdge(poly: Polygon): number {
  const cw = isClockwise(poly);
  let best = -1;
  let bestLen = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (Math.abs(dx) <= Math.abs(dy) * 2) continue;
    const [, ny] = edgeNormal(a, b, cw);
    const len = edgeLength(a, b);
    if (ny > 0.5 && len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  return best >= 0 ? best : 0;
}

/** @deprecated Use findFrontEdge. Kept for the v1 vocabulary. */
export const findDoorEdge = findFrontEdge;

/** Outside length of the front wall. */
export function doorWallLength(poly: Polygon): number {
  const i = findFrontEdge(poly);
  return edgeLength(poly[i], poly[(i + 1) % poly.length]);
}

/**
 * One letter per wall, counter-clockwise on the plan starting with A at the
 * front wall: front A, then the wall to its right (seen from outside) B, and on.
 */
export function wallLetter(edgeIdx: number, front: number, n: number): string {
  return String.fromCharCode(65 + ((front - edgeIdx + n) % n));
}

/** Joint 1 is the left end of the front wall (min x), then counter-clockwise. */
export function jointNumber(vertIdx: number, poly: Polygon, front: number): number {
  const n = poly.length;
  const a = poly[front];
  const b = poly[(front + 1) % n];
  const leftVert = a[0] < b[0] ? front : (front + 1) % n;
  return ((leftVert - vertIdx + n) % n) + 1;
}

/** Inward direction of the corner post at each vertex, as signs on x and y. */
export function postSigns(poly: Polygon): Vec2[] {
  const n = poly.length;
  const cw = isClockwise(poly);
  return poly.map((p, i) => {
    const n1 = edgeNormal(poly[(i - 1 + n) % n], p, cw);
    const n2 = edgeNormal(p, poly[(i + 1) % n], cw);
    const ix = -(n1[0] + n2[0]);
    const iy = -(n1[1] + n2[1]);
    return [Math.sign(Math.round(ix * 1e6)), Math.sign(Math.round(iy * 1e6))] as Vec2;
  });
}

export interface WallFrame {
  edge: number;
  letter: string;
  /** Inside face, at the left end of the inside run (seen from outside), in footprint coords. */
  origin: Vec2;
  /** Unit vector along the wall, left → right seen from outside. */
  u: Vec2;
  /** Unit outward normal. */
  n: Vec2;
  /** Inside run between corner posts: the length a panel or door can use. */
  length: number;
  /** Outside face length, corner to corner. */
  outsideLength: number;
}

/**
 * Wall frames for a footprint with corner posts of size T. The run of each
 * wall stops at the posts, matching how panels are built.
 */
export function wallFrames(poly: Polygon, T: number): WallFrame[] {
  const n = poly.length;
  const cw = isClockwise(poly);
  const front = findFrontEdge(poly);
  const signs = postSigns(poly);
  return poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const len = edgeLength(a, b);
    const e: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const nrm = edgeNormal(a, b, cw);
    // Right-hand side when standing outside facing the wall.
    const u: Vec2 = [nrm[1], -nrm[0]];
    const sA = signs[i][0] * e[0] + signs[i][1] * e[1];
    const sB = signs[(i + 1) % n][0] * e[0] + signs[(i + 1) % n][1] * e[1];
    const s: Vec2 = sA > 0 ? [a[0] + e[0] * T, a[1] + e[1] * T] : a;
    const t: Vec2 = sB < 0 ? [b[0] - e[0] * T, b[1] - e[1] * T] : b;
    const forward = u[0] * e[0] + u[1] * e[1] > 0;
    const start = forward ? s : t;
    return {
      edge: i,
      letter: wallLetter(i, front, n),
      origin: [start[0] - nrm[0] * T, start[1] - nrm[1] * T],
      u,
      n: nrm,
      length: edgeLength(s, t),
      outsideLength: len,
    };
  });
}

/** Point on a wall: `along` from the frame origin, `out` from the inside face toward outside. */
export function wallPoint(f: WallFrame, along: number, out: number): Vec2 {
  return [f.origin[0] + f.u[0] * along + f.n[0] * out, f.origin[1] + f.u[1] * along + f.n[1] * out];
}
