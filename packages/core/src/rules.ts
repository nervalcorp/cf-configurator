/**
 * Rules: normalize() applies cross-parameter constraints so a configuration is
 * always buildable; validate() reports what still needs the user's attention,
 * tagged with the tab that fixes it (the quote gate sends them there) and,
 * where relevant, the door it is about.
 */
import type { Compartment, Configuration, Door } from './config';
import { FINISH_COLORS, LIMITS } from './config';
import { CONTROL_HEIGHT, EVAPORATORS, GLASS_MAX_ELEVATION, SHELVING, getEvaporator, doorSize, doorSku, doorTag, getControl, getDoorFamily, getGlassSeries } from './catalog';
import { controlBlocked, defaultControlPlacement, squareBlocker } from './layout/fixtures';
import { shelvingBlocker } from './layout/shelving';
import { checkEvaporator } from './layout/evaporators';
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
  const evaporators = base.evaporators.map((e) => {
    const def = getEvaporator(e.model);
    if (def.line === line && def.sku === e.model) return e;
    const options = EVAPORATORS.filter((x) => x.line === line);
    const nearest = options.reduce((a, b) => (Math.abs(b.btu - def.btu) < Math.abs(a.btu - def.btu) ? b : a));
    return { ...e, model: nearest.sku };
  });
  const withShelves = { ...withDoors, evaporators, accessories: { ...withDoors.accessories, shelving } };
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

export function validateCompartment(c: Compartment): Issue[] {
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
    issues.push({ compartmentId: id, tab: 'refrigeration', severity: 'warning', message: 'This compartment has no evaporator.' });
  }
  c.evaporators.forEach((e) => {
    const tag = e.id.replace('ev', 'E');
    const sku = getEvaporator(e.model).sku;
    const chk = checkEvaporator(c, e);
    const target = [{ type: 'part' as const, id: `${c.id}:evap-${e.id}` }];
    chk.errors.forEach((m) => err('refrigeration', `Evaporator ${tag} (${sku}) ${m}.`, undefined, target));
    chk.warnings.forEach((m) =>
      issues.push({ compartmentId: id, tab: 'refrigeration', severity: 'warning', message: `Evaporator ${tag} (${sku}) ${m}.`, targets: target }),
    );
  });

  const ctl = getControl(c.control.model);
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
  const issues = config.compartments.flatMap(validateCompartment);
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
