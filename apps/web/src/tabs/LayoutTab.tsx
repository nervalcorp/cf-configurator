import { type FloorType, LIMITS, SHAPES, type Side, type Temperature, besidePosition, formatFeetInches, getShape, inToMm, mmToIn, setShape } from '@wic/core';
import { useState } from 'react';
import { FloorPlan, ShapeThumb } from '../floorplan/FloorPlan';
import { useActiveCompartment, useStore } from '../store';
import { Section, Slider, Toggle } from '../shell/controls';

export function LayoutTab() {
  const c = useActiveCompartment();
  const site = useStore((s) => s.config.site.type);
  const all = useStore((s) => s.config.compartments);
  const { setSite, editCompartment: edit, commit, removeCompartment } = useStore.getState();
  const box = LIMITS.box;
  const hgt = LIMITS.height;

  return (
    <>
      <Section title="Compartment">
        <label className="field">
          <span className="field-label">Name</span>
          <input
            className="text-input"
            type="text"
            value={c.name}
            maxLength={40}
            onChange={(e) => edit((x) => ({ ...x, name: e.target.value }), { transient: true })}
            onBlur={(e) => {
              if (!e.target.value.trim()) edit((x) => ({ ...x, name: `Compartment ${all.indexOf(c) + 1}` }));
              commit();
            }}
          />
        </label>
        {all.length > 1 && (
          <button type="button" className="btn-link danger" onClick={() => removeCompartment(c.id)}>
            Remove {c.name}
          </button>
        )}
      </Section>

      {all.length > 1 && <PositionSection />}

      <Section title="Walk-in type" hint="All compartments">
        <Toggle
          label="Walk-in type"
          value={site}
          onChange={setSite}
          options={[
            { value: 'indoor', label: 'Indoor' },
            { value: 'outdoor', label: 'Outdoor' },
          ]}
        />
      </Section>

      <Section title="Compartment temperature">
        <Toggle<Temperature>
          label="Compartment temperature"
          value={c.temperature}
          onChange={(v) => edit((x) => ({ ...x, temperature: v }))}
          options={[
            { value: 'cooler', label: 'Cooler' },
            { value: 'freezer', label: 'Freezer' },
          ]}
        />
      </Section>

      <Section title="Shape">
        <div className="shape-grid">
          {SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`shape-btn${c.shape === s.id ? ' active' : ''}`}
              aria-pressed={c.shape === s.id}
              onClick={() => edit((x) => setShape(x, s.id, s.nw, s.nd))}
            >
              <ShapeThumb shape={s.id} nw={s.nw} nd={s.nd} />
              <span className="shape-btn-label">{s.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Floor plan" hint="Drag a corner to resize">
        <FloorPlan mode="shape" />
      </Section>

      <Section title="Size">
        <Slider
          label="Width"
          value={mmToIn(c.boxW)}
          min={mmToIn(box.min)}
          max={mmToIn(box.max)}
          step={box.stepIn}
          display={formatFeetInches(c.boxW)}
          minLabel={formatFeetInches(box.min)}
          maxLabel={formatFeetInches(box.max)}
          onInput={(v) => edit((x) => ({ ...x, boxW: inToMm(v) }), { transient: true })}
          onCommit={commit}
        />
        <Slider
          label="Depth"
          value={mmToIn(c.boxD)}
          min={mmToIn(box.min)}
          max={mmToIn(box.max)}
          step={box.stepIn}
          display={formatFeetInches(c.boxD)}
          minLabel={formatFeetInches(box.min)}
          maxLabel={formatFeetInches(box.max)}
          onInput={(v) => edit((x) => ({ ...x, boxD: inToMm(v) }), { transient: true })}
          onCommit={commit}
        />
        <Slider
          label="Wall panel height"
          value={mmToIn(c.height)}
          min={mmToIn(hgt.min)}
          max={mmToIn(hgt.max)}
          step={hgt.stepIn}
          display={formatFeetInches(c.height)}
          minLabel={formatFeetInches(hgt.min)}
          maxLabel={formatFeetInches(hgt.max)}
          onInput={(v) => edit((x) => ({ ...x, height: inToMm(v) }), { transient: true })}
          onCommit={commit}
        />
        {getShape(c.shape).notch !== 'none' && (
          <p className="panel-note">Drag the inside corner of the cut-out on the floor plan to change its size.</p>
        )}
      </Section>

      <Section title="Floor">
        <select
          className="custom-select"
          aria-label="Floor"
          value={c.finishes.floor}
          onChange={(e) => edit((x) => ({ ...x, finishes: { ...x.finishes, floor: e.target.value as FloorType } }))}
        >
          {FLOORS.filter((o) => !(c.temperature === 'freezer' && o.id === 'none')).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {c.temperature === 'freezer' && <p className="panel-note">Freezers always include an insulated floor.</p>}
        {c.finishes.floor === 'recessed' && <p className="panel-note">Sits in a recessed concrete slab, flush with the room floor. No ramp needed.</p>}
      </Section>
    </>
  );
}

const FLOORS: { id: FloorType; label: string }[] = [
  { id: 'standard', label: 'Standard floor (600 lb/sq ft, no rolling traffic)' },
  { id: 'durafloor', label: 'DuraFloor (12,000 lb/sq ft, no rolling traffic)' },
  { id: 'recessed', label: 'Recessed floor' },
  { id: 'none', label: 'No floor' },
];

const SIDES: { id: Side; label: string }[] = [
  { id: 'left', label: 'Left of' },
  { id: 'right', label: 'Right of' },
  { id: 'behind', label: 'Behind' },
  { id: 'front', label: 'In front of' },
];

/** Place this compartment touching another, or nudge it in 6" steps. */
function PositionSection() {
  const c = useActiveCompartment();
  const all = useStore((s) => s.config.compartments);
  const { editCompartment: edit } = useStore.getState();
  const others = all.filter((x) => x.id !== c.id);
  const [refId, setRefId] = useState(others[0]?.id ?? '');
  const ref = others.find((x) => x.id === refId) ?? others[0];
  const step = inToMm(6);
  const nudge = (dx: number, dz: number) => edit((x) => ({ ...x, position: { x: x.position.x + dx, z: x.position.z + dz } }));
  const first = all[0];
  const rel = (v: number) => `${Math.round(mmToIn(v))}"`;

  return (
    <Section title="Position" hint="Seen from the front">
      <div className="field">
        <span className="field-label">Place touching</span>
        <select className="custom-select" aria-label="Compartment to place beside" value={ref?.id} onChange={(e) => setRefId(e.target.value)}>
          {others.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <div className="side-grid">
          {SIDES.map((sd) => (
            <button key={sd.id} type="button" className="btn btn-ghost" onClick={() => ref && edit((x) => ({ ...x, position: besidePosition(x, ref, sd.id) }))}>
              {sd.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Nudge 6"</span>
        <div className="nudge-pad" role="group" aria-label="Nudge the compartment">
          <button type="button" aria-label="Move back" onClick={() => nudge(0, -step)}>↑</button>
          <button type="button" aria-label="Move left" onClick={() => nudge(-step, 0)}>←</button>
          <button type="button" aria-label="Move right" onClick={() => nudge(step, 0)}>→</button>
          <button type="button" aria-label="Move forward" onClick={() => nudge(0, step)}>↓</button>
        </div>
        {c.id !== first.id && (
          <p className="panel-note">
            Centre is {rel(c.position.x - first.position.x)} right and {rel(c.position.z - first.position.z)} forward of {first.name}'s centre.
          </p>
        )}
      </div>
    </Section>
  );
}
