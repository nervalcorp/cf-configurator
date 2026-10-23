import { describe, expect, it } from 'vitest';
import {
  BAY_PITCH,
  addDoor,
  addShelving,
  buildCompartment,
  defaultCompartment,
  defaultConfiguration,
  inToMm,
  mmToIn,
  normalize,
  rotateShelving,
  shelvingBlocker,
  shelvingRect,
  toggleGravity,
  updateDoor,
  updateShelving,
  validateCompartment,
  type BoxPart,
  type Compartment,
} from '../src';

/** 180" wide cooler with a 3-door Elite unit centred on the front wall and the man door on wall B. */
function withGlass(): Compartment {
  let c: Compartment = { ...defaultCompartment(), boxW: inToMm(180), doors: [] };
  const r = addDoor(c, 'glass');
  c = updateDoor(r.compartment, r.id!, { offset: inToMm(40), glass: { series: 'elite', finish: 'BK', count: 3 } });
  return { ...c, control: { ...c.control, model: 'none' } };
}

describe('shelving', () => {
  it('lands behind the glass doors: one bay per door, facing the glass, levels within the opening', () => {
    const { compartment: c, id } = addShelving(withGlass());
    const u = c.accessories.shelving.find((x) => x.id === id)!;
    expect(u.bays).toBe(3);
    expect(u.facing).toBe(0);
    const r = shelvingRect(u);
    // centred on the glass unit (40" + 93"/2 from the inside of the left post, 4" wall)
    expect(mmToIn((r.minX + r.maxX) / 2)).toBeCloseTo(4 + 40 + 46.5, 6);
    expect(u.top).toBeLessThan(inToMm(75));
    expect(shelvingBlocker(c, u)).toBeNull();
    expect(validateCompartment(c).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('builds posts, shelves, braces, bars, brackets and tags', () => {
    const { compartment: c } = addShelving(withGlass());
    const parts = buildCompartment(c, 'indoor').parts.filter((p) => p.id.includes(':shelf-sh1:'));
    const count = (k: string) => parts.filter((p) => p.kind === k).length;
    expect(count('shelf-post')).toBe(8); // 4 post pairs for 3 bays
    expect(count('shelf-wire')).toBe(15); // 3 bays × 5 levels
    expect(count('price-tag')).toBe(15);
    expect(count('shelf-bar')).toBe(2);
    expect(count('shelf-brace')).toBe(8);
  });

  it('adds a gravity flow tray to one shelf only, tilted toward the front', () => {
    let { compartment: c, id } = addShelving(withGlass());
    c = toggleGravity(c, id, 1, 2);
    const parts = buildCompartment(c, 'indoor').parts as BoxPart[];
    const tilted = parts.filter((p) => p.id.includes(':shelf-sh1:') && p.kind === 'shelf-wire' && p.rotationX);
    expect(tilted).toHaveLength(1);
    expect(tilted[0].id).toMatch(/shelf-1-2$/);
    expect(parts.some((p) => p.kind === 'gravity-bed')).toBe(true);
    expect(parts.filter((p) => p.kind === 'gravity-divider').length).toBeGreaterThan(5);
  });

  it('flags shelving moved through a wall or onto another unit', () => {
    let { compartment: c, id } = addShelving(withGlass());
    const out = updateShelving(c, id, { x: inToMm(2) });
    expect(shelvingBlocker(out, out.accessories.shelving[0])).toMatch(/outside/);
    const second = addShelving(c);
    c = updateShelving(second.compartment, second.id, { x: c.accessories.shelving[0].x, y: c.accessories.shelving[0].y });
    expect(validateCompartment(c).some((i) => /overlapping/.test(i.message))).toBe(true);
  });

  it('turns a quarter turn at a time', () => {
    const { compartment: c, id } = addShelving(withGlass());
    const r = rotateShelving(c, id).accessories.shelving[0];
    expect(r.facing).toBe(90);
    const rect = shelvingRect(r);
    expect(mmToIn(rect.maxY - rect.minY)).toBeCloseTo(mmToIn(3 * BAY_PITCH + inToMm(1.5)), 6);
  });

  it('goes against the back wall when there are no glass doors', () => {
    const { compartment: c } = addShelving({ ...defaultCompartment() });
    const u = c.accessories.shelving[0];
    expect(u.facing).toBe(0);
    expect(shelvingRect(u).minY).toBeLessThan(inToMm(12));
    expect(shelvingBlocker(c, u)).toBeNull();
  });
});

describe('compartment names', () => {
  it('never repeats a name', () => {
    const cfg = defaultConfiguration();
    const two = { ...cfg, compartments: [cfg.compartments[0], { ...defaultCompartment('c2'), name: 'Compartment 1' }] };
    expect(normalize(two).compartments.map((c) => c.name)).toEqual(['Compartment 1', 'Compartment 1 (2)']);
  });
  it('keeps spaces typed inside a name', () => {
    const cfg = { ...defaultConfiguration(), compartments: [{ ...defaultCompartment(), name: 'Beer cave ' }] };
    expect(normalize(cfg).compartments[0].name).toBe('Beer cave ');
  });
});
