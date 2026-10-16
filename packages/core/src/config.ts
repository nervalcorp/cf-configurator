/**
 * Configuration: the single serialisable object that describes a walk-in.
 * Saved drafts, share links, quotes and undo history are all snapshots of it.
 * Lengths are mm. `schema` is bumped on breaking changes; see `migrate()`.
 */
import { inToMm } from './units';
import type { ShapeId } from './layout/shapes';

export const SCHEMA_VERSION = 1;

export type SiteType = 'indoor' | 'outdoor';
export type Temperature = 'cooler' | 'freezer';
export type FloorType = 'standard' | 'durafloor' | 'recessed' | 'none';
export type RampType = 'interior' | 'exterior' | 'none';
export type HingeSide = 'left' | 'right';
export type ExteriorFinish =
  | 'stucco-aluminum'
  | 'stucco-galvanized'
  | 'stucco-stainless'
  | 'stainless'
  | 'white'
  | 'custom';

export interface DoorParams {
  /** Clear opening width. */
  width: number;
  /** Distance from the inner edge of the left corner post to the door opening. */
  offset: number;
  hinge: HingeSide;
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
  height: number;
  wallThickness: number;
  door: DoorParams;
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
  /** Shortest door wall we will build a door into. */
  doorWallMin: inToMm(72),
  doorFrame: inToMm(2),
  doorThickness: inToMm(5),
  /** Door leaf height cap (6' 8"). */
  doorMaxHeight: inToMm(80),
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
    door: { width: inToMm(34), offset: inToMm(19), hinge: 'right' },
    finishes: {
      exterior: 'stucco-aluminum',
      exteriorColor: FINISH_COLORS['stucco-aluminum'],
      floor: 'standard',
    },
    accessories: { ramp: 'interior' },
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
 */
export function migrate(input: unknown): Configuration {
  if (!input || typeof input !== 'object') throw new Error('Not a configuration file.');
  const raw = input as Partial<Configuration>;
  if (raw.schema === SCHEMA_VERSION && Array.isArray(raw.compartments) && raw.site) {
    const base = defaultCompartment();
    return {
      schema: SCHEMA_VERSION,
      site: { type: raw.site.type === 'outdoor' ? 'outdoor' : 'indoor' },
      compartments: raw.compartments.map((c, i) => ({
        ...base,
        ...c,
        id: c.id ?? `c${i + 1}`,
        door: { ...base.door, ...c.door },
        finishes: { ...base.finishes, ...c.finishes },
        accessories: { ...base.accessories, ...c.accessories },
      })),
    };
  }
  throw new Error(`Unsupported configuration schema: ${String(raw.schema)}.`);
}
