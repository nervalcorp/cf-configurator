import {
  type Compartment,
  type CondenserType,
  type CondensingUnit,
  CU_MATCH,
  MAX_EVAPS_PER_CU,
  addCondenser,
  bestModel,
  checkCondenser,
  condenserOptions,
  defaultCondenserPlace,
  getCondenser,
  getEvaporator,
  matchAllEvaporators,
  maxServed,
  removeCondenser,
  servedLoad,
  splitEvaporators,
  unservedEvaporators,
  updateCondenser,
} from '@wic/core';
import { FloorPlan } from '../floorplan/FloorPlan';
import { useStore } from '../store';
import { Section, Toggle } from '../shell/controls';

const tag = (u: CondensingUnit) => u.id.replace('cu', 'CU');
const btu = (n: number) => `${Math.round(n).toLocaleString('en-US')} BTU/h`;

export function CondensersSection({ c }: { c: Compartment }) {
  const site = useStore((s) => s.config.site.type);
  const selectedId = useStore((s) => s.ui.selectedCu);
  const { editCompartment: edit, setUi } = useStore.getState();
  const units = c.condensers;
  const sel = units.find((u) => u.id === selectedId) ?? units[0];
  const split = splitEvaporators(c);
  const unserved = unservedEvaporators(c);

  return (
    <>
      <Section title="Units" hint="For the split evaporators">
        <p className="panel-note first">
          {split.length === 0
            ? 'Add a split evaporator first. Packaged units carry their own condenser.'
            : `One unit serves up to ${MAX_EVAPS_PER_CU.indoor[c.temperature]} evaporator${MAX_EVAPS_PER_CU.indoor[c.temperature] === 1 ? '' : 's'} indoors and ${MAX_EVAPS_PER_CU.outdoor[c.temperature]} outdoors in a ${c.temperature}. Models that don't fit are greyed out with the reason.${unserved.length ? ` ${unserved.length} evaporator${unserved.length === 1 ? ' still needs' : 's still need'} a unit.` : ''}`}
        </p>
        {units.length > 0 && (
          <ul className="door-list">
            {units.map((u) => {
              const def = getCondenser(u.model);
              const chk = checkCondenser(c, u, site);
              return (
                <li key={u.id}>
                  <button type="button" className={`door-item${sel?.id === u.id ? ' active' : ''}`} aria-pressed={sel?.id === u.id} onClick={() => setUi({ selectedCu: u.id })}>
                    <span className="door-num">{tag(u)}</span>
                    <span className="door-sku">
                      {def.sku}
                      {chk.errors.length > 0 && <span className="nav-flag inline-flag" aria-label="needs attention" />}
                    </span>
                    <span className="door-where">
                      {def.type === 'indoor' ? 'Indoor, on the roof' : 'Outdoor'} · {btu(def.btu)} · serves {u.serves.map((id) => id.replace('ev', 'E')).join(', ') || 'nothing'}
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
            disabled={!split.length}
            onClick={() => {
              const r = addCondenser(c, site);
              edit(() => r.compartment);
              setUi({ selectedCu: r.id });
            }}
          >
            Add condensing unit
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!unserved.length}
            onClick={() => {
              const next = matchAllEvaporators(c, site);
              edit(() => next);
              setUi({ selectedCu: next.condensers[next.condensers.length - 1]?.id ?? null });
            }}
          >
            Match all evaporators
          </button>
          {sel && (
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              onClick={() => {
                edit((x) => removeCondenser(x, sel.id));
                setUi({ selectedCu: units.find((u) => u.id !== sel.id)?.id ?? null });
              }}
            >
              Remove {tag(sel)}
            </button>
          )}
        </div>
      </Section>

      {units.length > 0 && (
        <Section title="Where they sit" hint="Drag to move; dashed = on the roof">
          <FloorPlan mode="condensers" />
        </Section>
      )}

      {sel && <CondenserEditor key={sel.id} c={c} u={sel} />}
    </>
  );
}

function CondenserEditor({ c, u }: { c: Compartment; u: CondensingUnit }) {
  const site = useStore((s) => s.config.site.type);
  const { editCompartment: edit } = useStore.getState();
  const def = getCondenser(u.model);
  const set = (patch: Partial<CondensingUnit>) => edit((x) => updateCondenser(x, u.id, patch));
  const options = condenserOptions(c, u.serves).filter((o) => o.def.type === def.type);
  const load = servedLoad(c, u);
  const others = new Set(c.condensers.filter((x) => x.id !== u.id).flatMap((x) => x.serves));
  const split = splitEvaporators(c);

  return (
    <>
      <Section title={`Condensing unit ${tag(u)}`}>
        <Toggle<CondenserType>
          label="Installation"
          value={def.type}
          onChange={(type) => {
            const serves = u.serves.slice(0, MAX_EVAPS_PER_CU[type][c.temperature]);
            const model = bestModel(c, type, serves);
            set({ model, serves, ...defaultCondenserPlace(c, model, serves) });
          }}
          options={[
            { value: 'indoor', label: 'Indoor (on the roof)' },
            { value: 'outdoor', label: 'Outdoor' },
          ]}
        />
        <div className="field">
          <span className="field-label">Serves</span>
          <div className="check-list" role="group" aria-label="Evaporators this unit serves">
            {split.map((e) => {
              const on = u.serves.includes(e.id);
              const taken = others.has(e.id);
              const full = !on && u.serves.length >= maxServed(def);
              return (
                <label key={e.id} className={`check-row${taken || full ? ' disabled' : ''}`} title={taken ? 'Served by another unit' : full ? `This unit serves at most ${maxServed(def)}` : undefined}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={taken || full}
                    onChange={() => set({ serves: on ? u.serves.filter((x) => x !== e.id) : [...u.serves, e.id] })}
                  />
                  <span>
                    {e.id.replace('ev', 'E')} · {getEvaporator(e.model).sku} · {btu(getEvaporator(e.model).btu)}
                    {taken && <em> (served by another unit)</em>}
                  </span>
                </label>
              );
            })}
          </div>
          {u.serves.length > 1 && <p className="panel-note">Each evaporator on a shared unit needs its own liquid line solenoid valve (installer supplied).</p>}
        </div>
        <label className="field">
          <span className="field-label">Model {load > 0 && `· load ${btu(load)}`}</span>
          <select className="custom-select" value={u.model} onChange={(ev) => set({ model: ev.target.value })}>
            {options.map((o) => (
              <option key={o.def.sku} value={o.def.sku} disabled={!!o.blocker && o.def.sku !== u.model}>
                {o.def.sku} · {btu(o.def.btu)} · {o.def.hp} HP{o.matched ? ' · matched pair' : ''}
                {o.blocker ? ` — ${o.blocker}` : ''}
              </option>
            ))}
          </select>
        </label>
        <dl className="summary spec">
          {[
            ['Capacity', `${btu(def.btu)}${load ? ` (${Math.round((def.btu / load) * 100)}% of the load; aim for ${Math.round(CU_MATCH.target * 100)}-${Math.round(CU_MATCH.max * 100)}%)` : ''}`],
            ['Horsepower', `${def.hp} HP`],
            ['Fans', `${def.fans} · ${def.cfmPerFan.toLocaleString('en-US')}${def.fans > 1 ? ` × ${def.fans}` : ''} CFM`],
            ['Power', def.volts],
            ['RLA / FLA / LRA', `${def.rla} / ${def.fla} / ${def.lra}`],
            ['Compressor', def.compressor],
            ['Min circuit', `${def.minCircuit} A`],
            ['High pressure', `${def.highPressure} PSI`],
            ['Size (W × D × H)', `${def.shape.w}" × ${def.shape.d}" × ${def.shape.h}"${def.shape.feetD ? ` (${def.shape.feetD}" deep at the feet)` : ''}`],
            ['Drawing', def.shape.drawing],
          ].map(([k, v]) => (
            <div key={k} className="summary-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="button-row">
          <button type="button" className="btn btn-ghost" onClick={() => set({ rotation: (u.rotation + 90) % 360 })}>
            ↻ Turn 90°
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => set(defaultCondenserPlace(c, u.model, u.serves))}>
            Put it back by its evaporator
          </button>
        </div>
        {def.type === 'indoor' && site === 'outdoor' && <p className="panel-note">Indoor units need shelter; on an outdoor walk-in, use an outdoor unit.</p>}
      </Section>
    </>
  );
}
