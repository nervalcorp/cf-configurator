import {
  CONTROL_HEIGHT,
  type ControlModel,
  defaultControlPlacement,
  formatFeetInches,
  formatInches,
  formatInchesFine,
  framesByLetter,
  framesFor,
  getCondenser,
  getControl,
  getEvaporator,
  setSystem,
  unservedEvaporators,
  validate,
  inToMm,
  mmToIn,
} from '@wic/core';
import { useActiveCompartment, useStore } from '../store';
import { EvaporatorsSection } from './EvaporatorsSection';
import { CondensersSection } from './CondensersSection';
import { Card, Section, Slider, Toggle } from '../shell/controls';
import { useMemo } from 'react';

export function RefrigerationTab() {
  const c = useActiveCompartment();
  const config = useStore((s) => s.config);
  const { editCompartment: edit, commit, setUi } = useStore.getState();
  // Problems on this step for this compartment, for the cards' status pills.
  const issues = useMemo(() => validate(config).filter((i) => i.compartmentId === c.id && i.tab === 'refrigeration'), [config, c.id]);
  const statusFor = (re: RegExp): { kind: 'ok' | 'warn' | 'error'; text: string } | undefined => {
    const mine = issues.filter((i) => re.test(i.message));
    const errors = mine.filter((i) => i.severity === 'error').length;
    if (errors) return { kind: 'error', text: `${errors} to fix` };
    if (mine.length) return { kind: 'warn', text: `${mine.length} note${mine.length === 1 ? '' : 's'}` };
    return undefined;
  };
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const status = errorCount
    ? { kind: 'error' as const, text: `${errorCount} to fix` }
    : c.evaporators.length
      ? { kind: 'ok' as const, text: 'Checks out' }
      : undefined;
  const btu = (n: number) => `${Math.round(n).toLocaleString('en-US')} BTU/h`;
  const evapBtu = c.evaporators.reduce((n, e) => n + getEvaporator(e.model).btu, 0);
  const cuBtu = c.condensers.reduce((n, u) => n + getCondenser(u.model).btu, 0);
  const hp = c.condensers.reduce((n, u) => n + getCondenser(u.model).hp, 0) + c.evaporators.reduce((n, e) => n + (getEvaporator(e.model).hp ?? 0), 0);
  const unserved = unservedEvaporators(c).length;
  const systemRows: [string, string][] =
    c.system === 'split'
      ? [
          ['Evaporators', c.evaporators.length ? `${c.evaporators.length} · ${btu(evapBtu)}` : 'None yet'],
          ['Condensing units', c.condensers.length ? `${c.condensers.length} · ${btu(cuBtu)}${unserved ? ` · ${unserved} evaporator${unserved === 1 ? '' : 's'} unmatched` : ''}` : 'None yet'],
          ['Compressors', hp ? `${Math.round(hp * 100) / 100} HP total` : '—'],
        ]
      : [
          ['Packaged units', c.evaporators.length ? `${c.evaporators.length} · ${btu(evapBtu)}` : 'None yet'],
          ['Compressors', hp ? `${Math.round(hp * 100) / 100} HP total` : '—'],
        ];
  const evapSummary = c.evaporators.length ? `${c.evaporators.length} · ${btu(evapBtu)}` : 'None yet';
  const cuSummary = c.condensers.length ? `${c.condensers.length} · ${btu(cuBtu)}${unserved ? ` · ${unserved} unmatched` : ' · all matched'}` : 'None yet';
  const frames = framesFor(c);
  const def = getControl(c.control.model);
  const f = frames[c.control.wall];
  const setControl = (patch: Partial<typeof c.control>, transient = false) =>
    edit((x) => ({ ...x, control: { ...x.control, ...patch } }), { transient });
  const half = def ? def.width / 2 : 0;
  const loIn = Math.ceil(mmToIn(half));
  const hiIn = Math.max(loIn, Math.floor(mmToIn((f?.length ?? 0) - half)));

  return (
    <>
      <Card title="Cooling system" status={status}>
        <div className="card-pad">
        <Toggle<'split' | 'packaged'>
          label="Cooling system"
          value={c.system}
          onChange={(v) => {
            edit((x) => setSystem(x, v));
            setUi({ selectedEvap: null, selectedCu: null });
          }}
          options={[
            { value: 'split', label: 'Split system' },
            { value: 'packaged', label: 'Packaged (monoblock)' },
          ]}
        />
        <p className="panel-note">
          {c.system === 'split'
            ? 'Evaporators at the ceiling, piped to condensing units on the roof or outside.'
            : 'One self-contained unit: its cabinet sits on the roof and a plug through the ceiling cools the room. No separate evaporator or condensing unit.'}
          {c.evaporators.length > 0 && ' Switching removes the units below; you can undo.'}
        </p>
        <dl className="summary system-summary">
          {systemRows.map(([k, v]) => (
            <div key={k} className="summary-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        </div>
      </Card>

      {c.system === 'split' ? (
        <>
          <Card step="1" title="Evaporators" summary={evapSummary} status={statusFor(/^Evaporator/)}>
            <EvaporatorsSection c={c} />
          </Card>
          <Card step="2" title="Condensing units" summary={cuSummary} status={statusFor(/^Condensing unit|no condensing unit/)}>
            <CondensersSection c={c} />
          </Card>
        </>
      ) : (
        <Card step="1" title="Packaged units" summary={evapSummary} status={statusFor(/^Packaged unit|no packaged unit/)}>
          <EvaporatorsSection c={c} />
        </Card>
      )}

      <Card step={c.system === 'split' ? '3' : '2'} title="Controller" summary={def ? `${def.label} ${def.sku}` : 'None'} status={statusFor(/Smart Control|Temperature Controller|controller/i)}>

      <Section title="Controller">
        <Toggle<ControlModel>
          label="Controller"
          value={c.control.model}
          onChange={(v) => setControl({ model: v })}
          options={[
            { value: 'TSC2000', label: 'Smart Control' },
            { value: 'TC1000', label: 'Temperature' },
            { value: 'none', label: 'None' },
          ]}
        />
        {def && (
          <>
            <p className="panel-note">
              <strong>{def.sku}</strong>, {formatInchesFine(def.width)} × {formatInchesFine(def.height)} × {formatInchesFine(def.depth)} deep.
            </p>
            <ul className="feature-list">
              {def.features.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        )}
        {!def && <p className="panel-note">Every walk-in needs a controller. Pick one, or supply your own.</p>}
      </Section>

      {def && (
        <Section title="Placement" hint="Outside face of the wall">
          <div className="wall-picker" role="radiogroup" aria-label="Wall">
            {framesByLetter(frames).map((w) => (
              <button
                key={w.edge}
                type="button"
                role="radio"
                aria-checked={c.control.wall === w.edge}
                className={`wall-chip${c.control.wall === w.edge ? ' active' : ''}`}
                onClick={() => setControl({ wall: w.edge, offset: Math.min(c.control.offset, w.length - half) })}
              >
                {w.letter}
              </button>
            ))}
          </div>
          <Slider
            label="Left or right"
            value={Math.min(Math.max(Math.round(mmToIn(c.control.offset)), loIn), hiIn)}
            min={loIn}
            max={hiIn}
            step={1}
            display={formatInches(c.control.offset)}
            minLabel={`${loIn}"`}
            maxLabel={`${hiIn}"`}
            onInput={(v) => setControl({ offset: inToMm(v) }, true)}
            onCommit={commit}
          />
          <Slider
            label="Height to centre"
            value={Math.round(mmToIn(c.control.height))}
            min={mmToIn(CONTROL_HEIGHT.min)}
            max={mmToIn(CONTROL_HEIGHT.max)}
            step={1}
            display={formatFeetInches(c.control.height)}
            minLabel={formatFeetInches(CONTROL_HEIGHT.min)}
            maxLabel={formatFeetInches(CONTROL_HEIGHT.max)}
            onInput={(v) => setControl({ height: inToMm(v) }, true)}
            onCommit={commit}
          />
          <p className="panel-note">Measured from the left end of the wall seen from outside, and from the floor. 5' 0" is average eye level.</p>
          <button type="button" className="btn-link" onClick={() => edit((x) => ({ ...x, control: defaultControlPlacement(x) }))}>
            Put it back beside the door
          </button>
        </Section>
      )}


      </Card>
    </>
  );
}
