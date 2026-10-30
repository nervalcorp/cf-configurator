/**
 * Product catalog for options that map to real models.
 *
 * Source: the ICC Energy spec-widget catalog (ICC_Door_Catalog.xlsx and the
 * accessory widgets). Those models are still being audited against the master
 * lineup, so every value here is provisional. The Phase 6 admin console will
 * replace this file with catalog data from the backend.
 *
 * Assumptions to confirm are marked CONFIRM.
 */
import type { Temperature } from './config';
import { inToMm } from './units';

export const CATALOG_SOURCE = 'ICC spec-widget catalog (models under audit)';

export type DoorKind = 'swing' | 'slide' | 'rollup' | 'traffic' | 'glass';
/**
 * How a swing door sits in the wall.
 * semi-buried: the leaf and part of its body stand proud of the wall, overlapping the opening.
 * full-buried: the leaf sits in a frame, flush or nearly flush with the outside wall face.
 */
export type DoorMount = 'semi-buried' | 'full-buried';
export type DoorFamilyId =
  | 'man'
  | 'pallet'
  | 'slide-pallet'
  | 'slide-forklift'
  | 'rollup'
  | 'traffic-single'
  | 'traffic-double'
  | 'glass';
export type ManSeries = '3478' | '13478';
export type HandleId = 'included' | 'ICC-P4' | 'ICC-W58BL' | 'ICC-W58BR' | 'ICC-38';
export type TrafficFinish = 'GR' | 'WH' | 'BK';
export type GlassSeries = 'select' | 'elite' | 'signature';
/** BK = black; AN = anodized (Elite); SV = anodized (Signature's model code). Select is glossy black only. */
export type GlassFinish = 'BK' | 'AN';
export type GlassCount = 2 | 3;

export interface GlassParams {
  series: GlassSeries;
  finish: GlassFinish;
  count: GlassCount;
}

export interface DoorFamily {
  id: DoorFamilyId;
  label: string;
  kind: DoorKind;
  /** Clear opening. */
  width: number;
  height: number;
  /** Space the door needs above the opening (frame, header, track or coil box). */
  headroom: number;
  /** Space beside the opening, [left, right] seen from outside, before any slide travel. */
  side: number;
  /** Which compartment temperatures the model is built for. */
  temps: Temperature[];
  /** Whether the hinge (or slide direction) is part of the model number. */
  handed: boolean;
  /** Needs wall panels of exactly this height (roll-up). */
  panelHeight?: number;
}

const BOTH: Temperature[] = ['cooler', 'freezer'];
const FRAME = inToMm(2);

/**
 * Space beside and above a swing door: the overlap of a semi-buried leaf or the
 * frame of a full-buried one, plus hinge knuckles on one side and the latch
 * strike on the other, and the door closer above.
 */
const SWING_SIDE = inToMm(4.5);
const SWING_HEAD = inToMm(5);

export const DOOR_FAMILIES: readonly DoorFamily[] = [
  { id: 'man', label: 'Man door 34" × 78"', kind: 'swing', width: inToMm(34), height: inToMm(78), headroom: SWING_HEAD, side: SWING_SIDE, temps: BOTH, handed: true },
  { id: 'pallet', label: 'Pallet door 48" × 78" (semi-buried)', kind: 'swing', width: inToMm(48), height: inToMm(78), headroom: SWING_HEAD, side: SWING_SIDE, temps: BOTH, handed: true },
  { id: 'slide-pallet', label: 'Pallet sliding door 54" × 96"', kind: 'slide', width: inToMm(54), height: inToMm(96), headroom: inToMm(8), side: inToMm(4), temps: BOTH, handed: true },
  { id: 'slide-forklift', label: 'Forklift sliding door 72" × 96"', kind: 'slide', width: inToMm(72), height: inToMm(96), headroom: inToMm(8), side: inToMm(4), temps: BOTH, handed: true },
  // Custom made; 96" wide shown. The opening runs the full 120" panel height and the
  // coil housing sits above the walls, so it takes no headroom.
  { id: 'rollup', label: 'Forklift roll-up door, 120" panels, coolers only', kind: 'rollup', width: inToMm(96), height: inToMm(120), headroom: 0, side: inToMm(4.5), temps: ['cooler'], handed: false, panelHeight: inToMm(120) },
  { id: 'traffic-single', label: 'Traffic door, single 36" × 84"', kind: 'traffic', width: inToMm(36), height: inToMm(84), headroom: FRAME + inToMm(2), side: FRAME, temps: BOTH, handed: false },
  { id: 'traffic-double', label: 'Traffic door, double 72" × 84"', kind: 'traffic', width: inToMm(72), height: inToMm(84), headroom: FRAME + inToMm(2), side: FRAME, temps: BOTH, handed: false },
  // Size depends on series and door count; see glassUnitSize(). Width/height here are the 2-door Elite unit.
  { id: 'glass', label: 'Glass display doors', kind: 'glass', width: inToMm(63), height: inToMm(75), headroom: inToMm(2), side: inToMm(1), temps: BOTH, handed: false },
];

/**
 * Glass display door series, from the ICC Glass Doors pages. All: aluminum outer
 * frame, double sealed Low-E glass, self-closing, heated, LED lights, 110V 60Hz,
 * mid- and low-temp, right-hand opening, custom sizes available.
 */
export interface GlassSeriesDef {
  id: GlassSeries;
  label: string;
  /** Door frame construction. */
  doorFrame: 'pvc' | 'aluminum' | 'frameless';
  /** Per-door size. */
  doorWidth: number;
  doorHeight: number;
  finishes: { id: GlassFinish; label: string; code: string }[];
  handle: 'full-length' | 'bar-18';
}

export const GLASS_SERIES: readonly GlassSeriesDef[] = [
  { id: 'select', label: 'Select Series', doorFrame: 'pvc', doorWidth: inToMm(30), doorHeight: inToMm(66), finishes: [{ id: 'BK', label: 'Glossy black', code: '' }], handle: 'full-length' },
  {
    id: 'elite',
    label: 'Elite Series',
    doorFrame: 'aluminum',
    doorWidth: inToMm(30),
    doorHeight: inToMm(72),
    finishes: [
      { id: 'BK', label: 'Black', code: 'BK' },
      { id: 'AN', label: 'Anodized', code: 'AN' },
    ],
    handle: 'full-length',
  },
  {
    id: 'signature',
    label: 'Signature Series',
    doorFrame: 'frameless',
    doorWidth: inToMm(30),
    doorHeight: inToMm(72),
    finishes: [
      { id: 'BK', label: 'Black', code: 'BK' },
      { id: 'AN', label: 'Anodized', code: 'SV' },
    ],
    handle: 'bar-18',
  },
];

export const getGlassSeries = (id: GlassSeries) => GLASS_SERIES.find((g) => g.id === id) ?? GLASS_SERIES[0];

/** Outer frame around the doors of a glass unit, each side. */
export const GLASS_FRAME = inToMm(1.5);

/** Outside size of a glass unit: its doors plus the outer frame. */
export function glassUnitSize(g: GlassParams): { width: number; height: number } {
  const s = getGlassSeries(g.series);
  return { width: g.count * s.doorWidth + 2 * GLASS_FRAME, height: s.doorHeight + 2 * GLASS_FRAME };
}

/**
 * Space a door takes in its wall: the leaf for swing doors (34" × 78" man door,
 * semi- or full-buried alike), the opening for the others, the whole unit for
 * glass doors.
 */
export function doorSize(d: { family: DoorFamilyId; glass: GlassParams }): { width: number; height: number } {
  if (d.family === 'glass') return glassUnitSize(d.glass);
  const f = getDoorFamily(d.family);
  return { width: f.width, height: f.height };
}

const families = new Map(DOOR_FAMILIES.map((f) => [f.id, f]));
export function getDoorFamily(id: DoorFamilyId): DoorFamily {
  const f = families.get(id);
  if (!f) throw new Error(`Unknown door type: ${id}`);
  return f;
}

/** 3478 = semi-buried, 13478 = full-buried; only full-buried has window (W) models. */
export const MAN_SERIES: { id: ManSeries; label: string; mount: DoorMount }[] = [
  { id: '3478', label: 'Semi-buried', mount: 'semi-buried' },
  { id: '13478', label: 'Full-buried', mount: 'full-buried' },
];

/** Mount style of a swing door; null for doors that do not swing. */
export function doorMount(d: { family: DoorFamilyId; series: ManSeries }): DoorMount | null {
  if (d.family === 'man') return d.series === '13478' ? 'full-buried' : 'semi-buried';
  if (d.family === 'pallet') return 'semi-buried';
  return null;
}

/** Heated window in full-buried man doors (ICC-DR-13478…W). */
export const DOOR_WINDOW = { width: inToMm(12), height: inToMm(16) };

export const HANDLES: { id: HandleId; label: string }[] = [
  { id: 'included', label: 'Handle supplied with the door' },
  { id: 'ICC-P4', label: 'Safety latch handle, polished chrome (ICC-P4)' },
  { id: 'ICC-W58BL', label: 'Pull handle, black (ICC-W58BL)' },
  { id: 'ICC-W58BR', label: 'Pull handle, brass (ICC-W58BR)' },
  { id: 'ICC-38', label: 'Industrial handle, stainless (ICC-38)' },
];

export const TRAFFIC_FINISHES: { id: TrafficFinish; label: string; color: string }[] = [
  { id: 'GR', label: 'Grey', color: '#8a8f96' },
  { id: 'WH', label: 'White', color: '#f2f2f0' },
  { id: 'BK', label: 'Black', color: '#2a2c30' },
];

/** Door closer fitted to swing doors (on by default), modelled from its artwork. */
export const DOOR_CLOSER_SKU = 'ICC-20SS';

/**
 * Cam-lift hinge kit, one per hinge, three per swing door. L or R is the door's
 * swing side seen from outside. CONFIRM: one kit = one hinge.
 */
export const HINGE_KIT = {
  label: 'Cam-lift hinge kit',
  perDoor: 3,
  sku: (hinge: 'left' | 'right') => (hinge === 'left' ? 'ICC-1238SL' : 'ICC-1238SR'),
};

/**
 * Model number for a door. L/R is the swing side seen from outside: an L door
 * has its hinges on the left (confirmed against the ICC door pages).
 */
export function doorSku(
  d: { family: DoorFamilyId; series: ManSeries; window: boolean; hinge: 'left' | 'right'; finish: TrafficFinish; glass: GlassParams },
  temperature: Temperature,
): string {
  const t = temperature === 'freezer' ? 'F' : 'C';
  const h = d.hinge === 'left' ? 'L' : 'R';
  switch (d.family) {
    case 'man':
      return `ICC-DR-${d.series}${t}${h}${d.series === '13478' && d.window ? 'W' : ''}`;
    case 'pallet':
      return `ICC-DR-4878${t}${h}`;
    case 'slide-pallet':
      return `ICC-DR-5496${h}`;
    case 'slide-forklift':
      return `ICC-DR-7296${h}`;
    case 'rollup':
      return 'ICC-DR-96120';
    case 'traffic-single':
      return `ICC-DR-3684DS-${d.finish}`;
    case 'traffic-double':
      return `ICC-DR-7284DS-${d.finish}`;
    case 'glass': {
      const g = d.glass;
      const s = getGlassSeries(g.series);
      const code = s.finishes.find((f) => f.id === g.finish)?.code ?? s.finishes[0].code;
      return ['ICC-GD', g.series.toUpperCase(), code, `${g.count}D`].filter(Boolean).join('-');
    }
  }
}

/** Short tag shown on the plan and in lists: D1, D2… for doors, G1, G2… for glass door units. */
export function doorTag(doors: readonly { id: string; family: DoorFamilyId }[], id: string): string {
  const d = doors.find((x) => x.id === id);
  if (!d) return '?';
  const glass = d.family === 'glass';
  const same = doors.filter((x) => (x.family === 'glass') === glass);
  return `${glass ? 'G' : 'D'}${same.indexOf(d) + 1}`;
}

/** Most a glass display door unit can be raised off the floor. */
export const GLASS_MAX_ELEVATION = inToMm(36);

/**
 * Aluminum checker plate, sold and placed by the square foot. Squares sit on a
 * 1-ft grid per wall, starting at the left end of the wall's inside run and the
 * floor, so the tread pattern lines up across neighbouring squares.
 * The ICC page lists no product ID; the catalog also has 48" × 96" sheets
 * (ICC-4896-3AL / -5AL). CONFIRM which to quote.
 */
export const CHECKER_PLATE = { size: inToMm(12), thickness: 3, label: 'Aluminum checker plate, 1\' × 1\'' };

export type ControlModel = 'TSC2000' | 'TC1000' | 'none';

export interface ControlDef {
  id: Exclude<ControlModel, 'none'>;
  sku: string;
  label: string;
  /** Face size and depth off the wall. */
  width: number;
  height: number;
  depth: number;
  /** Cable and gland hanging below the housing (they need clear wall too). */
  tail?: number;
  /** Built from product artwork (SVG shapes + photo) rather than boxes. */
  artwork?: boolean;
  features: string[];
}

/** Walk-in controllers, from the ICC Smart Control and Temperature Controller pages. */
export const CONTROLS: readonly ControlDef[] = [
  {
    id: 'TSC2000',
    sku: 'ICC-TSC2000',
    label: 'Smart Control',
    width: inToMm(4.5),
    // From the product artwork's proportions at 4.5" wide (515.6 × 487.7 units).
    // CONFIRM: spec sheet says 4" tall.
    height: inToMm((4.5 * 487.74) / 515.61),
    depth: inToMm(1),
    tail: inToMm(1.85),
    artwork: true,
    features: [
      'Wi-Fi, cloud data logging, Android and iOS app',
      'Dual power: 110V up to 1.5 HP, 220V up to 5 HP, single and three phase',
      'Over 5 HP works with the ICC Control Box',
      'Light, defrost, refrigeration, fan, unlock, alarm and auxiliary indicators',
    ],
  },
  {
    id: 'TC1000',
    // CONFIRM: the page's variant button reads ICC-TSC1000, the model line reads ICC-TC1000.
    sku: 'ICC-TC1000',
    label: 'Temperature Controller',
    // Estimated from the photo; panel-style controller with a raised bezel.
    width: inToMm(4.25),
    height: inToMm(2),
    depth: inToMm(0.5),
    features: [
      'For 120V 50-60Hz commercial refrigerators and freezers',
      'Manages compressor, fan and defrost independently',
      'Real-time monitoring',
    ],
  },
];

export const getControl = (id: ControlModel) => CONTROLS.find((c) => c.id === id) ?? null;

/** Where a controller may sit: centre height from the floor. Default is eye level. */
export const CONTROL_HEIGHT = { min: inToMm(40), max: inToMm(66), default: inToMm(60) };

/**
 * ICC-R3436 aluminum ramp, 34" wide × 36" long, polished finish. Sits outside a
 * door and rises from the ground to the top of the floor. Only standard and
 * DuraFloor floors stand proud of the ground, so only they get a ramp.
 */
export const RAMP = { sku: 'ICC-R3436', label: 'Aluminum ramp 34" × 36"', width: inToMm(34), length: inToMm(36) };

/** Doors a 34" ramp serves: walk-through doors within 2" of its width (man doors, single traffic doors). */
export function rampServes(d: { family: DoorFamilyId; glass: GlassParams }): boolean {
  const k = getDoorFamily(d.family).kind;
  if (k !== 'swing' && k !== 'traffic') return false;
  return Math.abs(doorSize(d).width - RAMP.width) <= inToMm(2) + 0.01;
}

/**
 * ICC-ACC-SHELVING-HD heavy duty shelving (black, powder coated low-carbon
 * steel, plastic-dipped wire shelves, 80 kg per shelf, adjustable heights,
 * 5 shelves per door opening, price tag holder and expansion screws included).
 * One bay = one door opening: a 30" × 27" shelf between perforated posts.
 * Parts from the product sheet: posts with foot plates, wire shelves, side
 * braces, stabilizer bar, post retainer brackets, price tag holders, and
 * optional gravity flow trays.
 */
export const SHELVING = {
  sku: 'ICC-ACC-SHELVING-HD',
  // Sold on its own, by quantity: one per bay (30" × 27", 5 shelves), with or without our glass doors.
  label: 'Heavy duty shelving bay',
  shelfWidth: inToMm(30),
  shelfDepth: inToMm(27),
  post: inToMm(1.5),
  levels: 5,
  maxBays: 8,
  /** Gravity flow trays slope toward the front so product slides forward. */
  gravityTilt: (5 * Math.PI) / 180,
  gravitySku: 'ICC-GRAVITY-SHELF',
  gravityLabel: 'Gravity flow shelf tray',
  defaultHeight: inToMm(84),
};

/**
 * ICC evaporators (unit coolers), from the ICC Evaporator pages. All R448A,
 * 220V 60Hz, pre-installed TXV, larger fin gaps, service door, easy-replace fans.
 * Coolers (EVC) rated at 25°F evap / 105°F cond with electric heaters on mid temp;
 * freezers (EVF) at -10°F evap / 105°F cond with 1 kW defrost heaters.
 *
 * CONFIRM, values that look off on the pages: EVC1000 lists the same 1 fan and
 * 1523 CFM as EVC500; EVC2000-4000 share one airflow; EVF3000 lists TES2-5 below
 * EVF2000's TES2-6; heater counts are blank on EVF2000-4000.
 *
 * Sizes are ESTIMATES until the spec sheets arrive. Proportions come from
 * John's evaporator artwork (1, 2 and 3 fan fronts, in SVG units: body 633.69,
 * 1020.22 or 1381.73 wide × 367.54 high, drain rail 23.95, fan circle r 156.82),
 * scaled so the fan circle matches a fan size estimated from airflow
 * (1523 CFM ≈ 12", 2302 ≈ 14", 4073 ≈ 18"). Depth 16" (18" fans: 20").
 */
export const EVAP_ART = {
  bodyWidth: { 1: 633.69, 2: 1020.22, 3: 1381.73 } as Record<number, number>,
  bodyHeight: 367.54,
  rail: 23.95,
  fanRadius: 156.82,
};
export type EvapLine = 'cooler' | 'freezer';

export interface EvaporatorDef {
  sku: string;
  line: EvapLine;
  /** 'packaged' = self-contained (ICC-MBIC / MBIF): its own evaporator and condenser. */
  kind: 'split' | 'packaged';
  /** Packaged units only. */
  hp?: number;
  condenserCfm?: number;
  refrigerants?: string;
  rla?: number;
  fla?: number;
  lra?: number;
  compressor?: string;
  btu: number;
  fans: number;
  cfmPerFan: number;
  volts: string;
  minCircuit: number;
  txv: string;
  heaters?: string;
  /** Estimated size: along the wall, height, depth off the wall. */
  length: number;
  height: number;
  depth: number;
  fanDiameter: number;
  sizeEstimated: boolean;
}

function evap(sku: string, line: EvapLine, btu: number, fans: number, cfmPerFan: number, volts: string, minCircuit: number, txv: string, heaters?: string): EvaporatorDef {
  const fan = cfmPerFan >= 4000 ? 18 : cfmPerFan >= 2000 ? 14 : 12;
  // mm per artwork unit: the artwork's fan circle at the estimated fan size
  const k = inToMm(fan) / (2 * EVAP_ART.fanRadius);
  return {
    sku,
    line,
    kind: 'split' as const,
    btu,
    fans,
    cfmPerFan,
    volts,
    minCircuit,
    txv,
    heaters,
    length: EVAP_ART.bodyWidth[fans] * k,
    height: (EVAP_ART.bodyHeight + EVAP_ART.rail) * k,
    depth: inToMm(fan >= 18 ? 20 : 16),
    fanDiameter: inToMm(fan),
    sizeEstimated: true,
  };
}

export const EVAPORATORS: readonly EvaporatorDef[] = [
  evap('ICC-EVC500', 'cooler', 5830, 1, 1523, '220V/1ph/60Hz', 15, 'TES2-1'),
  evap('ICC-EVC1000', 'cooler', 10580, 1, 1523, '220V/1ph/60Hz', 15, 'TES2-3'),
  evap('ICC-EVC1500', 'cooler', 17119, 1, 2302, '220V/1ph/60Hz', 15, 'TES2-3'),
  evap('ICC-EVC2000', 'cooler', 20782, 2, 2302, '220V/1ph/60Hz', 15, 'TES2-3'),
  evap('ICC-EVC3000', 'cooler', 28948, 2, 2302, '220V/1ph/60Hz', 15, 'TES2-4'),
  evap('ICC-EVC4000', 'cooler', 41037, 2, 2302, '220V/1ph/60Hz', 15, 'TES2-5'),
  evap('ICC-EVF1000', 'freezer', 9534, 1, 2302, '220V/1ph/60Hz', 20, 'TES2-3', '1 kW × 3'),
  evap('ICC-EVF1500', 'freezer', 15406, 2, 2302, '220V/1ph/60Hz', 25, 'TES2-5', '1 kW × 3'),
  evap('ICC-EVF2000', 'freezer', 21495, 2, 4073, '220V/3ph/60Hz', 40, 'TES2-6', '1 kW × 6'),
  evap('ICC-EVF3000', 'freezer', 32684, 2, 4073, '220V/3ph/60Hz', 40, 'TES2-5', '1 kW × 6'),
  evap('ICC-EVF4000', 'freezer', 39579, 3, 4073, '220V/3ph/60Hz', 40, 'TES2-6', '1 kW × 6'),
];

/**
 * Packaged (self-contained) units: a condensing section on the roof and an
 * evaporator section that drops through the ceiling. Sizes are ESTIMATES: the
 * part inside (what the placement rules see) about 22" × 9" × 14".
 */
function packaged(sku: string, line: EvapLine, btu: number, hp: number, evapCfm: number, condCfm: number, rla: number, fla: number, lra: number, compressor: string, minCircuit: number): EvaporatorDef {
  return {
    sku, line, kind: 'packaged', btu, fans: 1, cfmPerFan: evapCfm, volts: '220V/1ph/60Hz', minCircuit,
    txv: '—', hp, condenserCfm: condCfm, refrigerants: 'R448A, R404A, R449A', rla, fla, lra, compressor,
    length: inToMm(22), height: inToMm(9), depth: inToMm(14), fanDiameter: inToMm(8), sizeEstimated: true,
  };
}

export const PACKAGED: readonly EvaporatorDef[] = [
  packaged('ICC-MBIC350', 'cooler', 3741, 1 / 3, 706, 1059, 3.1, 3.2, 16.2, 'SC10CLX', 15),
  packaged('ICC-MBIC500', 'cooler', 4510, 0.5, 982, 1100, 5.7, 5.5, 34, 'NEU6215GK', 15),
  packaged('ICC-MBIC750', 'cooler', 7503, 0.75, 982, 1100, 4.3, 4.2, 23.4, 'SC18MLX', 15),
  packaged('ICC-MBIC1000', 'cooler', 9553, 1, 982, 1100, 9, 6.8, 43, 'NT6226GK', 15),
  packaged('ICC-MBIC1500', 'cooler', 14266, 1.5, 1100, 1100, 12.2, 8.5, 60, 'NJ9238GK', 20),
  packaged('ICC-MBIF450', 'freezer', 4708, 1.5, 1100, 1100, 9.2, 9, 54, 'NJ2212GJ', 15),
  packaged('ICC-MBIF600', 'freezer', 6784, 2, 1589, 1589, 16.1, 12.2, 76, 'YF13E3G', 20),
  packaged('ICC-MBIF1000', 'freezer', 8913, 3, 1589, 1589, 19.4, 11.4, 76, 'YF20E3G', 20),
  packaged('ICC-MBIF1500', 'freezer', 13427, 4, 1589, 1589, 28, 16.1, 109, 'YF29E3G', 40),
];

/** Every ceiling unit: split evaporators and packaged units. */
export const CEILING_UNITS: readonly EvaporatorDef[] = [...EVAPORATORS, ...PACKAGED];

export const getEvaporator = (sku: string) => CEILING_UNITS.find((e) => e.sku === sku) ?? EVAPORATORS[2];

/** The model a new unit starts with; the customer picks the real one. */
export const DEFAULT_EVAPORATOR: Record<EvapLine, string> = { cooler: 'ICC-EVC1500', freezer: 'ICC-EVF1500' };

/**
 * Placement rules of thumb (from John's research notes):
 * - never directly over a door; blow toward the door or down the main aisle
 * - rear gap at least the coil height, and never under 12"
 * - one unit throws about 25' (20' comfortable); covers about 15' of width
 * - keep product 12" clear of the unit
 * - all units in one room on one controller
 */
export const EVAP_RULES = {
  throwMax: inToMm(25 * 12),
  throwComfort: inToMm(20 * 12),
  coverWidth: inToMm(15 * 12),
  minRearGap: inToMm(12),
  productClear: inToMm(12),
  /** Keep the unit this far either side of a door opening on its wall. */
  doorMargin: inToMm(12),
  /** Hung this far below the ceiling. */
  ceilingGap: inToMm(1),
};

// ── Condensing units ──

/**
 * ICC condensing units, from the ICC Condenser pages (R448A). Cooler units are
 * rated at 25°F evap / 105°F cond, freezer units at -10°F / 105°F.
 *   indoor  ICC-SUIC / SUIF: on a base plate, normally on the walk-in roof indoors
 *   outdoor ICC-SUOC / SUOF: slim cabinet on legs, outside on a pad
 * Packaged (self-contained) ICC-MBIC / MBIF units are listed with the evaporators,
 * since each one is its own evaporator and condenser.
 *
 * CONFIRM, values that look off on the pages: SUOC1000 compressor "NT622GK"
 * (NT6226GK elsewhere); SUIF2000 compressor YF41E7G vs SUOF2000 YF41E3G with the
 * same rating; SUIF1000 at 3 HP for 8,913 BTU/h.
 * Sizes are ESTIMATES until spec sheets arrive.
 */
export type CondenserType = 'indoor' | 'outdoor';

export interface CondenserDef {
  sku: string;
  line: EvapLine;
  type: CondenserType;
  btu: number;
  hp: number;
  fans: number;
  cfmPerFan: number;
  volts: string;
  rla: number;
  fla: number;
  lra: number;
  compressor: string;
  minCircuit: number;
  highPressure: number;
  /** Estimated size: width, height, depth (mm). */
  width: number;
  height: number;
  depth: number;
}

function cu(sku: string, line: EvapLine, type: CondenserType, btu: number, hp: number, fans: number, cfmPerFan: number, volts: string, rla: number, fla: number, lra: number, compressor: string, minCircuit: number): CondenserDef {
  // Size estimates: indoor cabinets grow with fans; outdoor slim cabinets by fan count and airflow.
  const big = cfmPerFan >= 3000;
  const w = type === 'indoor' ? (fans > 1 ? 30 : 20) : fans > 1 ? 52 : big ? 40 : 34;
  const h = type === 'indoor' ? 20 : big ? 26 : 22;
  const d = type === 'indoor' ? 18 : 14;
  return {
    sku, line, type, btu, hp, fans, cfmPerFan, volts, rla, fla, lra, compressor, minCircuit,
    highPressure: type === 'indoor' ? 597.63 : 507.63,
    width: inToMm(w),
    height: inToMm(h),
    depth: inToMm(d),
  };
}

export const CONDENSERS: readonly CondenserDef[] = [
  cu('ICC-SUIC386', 'cooler', 'indoor', 3915, 0.33, 1, 928, '110V/60Hz', 5.7, 0.35, 41.9, 'SC10CL', 15),
  cu('ICC-SUIC500', 'cooler', 'indoor', 4510, 0.5, 1, 928, '220V/1ph/60Hz', 5.7, 0.35, 34, 'NEU6215GK', 15),
  cu('ICC-SUIC530', 'cooler', 'indoor', 5846, 0.75, 1, 1523, '110V/60Hz', 7, 0.81, 69, 'SC15MLX', 20),
  cu('ICC-SUIC700', 'cooler', 'indoor', 6696, 1, 1, 1523, '220V/1ph/60Hz', 7, 0.81, 37, 'NT6222GK', 15),
  cu('ICC-SUIC1000', 'cooler', 'indoor', 9553, 1, 1, 1523, '220V/1ph/60Hz', 9, 0.81, 43, 'NT6226GK', 16),
  cu('ICC-SUIC1500', 'cooler', 'indoor', 14266, 1.5, 1, 1523, '220V/1ph/60Hz', 12.2, 0.81, 60, 'NJ9238GK', 20),
  cu('ICC-SUOC500', 'cooler', 'outdoor', 4510, 0.5, 1, 1523, '220V/1ph/60Hz', 5.7, 1.67, 34, 'NEU6215GK', 15),
  cu('ICC-SUOC700', 'cooler', 'outdoor', 6696, 1, 1, 1523, '220V/1ph/60Hz', 7, 1.67, 37, 'NT6222GK', 15),
  cu('ICC-SUOC1000', 'cooler', 'outdoor', 9553, 1, 1, 1523, '220V/1ph/60Hz', 9, 1.67, 43, 'NT622GK', 15),
  cu('ICC-SUOC1500', 'cooler', 'outdoor', 14266, 1.5, 1, 2302, '220V/1ph/60Hz', 12.2, 1.67, 60, 'NJ9238GK', 20),
  cu('ICC-SUOC2000', 'cooler', 'outdoor', 18853, 2, 1, 3151, '220V/1ph/60Hz', 19.5, 1.67, 76, 'YM34E3G', 30),
  cu('ICC-SUOC3000', 'cooler', 'outdoor', 25661, 3, 1, 3151, '220V/1ph/60Hz', 21.8, 1.67, 76, 'YM49E3G', 30),
  cu('ICC-SUOC4000', 'cooler', 'outdoor', 36659, 4, 2, 2302, '220V/1ph/60Hz', 34, 2.48, 140, 'YM70E3G', 50),
  cu('ICC-SUIF1000', 'freezer', 'indoor', 8913, 3, 1, 2302, '220V/1ph/60Hz', 19.4, 1.24, 76, 'YF20E3G', 30),
  cu('ICC-SUIF1500', 'freezer', 'indoor', 13427, 4, 2, 1523, '220V/1ph/60Hz', 28, 1.62, 109, 'YF29E3G', 40),
  cu('ICC-SUIF2000', 'freezer', 'indoor', 19412, 6, 2, 2302, '220V/1ph/60Hz', 25.2, 2.48, 167, 'YF41E7G', 40),
  cu('ICC-SUOF1000', 'freezer', 'outdoor', 8913, 3, 1, 3151, '220V/1ph/60Hz', 19.4, 1.67, 76, 'YF20E3G', 30),
  cu('ICC-SUOF1500', 'freezer', 'outdoor', 13427, 4, 2, 2302, '220V/1ph/60Hz', 28, 2.48, 109, 'YF29E3G', 40),
  cu('ICC-SUOF2000', 'freezer', 'outdoor', 19412, 6, 2, 2302, '220V/1ph/60Hz', 28, 2.48, 167, 'YF41E3G', 40),
  cu('ICC-SUOF3000', 'freezer', 'outdoor', 28605, 7, 2, 3151, '220V/3ph/60Hz', 37.4, 3.34, 241, 'YSF60E7G', 50),
  cu('ICC-SUOF4000', 'freezer', 'outdoor', 36005, 9, 2, 4111, '220V/3ph/60Hz', 46.6, 4.2, 241, 'YSF75E7G', 60),
];

export const getCondenser = (sku: string) => CONDENSERS.find((c) => c.sku === sku) ?? CONDENSERS[0];

/**
 * Pairing rules (from John's rules notes): how many evaporators one condensing
 * unit may serve, by installation and temperature. Freezers are strictly 1:1
 * (defrost sync and oil return); outdoor coolers up to 2 (head pressure swings,
 * long line sets); indoor coolers up to 3. Packaged units are 1:1 by design.
 */
export const MAX_EVAPS_PER_CU: Record<CondenserType, Record<EvapLine, number>> = {
  indoor: { cooler: 3, freezer: 1 },
  outdoor: { cooler: 2, freezer: 1 },
};

/**
 * Capacity match against the combined BTU/h of the evaporators a unit serves.
 * ICC's own matched pairs (same model number: EVC1000 + SUIC1000 and so on) put
 * the condensing unit at 77-93% of the evaporator's rating, since evaporators
 * are rated a little above the unit they pair with. So: under 75% is too small
 * (not offered); 85% is the target when choosing for several evaporators; over
 * 125% will short-cycle (warned). CONFIRM tolerances.
 */
export const CU_MATCH = { min: 0.75, target: 0.85, max: 1.25 };

/** Outdoor units: clear space around the cabinet for air. */
export const CU_CLEARANCE = inToMm(12);

/** TSC2000 limits; above 5 HP the ICC Control Box is needed. CONFIRM Control Box model number. */
export const CONTROL_LIMITS = { volts110Hp: 1.5, volts220Hp: 5, controlBox: 'ICC Control Box (model TBD)' };
