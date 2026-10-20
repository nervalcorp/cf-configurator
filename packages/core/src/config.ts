/**
 * Configuration: the single serialisable object that describes a walk-in.
 * Saved drafts, share links, quotes and undo history are all snapshots of it.
 * Lengths are mm. `schema` is bumped on breaking changes; see `migrate()`.
 */
import { inToMm } from './units';
import type { ShapeId } from './layout/shapes';
import type { DoorFamilyId, HandleId, ManSeries, TrafficFinish } from './catalog';

export const SCHEMA_VERSION = 2;

export type SiteType = 'indoor' | 'outdoor';
export type Temperature = 'cooler' | 'freezer';
export type FloorType = 'standard' | 'durafloor' | 'recessed' | 'none';
export type RampType = 'interior' | 'exterior' | 'none';
export type HingeSide = 'left' | 'right';
export type Swing = 'out' | 'in';
export type ExteriorFinish =
  | 'stucco-aluminum'
  | 'stucco-galvanized'
  | 'stucco-stainless'
  | 'stainless'
  | 'white'
  | 'custom';

export interface Door {
  id: string;
  /** Footprint edge index the door sits in. */
  wall: number;
  /** Distance along the wall's inside run, from its left end seen from outside, to the opening. */
  offset: number;
  family: DoorFamilyId;
  /** Man doors only. */
  series: ManSeries;
  /** Viewport window; only 13478 man doors have window models. */
  window: boolean;
  /** Hinge side seen from outside; slide direction for sliding doors. */
  hinge: HingeSide;
  swing: Swing;
  closer: boolean;
  handle: HandleId;
  /** Traffic doors only. */
  finish: TrafficFinish;
}

export interface Compartment {
  id: string;
  temperature: Temperature;
  /** Footprint (Layout tab). */
  shape: ShapeId;
  boxW: number;
  boxD: number;
  /** Notch size as a fraction of the box, 0–1. */
  notchW: number;
  notchD: number;
  /** Wall panel height (the ceiling panel sits on top). */
  height: number;
  wallThickness: number;
  doors: Door[];
  /** Finishes tab. */
  finishes: {
    exterior: ExteriorFinish;
    /** Hex colour used by the 3D view; for `custom` it is the user's pick. */
    exteriorColor: string;
    floor: FloorType;
  };
  /** Accessories tab. */
  accessories: {
    ramp: RampType;
  };
}

export interface Configuration {
  schema: number;
  site: { type: SiteType };
  compartments: Compartment[];
}

/** Hard limits the rules engine enforces. Inches in comments for reference. */
export const LIMITS = {
  box: { min: inToMm(72), max: inToMm(360), stepIn: 6 },
  height: { min: inToMm(90), max: inToMm(120), stepIn: 2 },
  doorFrame: inToMm(2),
  doorThickness: inToMm(5),
  /** Clear wall between the frames or travel zones of two doors on one wall. */
  doorGap: inToMm(4),
} as const;

export const FINISH_COLORS: Record<Exclude<ExteriorFinish, 'custom'>, string> = {
  'stucco-aluminum': '#c4c8cc',
  'stucco-galvanized': '#9ea3a8',
  'stucco-stainless': '#b8bcc0',
  stainless: '#d0d4d8',
  white: '#f0f0f0',
};

export function defaultCompartment(id = 'c1'): Compartment {
  return {
    id,
    temperature: 'cooler',
    shape: 'rectangle',
    boxW: inToMm(150),
    boxD: inToMm(150),
    notchW: 0.2,
    notchD: 0.2,
    height: inToMm(100),
    wallThickness: inToMm(4),
    // Wall 2 is the front edge of the default rectangle footprint.
    doors: [newDoor('d1', 2, inToMm(19))],
    finishes: {
      exterior: 'stucco-aluminum',
      exteriorColor: FINISH_COLORS['stucco-aluminum'],
      floor: 'standard',
    },
    accessories: { ramp: 'interior' },
  };
}

export function newDoor(id: string, wall: number, offset: number): Door {
  return {
    id,
    wall,
    offset,
    family: 'man',
    series: '3478',
    window: false,
    hinge: 'right',
    swing: 'out',
    closer: false,
    handle: 'included',
    finish: 'GR',
  };
}

export function defaultConfiguration(): Configuration {
  return {
    schema: SCHEMA_VERSION,
    site: { type: 'indoor' },
    compartments: [defaultCompartment()],
  };
}

/**
 * Bring an older saved configuration up to the current schema.
 * Throws on anything it cannot read so a bad file never half-loads.
 *
 * v1 → v2: the single front `door` became a `doors` list on any wall.
 */
export function migrate(input: unknown): Configuration {
  if (!input || typeof input !== 'object') throw new Error('Not a configuration file.');
  const raw = input as { schema?: unknown; site?: { type?: string }; compartments?: unknown[] };
  if ((raw.schema !== 1 && raw.schema !== SCHEMA_VERSION) || !Array.isArray(raw.compartments) || !raw.site) {
    throw new Error(`Unsupported configuration schema: ${String(raw.schema)}.`);
  }
  const base = defaultCompartment();
  return {
    schema: SCHEMA_VERSION,
    site: { type: raw.site.type === 'outdoor' ? 'outdoor' : 'indoor' },
    compartments: raw.compartments.map((item, i) => {
      const c = item as Partial<Compartment> & { door?: { offset?: number; hinge?: HingeSide } };
      let doors: Door[];
      if (raw.schema === 1) {
        // v1 doors were always on the front wall; normalize() moves wall -1 to the front edge.
        doors = [{ ...newDoor('d1', -1, c.door?.offset ?? base.doors[0].offset), hinge: c.door?.hinge ?? 'right' }];
      } else {
        doors = (c.doors ?? []).map((d, k) => ({ ...newDoor(`d${k + 1}`, -1, 0), ...d }));
      }
      const { door: _legacy, ...rest } = c;
      return {
        ...base,
        ...rest,
        id: c.id ?? `c${i + 1}`,
        doors,
        finishes: { ...base.finishes, ...c.finishes },
        accessories: { ...base.accessories, ...c.accessories },
      };
    }),
  };
}
