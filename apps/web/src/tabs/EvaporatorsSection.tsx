import { useMemo } from 'react';
import {
  type Compartment,
  EVAPORATORS,
  PACKAGED,
  EVAP_RULES,
  type Evaporator,
  addEvaporator,
  checkEvaporator,
  evaporatorCoverage,
  evaporatorThrow,
  formatInches,
  framesByLetter,
  framesFor,
  getEvaporator,
  inToMm,
  mmToIn,
  removeEvaporator,
  requiredGap,
  suggestEvaporators,
  updateEvaporator,
} from '@wic/core';
import { FloorPlan } from '../floorplan/FloorPlan';
import { useStore } from '../store';
import { Section, Slider } from '../shell/controls';

const ft = (mm: number) => `${Math.round(mm / 304.8)}'`;
const tag = (e: Evaporator) => e.id.replace('ev', 'E');

export function EvaporatorsSection({ c }: { c: Compartment }) {
  const selectedId = useStore((s) => s.ui.selectedEvap);
  const { editCompartment: edit, setUi } = useStore.getState();
  const units = c.evaporators;
  const sel = units.find((e) => e.id === selectedId) ?? units[0];
  // What the rules suggest for this room, without applying it (re-run only when the room changes).
  const roomKey = `${c.shape}|${c.boxW}|${c.boxD}|${c.notchW}|${c.notchD}|${c.height}|${c.temperature}|${c.doors.map((d) => `${d.wall}:${Math.round(d.offset)}:${d.family}`).join(',')}`;
  const suggestion = useMemo(() => suggestEvaporators(c), [roomKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const coverage = evaporatorCoverage(c);
  const total = units.reduce((n, e) => n + getEvaporator(e.model).btu, 0);

  return (
    <>
      <Section title="Evaporators" hint="At the ceiling, blowing into the room">
        <p className="panel-note first">
          This room is about {ft(c.boxW)} × {ft(c.boxD)}. One unit throws about 25' (20' is comfortable) and covers about 15' of width. The rules suggest{' '}
          <strong>
            {suggestion.count} unit{suggestion.count === 1 ? '' : 's'}
          </strong>{' '}
          here. You pick the models.
        </p>
        {units.length > 0 && (
          <ul className="door-list">
            {units.map((e) => {
              const def = getEvaporator(e.model);
              const chk = checkEvaporator(c, e);
              const f = framesFor(c)[e.wall];
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`door-item${sel?.id === e.id ? ' active' : ''}`}
                    aria-pressed={sel?.id === e.id}
                    onClick={() => setUi({ selectedEvap: e.id })}
                  >
                    <span className="door-num">{tag(e)}</span>
                    <span className="door-sku">
                      {def.sku}
                      {chk.errors.length > 0 && <span className="nav-flag inline-flag" aria-label="needs attention" />}
                    </span>
                    <span className="door-where">
                      {def.btu.toLocaleString('en-US')} BTU/h · {def.fans} fan{def.fans === 1 ? '' : 's'} · wall {f?.letter} · throws {ft(evaporatorThrow(c, e))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="button-row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const r = addEvaporator(c);
              if (!r.id) return;
              edit(() => r.compartment);
              setUi({ selectedEvap: r.id });
            }}
          >
            Add evaporator
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            title={units.length ? 'Replaces the units above; you can undo' : undefined}
            onClick={() => {
              const r = suggestEvaporators(c);
              edit(() => r.compartment);
              setUi({ selectedEvap: r.compartment.evaporators[0]?.id ?? null });
            }}
          >
            Suggest layout
          </button>
          {sel && (
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              onClick={() => {
                edit((x) => removeEvaporator(x, sel.id));
                setUi({ selectedEvap: units.find((e) => e.id !== sel.id)?.id ?? null });
              }}
            >
              Remove {tag(sel)}
            </button>
          )}
        </div>
        {units.length > 0 && (
          <p className="panel-note">
            Total {total.toLocaleString('en-US')} BTU/h. Air reaches about {Math.round(coverage * 100)}% of the floor within 20'.
            {units.length > 1 && ' All units in a room run from its one controller.'}
          </p>
        )}
      </Section>

      {units.length > 0 && (
        <Section title="Ceiling plan" hint="Drag a unit along its wall, or onto another wall">
          <FloorPlan mode="evaporators" />
        </Section>
      )}

      {sel && <EvaporatorEditor key={sel.id} c={c} e={sel} />}
    </>
  );
}

function EvaporatorEditor({ c, e }: { c: Compartment; e: Evaporator }) {
  const { editCompartment: edit, commit } = useStore.getState();
  const def = getEvaporator(e.model);
  const frames = framesFor(c);
  const f = frames[e.wall];
  const split = EVAPORATORS.filter((x) => x.line === c.temperature);
  const packaged = PACKAGED.filter((x) => x.line === c.temperature);
  const need = requiredGap(e.model);
  const half = def.length / 2;
  const loIn = Math.ceil(mmToIn(half));
  const hiIn = Math.max(loIn, Math.floor(mmToIn((f?.length ?? 0) - half)));
  const set = (patch: Partial<Evaporator>, transient = false) => edit((x) => updateEvaporator(x, e.id, patch), { transient });

  return (
    <>
      <Section title={`Evaporator ${tag(e)}`} hint={c.temperature === 'freezer' ? 'Freezer models' : 'Cooler models'}>
        <label className="field">
          <span className="field-label">Model</span>
          <select
            className="custom-select"
            value={e.model}
            onChange={(ev) => {
              const model = ev.target.value;
              // Keep the rear gap at least what the new model needs.
              set({ model, gap: Math.max(e.gap, requiredGap(model)) });
            }}
          >
            <optgroup label="Split evaporators (need a condensing unit)">
              {split.map((o) => (
                <option key={o.sku} value={o.sku}>
                  {o.sku} · {o.btu.toLocaleString('en-US')} BTU/h · {o.fans} fan{o.fans === 1 ? '' : 's'}
                </option>
              ))}
            </optgroup>
            <optgroup label="Packaged units (self-contained)">
              {packaged.map((o) => (
                <option key={o.sku} value={o.sku}>
                  {o.sku} · {o.btu.toLocaleString('en-US')} BTU/h · {o.hp} HP
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <dl className="summary spec">
          {[
            ['Capacity', `${def.btu.toLocaleString('en-US')} BTU/h`],
            ['Fans', `${def.fans}`],
            ['Airflow', `${def.cfmPerFan.toLocaleString('en-US')}${def.fans > 1 ? ` × ${def.fans}` : ''} CFM`],
            ['Power', def.volts],
            ['Min circuit', `${def.minCircuit} A`],
            ...(def.kind === 'packaged'
              ? [
                  ['Type', 'Packaged: its own condenser on the roof'],
                  ['Horsepower', `${Math.round((def.hp ?? 0) * 100) / 100} HP`],
                  ['Condenser fan', `${def.condenserCfm?.toLocaleString('en-US')} CFM`],
                  ['Refrigerants', def.refrigerants ?? ''],
                  ['Compressor', def.compressor ?? ''],
                ]
              : [['TXV', def.txv]]),
            ...(def.heaters ? [['Defrost heaters', def.heaters]] : []),
            ['Size', `${formatInches(def.length)} × ${formatInches(def.height)} × ${formatInches(def.depth)}${def.sizeEstimated ? ' (estimated)' : ''}`],
          ].map(([k, v]) => (
            <div key={k} className="summary-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Placement">
        <div className="wall-picker" role="radiogroup" aria-label="Wall">
          {framesByLetter(frames).map((w) => (
            <button
              key={w.edge}
              type="button"
              role="radio"
              aria-checked={e.wall === w.edge}
              className={`wall-chip${e.wall === w.edge ? ' active' : ''}`}
              disabled={w.length < def.length}
              onClick={() => set({ wall: w.edge, offset: Math.min(Math.max(e.offset, half), w.length - half) })}
            >
              {w.letter}
            </button>
          ))}
        </div>
        <Slider
          label="Along the wall"
          value={Math.min(Math.max(Math.round(mmToIn(e.offset)), loIn), hiIn)}
          min={loIn}
          max={hiIn}
          step={1}
          display={formatInches(e.offset)}
          minLabel={`${loIn}"`}
          maxLabel={`${hiIn}"`}
          onInput={(v) => set({ offset: inToMm(v) }, true)}
          onCommit={commit}
        />
        <Slider
          label="Gap behind the unit"
          value={Math.round(mmToIn(e.gap))}
          min={6}
          max={48}
          step={1}
          display={formatInches(e.gap)}
          minLabel={'6"'}
          maxLabel={'48"'}
          onInput={(v) => set({ gap: inToMm(v) }, true)}
          onCommit={commit}
        />
        <p className="panel-note">
          Needs at least {formatInches(need)} behind it for return air (the coil height, never under 12"). Keep it off any wall with a door, and keep product
          12" clear. Units throwing past {Math.round(EVAP_RULES.throwMax / 304.8)}' are flagged.
        </p>
      </Section>
    </>
  );
}
