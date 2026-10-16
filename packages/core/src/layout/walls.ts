/**
 * Door edge, panel lettering and joint numbering. Ported from computeDoorEdge,
 * getPanelLetter and getJointNumber in the icoolaca build.
 */
import { type Polygon, edgeLength, edgeNormal, isClockwise } from '../geometry';

/**
 * The front wall: the longest edge that runs along x and faces +y (front).
 * Uses winding, not the centroid, so it does not jump while a notch is dragged.
 */
export function findDoorEdge(poly: Polygon): number {
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

/** Outside length of the door wall, measured on the footprint. */
export function doorWallLength(poly: Polygon): number {
  const i = findDoorEdge(poly);
  return edgeLength(poly[i], poly[(i + 1) % poly.length]);
}

/**
 * Panel letters, counter-clockwise from the door wall when standing outside
 * facing the door: A (left of door), B (right of door), C, D, E…
 */
export function panelLetter(edgeIdx: number, doorEdge: number, n: number, segment?: 'left' | 'right'): string {
  if (edgeIdx === doorEdge) return segment === 'right' ? 'B' : 'A';
  const offset = (doorEdge - edgeIdx + n) % n;
  return String.fromCharCode(65 + offset + 1);
}

/** Joint 1 is the left end of the door wall (min x), then counter-clockwise. */
export function jointNumber(vertIdx: number, poly: Polygon, doorEdge: number): number {
  const n = poly.length;
  const a = poly[doorEdge];
  const b = poly[(doorEdge + 1) % n];
  const leftVert = a[0] < b[0] ? doorEdge : (doorEdge + 1) % n;
  return ((leftVert - vertIdx + n) % n) + 1;
}
