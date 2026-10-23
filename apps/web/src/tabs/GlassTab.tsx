import {
  CATALOG_SOURCE,
  type Compartment,
  type Door,
  GLASS_SERIES,
  type GlassCount,
  type GlassFinish,
  type GlassParams,
  type GlassSeries,
  addDoor,
  doorSize,
  doorSku,
  doorTag,
  framesFor,
  formatInches,
  getGlassSeries,
  inToMm,
  mmToIn,
  moveDoor,
  offsetRange,
  removeDoor,
  updateDoor,
} from '@wic/core';
import { FloorPlan } from '../floorplan/FloorPlan';
import { useActiveCompartment, useStore } from '../store';
import { Section, Slider, Toggle } from '../shell/controls';

const SERIES_NOTES: Record<GlassSeries, string> = {
  select: 'PVC door frames in glossy black. Doors 30" × 66". Full-length handles.',
  elite: 'Aluminum door frames, black or anodized. Doors 30" × 72". Full-length handles.',
  signature: 'Frameless glass doors, black or anodized. Doors 30" × 72". 18" bar handles.',
};

export function GlassTab() {
  const c = useActiveCompartment();
  const selectedId = useStore((s) => s.ui.selectedDoor);
  const { editCompartment: edit, setUi } = useStore.getState();
  const frames = framesFor(c);
  const units = c.doors.filter((d) => d.family === 'glass');
  const sel = units.find((d) => d.id === selectedId) ?? units[0];

  return (
    <>
      <Section title="Glass display doors">
        {units.length ? (
          <ul className="door-list">
            {units.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className={`door-item${sel?.id === d.id ? ' active' : ''}`}
                  aria-pressed={sel?.id === d.id}
                  onClick={() => setUi({ selectedDoor: d.id })}
                >
                  <span className="door-num">{doorTag(c.doors, d.id)}</span>
                  <span className="door-sku">{doorSku(d, c.temperature)}</span>
                  <span className="door-where">
                    Wall {frames[d.wall]?.letter ?? '?'} · {formatInches(d.offset)} · {formatInches(doorSize(d).width)} wide
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-note">No glass doors yet. Add a 2- or 3-door unit to show product from outside the walk-in.</p>
        )}
        <div className="button-row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const r = addDoor(c, 'glass');
              if (!r.id) return;
              edit(() => r.compartment);
              setUi({ selectedDoor: r.id });
            }}
          >
            Add glass doors
          </button>
          {sel && (
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              onClick={() => {
                const rest = units.filter((d) => d.id !== sel.id);
                edit((x) => removeDoor(x, sel.id));
                setUi({ selectedDoor: rest[0]?.id ?? null });
              }}
            >
              Remove {doorTag(c.doors, sel.id)}
            </button>
          )}
        </div>
      </Section>

      <Section title="Floor plan" hint="Drag a unit along its wall, or click another wall to move it">
        <FloorPlan mode="doors" pick="glass" />
      </Section>

      {sel && <GlassEditor key={sel.id} c={c} unit={sel} tag={doorTag(c.doors, sel.id)} />}

      <Section title="Catalog">
        <p className="panel-note">
          Models from the {CATALOG_SOURCE}. All series: aluminum outer frame, double sealed Low-E glass, self-closing heated doors, LED lights, 110V 60Hz, for coolers and freezers. Custom sizes are available on request.
        </p>
      </Section>
    </>
  );
}

function GlassEditor({ c, unit, tag }: { c: Compartment; unit: Door; tag: string }) {
  const { editCompartment: edit, commit } = useStore.getState();
  const frames = framesFor(c);
  const g = unit.glass;
  const series = getGlassSeries(g.series);
  const f = frames[unit.wall];
  const [lo, hi] = f ? offsetRange(unit, f.length) : [0, 0];
  const fits = hi >= lo;
  const loIn = Math.ceil(mmToIn(lo));
  const hiIn = Math.max(loIn, Math.floor(mmToIn(hi)));
  // Changing size can push the unit off its wall; re-seat it near where it was.
  const setGlass = (patch: Partial<GlassParams>) =>
    edit((x) => moveDoor(updateDoor(x, unit.id, { glass: { ...unit.glass, ...patch } }), unit.id, unit.wall, unit.offset));

  return (
    <>
      <Section title={`Glass doors ${tag}`} hint={doorSku(unit, c.temperature)}>
        <div className="field">
          <span className="field-label">Series</span>
          <Toggle<GlassSeries>
            label="Series"
            value={g.series}
            onChange={(v) => setGlass({ series: v, finish: getGlassSeries(v).finishes.some((x) => x.id === g.finish) ? g.finish : 'BK' })}
            options={GLASS_SERIES.map((s) => ({ value: s.id, label: s.label.replace(' Series', '') }))}
          />
          <p className="panel-note">{SERIES_NOTES[g.series]}</p>
        </div>
        {series.finishes.length > 1 && (
          <div className="field">
            <span className="field-label">Finish</span>
            <Toggle<GlassFinish> label="Finish" value={g.finish} onChange={(v) => setGlass({ finish: v })} options={series.finishes.map((x) => ({ value: x.id, label: x.label }))} />
          </div>
        )}
        <div className="field">
          <span className="field-label">Combination</span>
          <Toggle<`${GlassCount}`>
            label="Combination"
            value={`${g.count}` as `${GlassCount}`}
            onChange={(v) => setGlass({ count: Number(v) as GlassCount })}
            options={[
              { value: '2', label: 'Two doors' },
              { value: '3', label: 'Three doors' },
            ]}
          />
          <p className="panel-note">
            Unit {formatInches(doorSize(unit).width)} wide × {formatInches(doorSize(unit).height)} high, with the frame.
          </p>
        </div>
      </Section>

      <Section title="Placement">
        <div className="field">
          <span className="field-label">Wall</span>
          <div className="wall-picker" role="radiogroup" aria-label="Wall">
            {frames.map((w) => (
              <button
                key={w.edge}
                type="button"
                role="radio"
                aria-checked={unit.wall === w.edge}
                className={`wall-chip${unit.wall === w.edge ? ' active' : ''}`}
                onClick={() => edit((x) => moveDoor(x, unit.id, w.edge, unit.offset))}
                title={`Wall ${w.letter}, ${formatInches(w.length)} inside`}
              >
                {w.letter}
              </button>
            ))}
          </div>
        </div>
        {fits ? (
          <Slider
            label="Distance from left end"
            value={Math.min(Math.max(Math.round(mmToIn(unit.offset)), loIn), hiIn)}
            min={loIn}
            max={hiIn}
            step={1}
            display={formatInches(unit.offset)}
            minLabel={`${loIn}"`}
            maxLabel={`${hiIn}"`}
            onInput={(v) => edit((x) => updateDoor(x, unit.id, { offset: inToMm(v) }), { transient: true })}
            onCommit={commit}
          />
        ) : (
          <p className="panel-error">This unit does not fit on wall {f?.letter}. Pick a longer wall or the two-door unit.</p>
        )}
      </Section>
    </>
  );
}
