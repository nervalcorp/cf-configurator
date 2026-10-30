/**
 * Rules: normalize() applies cross-parameter constraints so a configuration is
 * always buildable; validate() reports what still needs the user's attention,
 * tagged with the tab that fixes it (the quote gate sends them there) and,
 * where relevant, the door it is about.
 */
import type { Compartment, Configuration, Door } from './config';
import { FINISH_COLORS, LIMITS } from './config';
import { CEILING_UNITS, CONDENSERS, CONTROL_HEIGHT, CONTROL_LIMITS, GLASS_MAX_ELEVATION, SHELVING, getCondenser, getEvaporator, doorSize, doorSku, doorTag, getControl, getDoorFamily, getGlassSeries } from './catalog';
import { controlBlocked, defaultControlPlacement, squareBlocker } from './layout/fixtures';
import { shelvingBlocker } from './layout/shelving';
import { checkEvaporator } from './layout/evaporators';
import { checkCondenser, splitEvaporators } from './layout/condensers';
import { overlappingCompartments } from './compartments';
import { getShape, footprint } from './layout/shapes';
import { findFrontEdge, wallFrames } from './layout/walls';
import { doorMinRun, doorsClash, offsetRange } from './layout/doors';
import { formatFeetInches, formatInches } from './units';

export type TabId = 'layout' | 'finishes' | 'doors' | 'glass' | 'refrigeration' | 'accessories' | 'review';

/** What an issue is about, so the 3D view can mark it. */
export type IssueTarget =
  | { type: 'door'; id: string }
  | { type: 'wall'; edge: number }
  | { type: 'floor' }
  /** Any part by id prefix, e.g. one checker square or the controller. */
  | { type: 'part'; id: string };

export interface Issue {
  compartmentId: string;
  tab: TabId;
  severity: 'error' | 'warning';
  message: string;
  /** Door id when the issue is about one door (the Doors tab selects it). */
  ref?: string;
  /** Parts to mark in red in the 3D view. */
  targets?: IssueTarget[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function normalizeDoor(d: Door, c: Compartment, front: number, wallLengths: number[]): Door {
  const f = getDoorFamily(d.family);
  const wall = d.wall >= 0 && d.wall < wallLengths.length ? d.wall : front;
  const next: Door = {
    ...d,
    wall,
    window: d.family === 'man' && d.series === '13478' ? d.window : false,
    // Traffic doors swing both ways and have no closer or hinge choice.
    closer: f.kind === 'swing' ? d.closer : false,
    swing: f.kind === 'swing' ? d.swing : 'out',
    handle: f.kind === 'swing' || f.kind === 'slide' ? d.handle : 'included',
    // Only glass units can be raised; never above 3 ft, and never past the top of the wall.
    elevation:
      f.kind === 'glass'
        ? clamp(d.elevation, 0, Math.max(0, Math.min(GLASS_MAX_ELEVATION, c.height - doorSize(d).height - f.headroom)))
        : 0,
    glass: {
      ...d.glass,
      // Select is glossy black only.
      finish: getGlassSeries(d.glass.series).finishes.some((x) => x.id === d.glass.finish) ? d.glass.finish : 'BK',
    },
  };
  if (!f.temps.includes(c.temperature)) return next;
  // Keep the door on its wall when the wall shrinks (if it fits at all).
  const [lo, hi] = offsetRange(next, wallLengths[wall]);
  return hi >= lo ? { ...next, offset: clamp(next.offset, lo, hi) } : next;
}

export function normalizeCompartment(c: Compartment): Compartment {
  const shape = getShape(c.shape);
  const r = shape.range;
  let floor = c.finishes.floor;
  // A freezer always needs an insulated floor.
  if (c.temperature === 'freezer' && floor === 'none') floor = 'standard';
  const ext = c.finishes.exterior;
  const exteriorColor =
    ext === 'custom' ? c.finishes.exteriorColor : ext === 'decal' ? c.finishes.decal.background : FINISH_COLORS[ext];
  const decal = {
    ...c.finishes.decal,
    tile: clamp(c.finishes.decal.tile, LIMITS.decal.tileMin, LIMITS.decal.tileMax),
  };
  const base: Compartment = {
    ...c,
    boxW: clamp(c.boxW, LIMITS.box.min, LIMITS.box.max),
    boxD: clamp(c.boxD, LIMITS.box.min, LIMITS.box.max),
    notchW: shape.notch === 'none' ? c.notchW : clamp(c.notchW, r.nwMin, r.nwMax),
    notchD: shape.notch === 'none' ? c.notchD : clamp(c.notchD, r.ndMin, r.ndMax),
    height: clamp(c.height, LIMITS.height.min, LIMITS.height.max),
    finishes: { ...c.finishes, floor, exteriorColor, decal },
  };
  const fp = footprint(base.shape, base.boxW, base.boxD, base.notchW, base.notchD);
  const lengths = wallFrames(fp, base.wallThickness).map((w) => w.length);
  const front = findFrontEdge(fp);
  const withDoors = { ...base, doors: base.doors.map((d) => normalizeDoor(d, base, front, lengths)) };
  const shelving = base.accessories.shelving.map((u) => {
    const bays = clamp(Math.round(u.bays), 1, SHELVING.maxBays);
    const levels = clamp(Math.round(u.levels), 1, 8);
    const postHeight = clamp(u.postHeight, 1200, Math.max(1200, base.height - 25));
    const top = clamp(u.top, 150, postHeight - 150);
    const bottom = clamp(u.bottom, 75, top);
    const gravity = u.gravity.filter((k) => {
      const [bay, lvl] = k.split(':').map(Number);
      return bay < bays && lvl < levels;
    });
    return { ...u, bays, levels, postHeight, top, bottom, gravity };
  });
  // Evaporators follow the compartment's temperature: a cooler model in a freezer
  // swaps to the freezer model nearest in capacity, and back.
  const line = base.temperature;
  // Only units of the chosen system: split evaporators, or packaged units.
  const wantKind = base.system === 'packaged' ? 'packaged' : 'split';
  const evaporators = base.evaporators.filter((e) => getEvaporator(e.model).kind === wantKind).map((e) => {
    const def = getEvaporator(e.model);
    if (def.line === line && def.sku === e.model) return e;
    const options = CEILING_UNITS.filter((x) => x.line === line && x.kind === def.kind);
    const nearest = options.reduce((a, b) => (Math.abs(b.btu - def.btu) < Math.abs(a.btu - def.btu) ? b : a));
    return { ...e, model: nearest.sku };
  });
  // Condensing units: same swap on a temperature change; drop evaporators that are
  // gone or packaged, and let each evaporator belong to one unit only (first wins).
  const splitIds = new Set(evaporators.filter((e) => getEvaporator(e.model).kind === 'split').map((e) => e.id));
  const taken = new Set<string>();
  const condensers = (base.system === 'packaged' ? [] : base.condensers).map((u) => {
    let model = u.model;
    const def = getCondenser(model);
    if (def.line !== line) {
      const options = CONDENSERS.filter((x) => x.line === line && x.type === def.type);
      model = options.reduce((a, b) => (Math.abs(b.btu - def.btu) < Math.abs(a.btu - def.btu) ? b : a)).sku;
    }
    const serves = u.serves.filter((id) => splitIds.has(id) && !taken.has(id));
    serves.forEach((id) => taken.add(id));
    return { ...u, model, serves };
  });
  const withShelves = { ...withDoors, evaporators, condensers, accessories: { ...withDoors.accessories, shelving } };
  return { ...withShelves, control: normalizeControl(withShelves, lengths) };
}

function normalizeControl(c: Compartment, lengths: number[]): Compartment['control'] {
  const def = getControl(c.control.model);
  const ctl = c.control;
  if (ctl.wall < 0 || ctl.wall >= lengths.length) return defaultControlPlacement(c);
  if (!def) return ctl;
  const half = def.width / 2;
  return {
    ...ctl,
    offset: clamp(ctl.offset, half, Math.max(half, lengths[ctl.wall] - half)),
    height: clamp(ctl.height, CONTROL_HEIGHT.min, CONTROL_HEIGHT.max),
  };
}

export function normalize(config: Configuration): Configuration {
  // Compartment names must be unique; later duplicates get a number.
  const seen = new Set<string>();
  const compartments = config.compartments.map((c) => {
    const n = normalizeCompartment(c);
    const base = n.name.trim() || 'Compartment';
    let name = n.name.trim() ? n.name : base;
    if (seen.has(name.trim().toLowerCase())) {
      let k = 2;
      while (seen.has(`${base} (${k})`.toLowerCase())) k++;
      name = `${base} (${k})`;
    }
    seen.add(name.trim().toLowerCase());
    return name === n.name ? n : { ...n, name };
  });
  return { ...config, compartments };
}

export function validateCompartment(c: Compartment, site: 'indoor' | 'outdoor' = 'indoor'): Issue[] {
  const issues: Issue[] = [];
  const id = c.id;
  const fp = footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);
  const frames = wallFrames(fp, c.wallThickness);
  const wallH = c.height;
  const err = (tab: TabId, message: string, ref?: string, targets?: IssueTarget[]) =>
    issues.push({
      compartmentId: id,
      tab,
      severity: 'error',
      message,
      ref,
      targets: targets ?? (ref ? [{ type: 'door', id: ref }] : undefined),
    });

  if (!c.doors.some((d) => d.family !== 'glass')) {
    issues.push({ compartmentId: id, tab: 'doors', severity: 'warning', message: 'This compartment has no door.' });
  }

  const nameOf = (x: Door) => `${x.family === 'glass' ? 'Glass doors' : 'Door'} ${doorTag(c.doors, x.id)} (${doorSku(x, c.temperature)})`;
  c.doors.forEach((d, k) => {
    const name = nameOf(d);
    const size = doorSize(d);
    const tab: TabId = d.family === 'glass' ? 'glass' : 'doors';
    const f = getDoorFamily(d.family);
    const wall = frames[d.wall];
    if (!wall) return err(tab, `${name} is not on a wall.`, d.id);
    if (!f.temps.includes(c.temperature)) {
      err(tab, `${name} is for ${f.temps.join(' and ')}s only; this compartment is a ${c.temperature}.`, d.id);
    }
    if (f.panelHeight !== undefined) {
      if (Math.abs(wallH - f.panelHeight) > 0.5) {
        err(tab, `${name} needs ${formatFeetInches(f.panelHeight)} wall panels; these are ${formatFeetInches(wallH)}. Set the panel height to ${formatFeetInches(f.panelHeight)} on the Layout step.`, d.id);
      }
    } else if (size.height + f.headroom > wallH + 0.01) {
      err(tab, `${name} needs wall panels at least ${formatFeetInches(size.height + f.headroom)} high. Raise the panel height or pick a shorter door.`, d.id);
    }
    const [lo, hi] = offsetRange(d, wall.length);
    if (hi < lo) {
      err(tab, `${name} needs ${formatInches(doorMinRun(d))} of wall; wall ${wall.letter} has ${formatInches(wall.length)} inside.`, d.id, [
        { type: 'door', id: d.id },
        { type: 'wall', edge: d.wall },
      ]);
    } else if (d.offset < lo - 0.01 || d.offset > hi + 0.01) {
      err(tab, `${name} runs past the end of wall ${wall.letter}.`, d.id);
    }
    c.doors.slice(k + 1).forEach((o) => {
      if (o.wall !== d.wall) return;
      if (doorsClash(d, o)) {
        err(
          tab,
          `${name} and ${nameOf(o)} are too close on wall ${wall.letter}${
            f.kind === 'slide' || getDoorFamily(o.family).kind === 'slide'
              ? ' (sliding doors need room to open)'
              : d.family === 'glass' && o.family === 'glass'
                ? ' (glass units can only touch when they are the same height and lift)'
                : ''
          }.`,
          d.id,
          [{ type: 'door', id: d.id }, { type: 'door', id: o.id }],
        );
      }
    });
  });

  c.accessories.checker.forEach((q) => {
    const why = squareBlocker(c, q);
    if (why) {
      err('accessories', `A checker plate square on wall ${frames[q.wall]?.letter ?? '?'} is ${why}. Remove it or move the door.`, undefined, [
        { type: 'part', id: `${c.id}:plate-${q.wall}-${q.col}-${q.row}` },
      ]);
    }
  });

  c.accessories.shelving.forEach((u) => {
    const why = shelvingBlocker(c, u);
    if (why) {
      err('accessories', `Shelving ${u.id.replace('sh', 'S')} is ${why}. Move it on the Accessories step.`, undefined, [{ type: 'part', id: `${c.id}:shelf-${u.id}` }]);
    }
  });

  if (!c.evaporators.length) {
    issues.push({ compartmentId: id, tab: 'refrigeration', severity: 'warning', message: c.system === 'packaged' ? 'This compartment has no packaged unit.' : 'This compartment has no evaporator.' });
  }
  c.evaporators.forEach((e) => {
    const tag = e.id.replace('ev', 'E');
    const sku = getEvaporator(e.model).sku;
    const what = getEvaporator(e.model).kind === 'packaged' ? 'Packaged unit' : 'Evaporator';
    const chk = checkEvaporator(c, e);
    const target = [{ type: 'part' as const, id: `${c.id}:evap-${e.id}` }];
    chk.errors.forEach((m) => err('refrigeration', `${what} ${tag} (${sku}) ${m}.`, undefined, target));
    chk.warnings.forEach((m) =>
      issues.push({ compartmentId: id, tab: 'refrigeration', severity: 'warning', message: `${what} ${tag} (${sku}) ${m}.`, targets: target }),
    );
  });

  // Condensing units
  const servedBy = new Map<string, string>();
  c.condensers.forEach((u) => u.serves.forEach((id) => servedBy.set(id, u.id)));
  splitEvaporators(c).forEach((e) => {
    if (!servedBy.has(e.id)) {
      issues.push({
        compartmentId: id,
        tab: 'refrigeration',
        severity: 'warning',
        message: `Evaporator ${e.id.replace('ev', 'E')} has no condensing unit.`,
        targets: [{ type: 'part', id: `${c.id}:evap-${e.id}` }],
      });
    }
  });
  c.condensers.forEach((u) => {
    const tag = u.id.replace('cu', 'CU');
    const sku = getCondenser(u.model).sku;
    const chk = checkCondenser(c, u, site);
    const target = [{ type: 'part' as const, id: `${c.id}:cu-${u.id}` }];
    chk.errors.forEach((m) => err('refrigeration', `Condensing unit ${tag} (${sku}) ${m}.`, undefined, target));
    chk.warnings.forEach((m) => issues.push({ compartmentId: id, tab: 'refrigeration', severity: 'warning', message: `Condensing unit ${tag} (${sku}) ${m}.`, targets: target }));
  });

  const ctl = getControl(c.control.model);
  // Controller limits against the compressors it runs (condensing units and packaged units).
  const loads = [
    ...c.condensers.map((u) => getCondenser(u.model)),
    ...c.evaporators.map((e) => getEvaporator(e.model)).filter((d) => d.kind === 'packaged'),
  ];
  const hp = loads.reduce((n, d) => n + (d.hp ?? 0), 0);
  if (ctl?.id === 'TSC2000' && hp > 0) {
    const on110 = loads.some((d) => d.volts.startsWith('110'));
    if (on110 && hp > CONTROL_LIMITS.volts110Hp) {
      issues.push({ compartmentId: id, tab: 'refrigeration', severity: 'warning', message: `The Smart Control handles up to ${CONTROL_LIMITS.volts110Hp} HP at 110V; this compartment has ${hp} HP.` });
    }
    if (hp > CONTROL_LIMITS.volts220Hp) {
      issues.push({ compartmentId: id, tab: 'refrigeration', severity: 'warning', message: `Over ${CONTROL_LIMITS.volts220Hp} HP (${hp} HP here) the Smart Control needs the ICC Control Box. It is added to the part list.` });
    }
  }
  if (ctl?.id === 'TC1000' && loads.some((d) => !d.volts.startsWith('110'))) {
    issues.push({ compartmentId: id, tab: 'refrigeration', severity: 'warning', message: 'The Temperature Controller is meant for 120V equipment; this compartment has 220V units. Consider the Smart Control.' });
  }
  if (ctl) {
    const why = controlBlocked(c);
    if (why) {
      err('refrigeration', `The ${ctl.label} (${ctl.sku}) is ${why}. Move it on the Refrigeration step.`, undefined, [{ type: 'part', id: `${c.id}:control` }]);
    }
  } else {
    issues.push({ compartmentId: id, tab: 'refrigeration', severity: 'warning', message: 'This compartment has no controller.' });
  }

  if (c.temperature === 'freezer' && c.finishes.floor === 'none') {
    err('finishes', 'A freezer needs a floor.', undefined, [{ type: 'floor' }]);
  }
  return issues;
}

export function validate(config: Configuration): Issue[] {
  const issues = config.compartments.flatMap((c) => validateCompartment(c, config.site.type));
  const name = (id: string) => config.compartments.find((c) => c.id === id)?.name ?? id;
  for (const [a, b] of overlappingCompartments(config)) {
    for (const [id, other] of [[a, b], [b, a]]) {
      issues.push({
        compartmentId: id,
        tab: 'layout',
        severity: 'error',
        message: `${name(id)} overlaps ${name(other)}. Move one of them on the Layout step.`,
        targets: [{ type: 'part', id: `${id}:wall` }, { type: 'floor' }],
      });
    }
  }
  return issues;
}
