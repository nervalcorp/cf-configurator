/**
 * Rules: normalize() applies cross-parameter constraints so a configuration is
 * always buildable; validate() reports what still needs the user's attention,
 * tagged with the tab that fixes it (the quote gate sends them there).
 */
import type { Compartment, Configuration } from './config';
import { FINISH_COLORS, LIMITS } from './config';
import { getShape, footprint } from './layout/shapes';
import { doorWallLength } from './layout/walls';
import { formatInches } from './units';

export type TabId = 'layout' | 'finishes' | 'doors' | 'glass' | 'refrigeration' | 'accessories' | 'review';

export interface Issue {
  compartmentId: string;
  tab: TabId;
  severity: 'error' | 'warning';
  message: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function normalizeCompartment(c: Compartment): Compartment {
  const shape = getShape(c.shape);
  const r = shape.range;
  let floor = c.finishes.floor;
  // A freezer always needs an insulated floor.
  if (c.temperature === 'freezer' && floor === 'none') floor = 'standard';
  const exteriorColor =
    c.finishes.exterior === 'custom' ? c.finishes.exteriorColor : FINISH_COLORS[c.finishes.exterior];
  return {
    ...c,
    boxW: clamp(c.boxW, LIMITS.box.min, LIMITS.box.max),
    boxD: clamp(c.boxD, LIMITS.box.min, LIMITS.box.max),
    notchW: shape.notch === 'none' ? c.notchW : clamp(c.notchW, r.nwMin, r.nwMax),
    notchD: shape.notch === 'none' ? c.notchD : clamp(c.notchD, r.ndMin, r.ndMax),
    height: clamp(c.height, LIMITS.height.min, LIMITS.height.max),
    finishes: { ...c.finishes, floor, exteriorColor },
  };
}

export function normalize(config: Configuration): Configuration {
  return { ...config, compartments: config.compartments.map(normalizeCompartment) };
}

export function validateCompartment(c: Compartment): Issue[] {
  const issues: Issue[] = [];
  const fp = footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);
  const wall = doorWallLength(fp);
  const id = c.id;
  if (wall < LIMITS.doorWallMin - 0.01) {
    issues.push({
      compartmentId: id,
      tab: 'layout',
      severity: 'error',
      message: `The door wall is ${formatInches(wall)}. It needs to be at least ${formatInches(LIMITS.doorWallMin)}.`,
    });
  }
  // Clear inside run of the door wall: outside length minus two corner posts.
  const inside = wall - 2 * c.wallThickness;
  const needed = c.door.offset + c.door.width + LIMITS.doorFrame;
  if (needed > inside + 0.01) {
    issues.push({
      compartmentId: id,
      tab: 'doors',
      severity: 'error',
      message: `The ${formatInches(c.door.width)} door at ${formatInches(c.door.offset)} from the corner runs past the end of the wall. Move it left or widen the door wall.`,
    });
  }
  if (c.temperature === 'freezer' && c.finishes.floor === 'none') {
    issues.push({ compartmentId: id, tab: 'finishes', severity: 'error', message: 'A freezer needs a floor.' });
  }
  return issues;
}

export function validate(config: Configuration): Issue[] {
  return config.compartments.flatMap(validateCompartment);
}
