import { LIMITS, SHAPES, type Temperature, formatFeetInches, getShape, inToMm, mmToIn, setShape } from '@wic/core';
import { FloorPlan, ShapeThumb } from '../floorplan/FloorPlan';
import { useActiveCompartment, useStore } from '../store';
import { Section, Slider, Toggle } from '../shell/controls';

export function LayoutTab() {
  const c = useActiveCompartment();
  const site = useStore((s) => s.config.site.type);
  const { setSite, editCompartment: edit, commit } = useStore.getState();
  const box = LIMITS.box;
  const hgt = LIMITS.height;

  return (
    <>
      <Section title="Walk-in type">
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
          label="Height"
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
    </>
  );
}
