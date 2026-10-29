/**
 * Configuration: the single serialisable object that describes a walk-in.
 * Saved drafts, share links, quotes and undo history are all snapshots of it.
 * Lengths are mm. `schema` is bumped on breaking changes; see `migrate()`.
 */
import { inToMm } from './units';
import type { ShapeId } from './layout/shapes';
import type { ControlModel, DoorFamilyId, GlassParams, HandleId, ManSeries, TrafficFinish } from './catalog';

export const SCHEMA_VERSION = 8;

export type SiteType = 'indoor' | 'outdoor';
export type Temperature = 'cooler' | 'freezer';
export type FloorType = 'standard' | 'durafloor' | 'recessed' | 'none';
/** Interior ramps are on hold (open question); only the exterior ramp is offered. */
export type RampType = 'exterior' | 'none';
export type HingeSide = 'left' | 'right';
export type Swing = 'out' | 'in';
export type ExteriorFinish = 'white' | 'grey-white' | 'decal' | 'custom';

/** Logo decal tiled over the outside of the walls. */
export interface DecalParams {
  /** Uploaded image as a data URL; null uses the brand's default logo. */
  image: string | null;
  /** Wall colour behind and between the tiles. */
  background: string;
  /** Width of one tile (logo plus spacing). */
  tile: number;
  /** Tile rotation in degrees. */
  angle: number;
}

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
  /** Glass display door units only. */
  glass: GlassParams;
  /** Glass display door units only: how far the unit is raised off the floor. */
  elevation: number;
}

/** One 1' × 1' checker plate square: wall edge, grid column from the left end, row from the floor. */
export interface CheckerSquare {
  wall: number;
  col: number;
  row: number;
}

/** 0 = shelves face the front wall (+y), 90 = right, 180 = back, 270 = left. */
export type Facing = 0 | 90 | 180 | 270;

/**
 * A run of heavy duty shelving inside a compartment. Position is the centre of
 * its footprint in floor-plan coordinates (mm from the back-left corner of the
 * compartment's bounding box, y toward the front).
 */
export interface ShelvingUnit {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  /** Bays (door openings) side by side. */
  bays: number;
  /** Shelves per bay. */
  levels: number;
  /** Height of the lowest and highest shelf from the floor. */
  bottom: number;
  top: number;
  /** Post height from the floor. */
  postHeight: number;
  /** Shelves fitted with gravity flow trays, as "bay:level" (0-based). */
  gravity: string[];
}

/**
 * An evaporator hung at the ceiling against a wall, blowing into the room.
 * `offset` is the centre along the wall's inside run; `gap` is the clear space
 * between the wall and the back of the unit.
 */
export interface Evaporator {
  id: string;
  model: string;
  wall: number;
  offset: number;
  gap: number;
}

export interface ControlParams {
  model: ControlModel;
  wall: number;
  /** Centre of the controller along the wall's inside run. */
  offset: number;
  /** Centre height from the floor. */
  height: number;
}

export interface Compartment {
  id: string;
  /** Shown on the compartment bar; defaults to "Compartment N". */
  name: string;
  /** Centre of the footprint's bounding box on the site, in mm (x right, z toward the front). */
  position: { x: number; z: number };
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
    decal: DecalParams;
    floor: FloorType;
  };
  /** Accessories tab. */
  accessories: {
    ramp: RampType;
    checker: CheckerSquare[];
    shelving: ShelvingUnit[];
  };
  /** Refrigeration tab: evaporators at the ceiling. */
  evaporators: Evaporator[];
  /** Refrigeration tab: the walk-in controller. */
  control: ControlParams;
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
  decal: {
    /** Largest decal upload, before base64 encoding. */
    maxBytes: 2 * 1024 * 1024,
    types: ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'] as readonly string[],
    tileMin: inToMm(12),
    tileMax: inToMm(60),
  },
} as const;

/** Base colour per finish. For `decal` it is the default background. */
export const FINISH_COLORS: Record<Exclude<ExteriorFinish, 'custom'>, string> = {
  white: '#f0f0f0',
  // CONFIRM: exact Grey White Coated colour.
  'grey-white': '#d6d8da',
  decal: '#ffffff',
};

export const defaultDecal = (): DecalParams => ({
  image: null,
  background: '#ffffff',
  tile: inToMm(12),
  angle: 45,
});

export function defaultCompartment(id = 'c1', name = 'Compartment 1'): Compartment {
  return {
    id,
    name,
    position: { x: 0, z: 0 },
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
      exterior: 'decal',
      exteriorColor: '#ffffff',
      decal: defaultDecal(),
      floor: 'standard',
    },
    accessories: { ramp: 'exterior', checker: [], shelving: [] },
    evaporators: [],
    // Beside door d1 (latch side, hinged right) at eye level.
    control: { model: 'TSC2000', wall: 2, offset: inToMm(8), height: inToMm(60) },
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
    // The ICC-20SS door closer is fitted by default.
    closer: true,
    handle: 'included',
    finish: 'GR',
    glass: { series: 'elite', finish: 'BK', count: 2 },
    elevation: 0,
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
 * v2 → v3: stucco and stainless finishes were retired (they become White
 * Coated) and the logo decal finish was added.
 * v3 → v4: glass door elevation, checker plates and the controller were added;
 * older files get no plates and a controller placed by normalize() (wall -1).
 * v4 → v5: compartments got a name and a site position; the interior ramp was
 * withdrawn (it becomes the exterior ramp).
 * v5 → v6: shelving inside compartments.
 * v6 → v7: the door closer (ICC-20SS) is a fitted part, on by default; older
 * swing doors had it drawn as standard, so they get it switched on.
 * v7 → v8: evaporators.
 */
export function migrate(input: unknown): Configuration {
  if (!input || typeof input !== 'object') throw new Error('Not a configuration file.');
  const raw = input as { schema?: unknown; site?: { type?: string }; compartments?: unknown[] };
  if (![1, 2, 3, 4, 5, 6, 7, SCHEMA_VERSION].includes(raw.schema as number) || !Array.isArray(raw.compartments) || !raw.site) {
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
        doors = (c.doors ?? []).map((d, k) => ({
          ...newDoor(`d${k + 1}`, -1, 0),
          ...d,
          // Before v7 the closer was drawn on every swing door as standard.
          ...((raw.schema as number) < 7 && (d.family === 'man' || d.family === 'pallet') ? { closer: true } : {}),
        }));
      }
      const { door: _legacy, ...rest } = c;
      return {
        ...base,
        ...rest,
        id: c.id ?? `c${i + 1}`,
        name: c.name ?? `Compartment ${i + 1}`,
        position: c.position ?? { x: 0, z: 0 },
        doors,
        finishes: migrateFinishes(base.finishes, c.finishes),
        accessories: {
          ...base.accessories,
          ...c.accessories,
          ramp: (c.accessories?.ramp as string | undefined) === 'none' ? 'none' : 'exterior',
          checker: c.accessories?.checker ?? [],
          shelving: c.accessories?.shelving ?? [],
        },
        evaporators: c.evaporators ?? [],
        // wall -1 asks normalize() to place it beside the first door.
        control: c.control ?? { ...base.control, wall: -1 },
      };
    }),
  };
}

const FINISH_IDS: readonly ExteriorFinish[] = ['white', 'grey-white', 'decal', 'custom'];

function migrateFinishes(base: Compartment['finishes'], f: Partial<Compartment['finishes']> | undefined): Compartment['finishes'] {
  const merged = { ...base, ...f, decal: { ...base.decal, ...f?.decal } };
  if (!FINISH_IDS.includes(merged.exterior)) {
    // Retired stucco / stainless finishes.
    merged.exterior = 'white';
    merged.exteriorColor = FINISH_COLORS.white;
  }
  return merged;
}
