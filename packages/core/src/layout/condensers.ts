/**
 * Condensing units: which split evaporators each one serves, which models fit,
 * where it sits (indoor on the roof, outdoor outside on a pad), and the rules.
 *
 * Rules (John's rules notes): a unit must cover the combined BTU/h of the
 * evaporators it serves; one unit serves at most 3 evaporators indoors and 2
 * outdoors for coolers, and exactly 1 for freezers; packaged units are
 * self-contained and need none. Customers add units freely; models that don't
 * fit are offered disabled, with the reason.
 */
import type { CondensingUnit, Compartment } from '../config';
import {
  CONDENSERS,
  CU_CLEARANCE,
  CU_MATCH,
  type CondenserDef,
  type CondenserType,
  MAX_EVAPS_PER_CU,
  getCondenser,
  getEvaporator,
} from '../catalog';
import { type Vec2, bounds } from '../geometry';
import { footprint } from './shapes';
import { evaporatorPlan } from './evaporators';

const fpOf = (c: Compartment) => footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);

/** Split evaporators only (packaged units carry their own condenser). */
export const splitEvaporators = (c: Compartment) => c.evaporators.filter((e) => getEvaporator(e.model).kind === 'split');

/** Combined BTU/h of the evaporators a unit serves. */
export function servedLoad(c: Compartment, cu: Pick<CondensingUnit, 'serves'>): number {
  return cu.serves.reduce((n, id) => {
    const e = c.evaporators.find((x) => x.id === id);
    return n + (e ? getEvaporator(e.model).btu : 0);
  }, 0);
}

export const maxServed = (def: CondenserDef) => MAX_EVAPS_PER_CU[def.type][def.line];

/** Why a model can't be used for a unit serving these evaporators, or null if it fits. */
export function modelBlocker(c: Compartment, def: CondenserDef, serves: string[]): string | null {
  if (def.line !== c.temperature) return def.line === 'freezer' ? 'Freezer unit; this is a cooler' : 'Cooler unit; this is a freezer';
  if (serves.length > maxServed(def)) {
    return `${def.type === 'indoor' ? 'Indoor' : 'Outdoor'} ${def.line} units serve at most ${maxServed(def)} evaporator${maxServed(def) === 1 ? '' : 's'}`;
  }
  const load = servedLoad(c, { serves });
  if (load > 0 && def.btu < load * CU_MATCH.min) {
    return `Too small for ${Math.round(load).toLocaleString('en-US')} BTU/h of evaporators`;
  }
  return null;
}

const modelNumber = (sku: string) => sku.replace(/\D/g, '');

/** ICC's matched pair: one evaporator and the condensing unit with the same model number (EVC1000 + SUIC1000). */
export function isMatchedPair(c: Compartment, def: CondenserDef, serves: string[]): boolean {
  if (serves.length !== 1) return false;
  const e = c.evaporators.find((x) => x.id === serves[0]);
  return !!e && def.line === getEvaporator(e.model).line && modelNumber(def.sku) === modelNumber(e.model);
}

/** Every condensing unit model with whether it fits these evaporators, and whether it is ICC's matched pair. */
export function condenserOptions(c: Compartment, serves: string[]): { def: CondenserDef; blocker: string | null; matched: boolean }[] {
  return CONDENSERS.filter((d) => d.line === c.temperature).map((def) => ({ def, blocker: modelBlocker(c, def, serves), matched: isMatchedPair(c, def, serves) }));
}

/**
 * Model for a unit of this type: ICC's matched pair for a single evaporator;
 * otherwise the smallest unit at the target share of the load; otherwise the
 * smallest that fits at all; otherwise the largest of the type.
 */
export function bestModel(c: Compartment, type: CondenserType, serves: string[]): string {
  const of = CONDENSERS.filter((d) => d.line === c.temperature && d.type === type).sort((a, b) => a.btu - b.btu);
  const matched = of.find((d) => isMatchedPair(c, d, serves) && !modelBlocker(c, d, serves));
  if (matched) return matched.sku;
  const load = servedLoad(c, { serves });
  const target = of.find((d) => !modelBlocker(c, d, serves) && d.btu >= load * CU_MATCH.target);
  return (target ?? of.find((d) => !modelBlocker(c, d, serves)) ?? of[of.length - 1]).sku;
}

/** Size of a unit on the plan, after its rotation. */
function planSize(cu: CondensingUnit): { w: number; d: number } {
  const def = getCondenser(cu.model);
  const turned = Math.round(cu.rotation / 90) % 2 !== 0;
  return turned ? { w: def.depth, d: def.width } : { w: def.width, d: def.depth };
}

export function condenserRect(cu: CondensingUnit) {
  const { w, d } = planSize(cu);
  return { minX: cu.x - w / 2, maxX: cu.x + w / 2, minY: cu.y - d / 2, maxY: cu.y + d / 2 };
}

/**
 * Starting place for a unit serving `serves`:
 * indoor  on the roof, above the first evaporator it serves;
 * outdoor outside the wall that evaporator hangs on, 12" clear, facing out.
 */
export function defaultCondenserPlace(c: Compartment, model: string, serves: string[]): Pick<CondensingUnit, 'x' | 'y' | 'rotation'> {
  const def = getCondenser(model);
  const fp = fpOf(c);
  const b = bounds(fp);
  const first = c.evaporators.find((e) => serves.includes(e.id));
  if (!first) return { x: b.cx, y: b.cy, rotation: 0 };
  const p = evaporatorPlan(c, first);
  // Faces the way the wall faces (outward).
  const n = p.frame.n;
  const rotation = n[1] > 0.5 ? 0 : n[0] > 0.5 ? 90 : n[1] < -0.5 ? 180 : 270;
  if (def.type === 'indoor') {
    const hw = def.width / 2;
    const hd = def.depth / 2;
    return {
      x: Math.min(b.maxX - hw, Math.max(b.minX + hw, p.center[0])),
      y: Math.min(b.maxY - hd, Math.max(b.minY + hd, p.center[1])),
      rotation,
    };
  }
  // Outdoor: out from the wall's outside face.
  const f = p.frame;
  const along = Math.max(0, Math.min(f.length, (p.center[0] - f.origin[0]) * f.u[0] + (p.center[1] - f.origin[1]) * f.u[1]));
  const out = c.wallThickness + CU_CLEARANCE + def.depth / 2;
  return { x: f.origin[0] + f.u[0] * along + n[0] * out, y: f.origin[1] + f.u[1] * along + n[1] * out, rotation };
}

const nextId = (c: Compartment) => `cu${c.condensers.reduce((m, x) => Math.max(m, Number(x.id.replace(/\D/g, '')) || 0), 0) + 1}`;

/** Split evaporators no unit serves yet. */
export function unservedEvaporators(c: Compartment) {
  const served = new Set(c.condensers.flatMap((x) => x.serves));
  return splitEvaporators(c).filter((e) => !served.has(e.id));
}

/**
 * Add a unit serving the unserved evaporators (as many as one unit may take),
 * with the smallest model that fits. Type follows the site: indoor for indoor
 * sites, outdoor otherwise.
 */
export function addCondenser(c: Compartment, site: 'indoor' | 'outdoor', type?: CondenserType): { compartment: Compartment; id: string } {
  const preferred: CondenserType = type ?? (site === 'indoor' ? 'indoor' : 'outdoor');
  const fits = (t: CondenserType, ids: string[]) =>
    CONDENSERS.some((d) => d.type === t && d.line === c.temperature && !modelBlocker(c, d, ids));
  const pending = unservedEvaporators(c).map((e) => e.id);
  // Without a forced type, fall back to the other installation when nothing of the
  // preferred one can carry even the first evaporator (e.g. no indoor cooler unit
  // is big enough for an EVC2000).
  const other: CondenserType = preferred === 'indoor' ? 'outdoor' : 'indoor';
  const t = !type && pending.length && !fits(preferred, [pending[0]]) && fits(other, [pending[0]]) ? other : preferred;
  // Take evaporators one at a time while a model of this type can still carry them all.
  const serves: string[] = [];
  for (const id of pending) {
    if (serves.length >= MAX_EVAPS_PER_CU[t][c.temperature]) break;
    if (!serves.length || fits(t, [...serves, id])) serves.push(id);
  }
  const model = bestModel(c, t, serves);
  const id = nextId(c);
  const unit: CondensingUnit = { id, model, serves, ...defaultCondenserPlace(c, model, serves) };
  return { compartment: { ...c, condensers: [...c.condensers, unit] }, id };
}

/** Add units until every split evaporator is served ("Match all evaporators"). */
export function matchAllEvaporators(c: Compartment, site: 'indoor' | 'outdoor'): Compartment {
  let next = c;
  for (let k = 0; k < 12 && unservedEvaporators(next).length; k++) next = addCondenser(next, site).compartment;
  return next;
}

export function updateCondenser(c: Compartment, id: string, patch: Partial<CondensingUnit>): Compartment {
  return { ...c, condensers: c.condensers.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
}

export function removeCondenser(c: Compartment, id: string): Compartment {
  return { ...c, condensers: c.condensers.filter((x) => x.id !== id) };
}

function insidePoly(poly: Vec2[], [x, y]: Vec2) {
  let k = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (poly[i][1] > y !== poly[j][1] > y && x < ((poly[j][0] - poly[i][0]) * (y - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) k = !k;
  }
  return k;
}

export interface CuCheck {
  errors: string[];
  warnings: string[];
}

/** Rule check for one condensing unit. */
export function checkCondenser(c: Compartment, cu: CondensingUnit, site: 'indoor' | 'outdoor'): CuCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const def = getCondenser(cu.model);
  if (!cu.serves.length) warnings.push('serves no evaporator');
  const blocker = modelBlocker(c, def, cu.serves);
  if (blocker) errors.push(blocker.charAt(0).toLowerCase() + blocker.slice(1));
  const load = servedLoad(c, cu);
  if (load > 0 && def.btu > load * CU_MATCH.max) {
    warnings.push(`is oversized for ${Math.round(load).toLocaleString('en-US')} BTU/h of evaporators and will short-cycle`);
  }
  // Where it sits
  const fp = fpOf(c);
  const r = condenserRect(cu);
  const corners: Vec2[] = [
    [r.minX, r.minY],
    [r.maxX, r.minY],
    [r.maxX, r.maxY],
    [r.minX, r.maxY],
  ];
  if (def.type === 'indoor') {
    if (!corners.every((q) => insidePoly(fp, q))) errors.push('hangs off the roof; move it onto the walk-in');
    if (site === 'outdoor') warnings.push('is an indoor unit on an outdoor walk-in; use an outdoor unit');
  } else {
    if (corners.some((q) => insidePoly(fp, q)) || insidePoly(fp, [cu.x, cu.y])) errors.push('is inside the walk-in; outdoor units stand outside');
    const b = bounds(fp);
    const gap = Math.max(b.minX - r.maxX, r.minX - b.maxX, b.minY - r.maxY, r.minY - b.maxY);
    if (gap >= 0 && gap < CU_CLEARANCE - 1) warnings.push('needs 12" of clear air around it');
  }
  return { errors, warnings };
}
