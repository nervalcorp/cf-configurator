import {
  CONTROL_HEIGHT,
  type ControlModel,
  defaultControlPlacement,
  formatFeetInches,
  formatInches,
  formatInchesFine,
  framesByLetter,
  framesFor,
  getControl,
  inToMm,
  mmToIn,
} from '@wic/core';
import { useActiveCompartment, useStore } from '../store';
import { Section, Slider, Toggle } from '../shell/controls';

export function RefrigerationTab() {
  const c = useActiveCompartment();
  const { editCompartment: edit, commit } = useStore.getState();
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

      <Section title="Evaporator and condensing unit">
        <p className="panel-note">Unit selection will be set here. Capacity sizing waits on signed-off engineering rules.</p>
      </Section>
    </>
  );
}
