import { useMemo, useState } from 'react';
import { SHAPES, buildCompartment, formatFeetInches, formatInches, validate } from '@wic/core';
import { openConfiguration, saveConfiguration } from '../files';
import { TABS, useActiveCompartment, useStore } from '../store';
import { Section } from '../shell/controls';

const FINISH_NAMES: Record<string, string> = {
  'stucco-aluminum': 'Stucco aluminum',
  'stucco-galvanized': 'Stucco galvanized',
  'stucco-stainless': 'Stucco stainless',
  stainless: 'Stainless steel',
  white: 'White coated',
  custom: 'Custom colour',
};
const FLOOR_NAMES: Record<string, string> = { standard: 'Standard', durafloor: 'DuraFloor', recessed: 'Recessed', none: 'No floor' };

export function ReviewTab() {
  const config = useStore((s) => s.config);
  const { setUi, load } = useStore.getState();
  const c = useActiveCompartment();
  const tree = useMemo(() => buildCompartment(c, config.site.type), [c, config.site.type]);
  const issues = useMemo(() => validate(config), [config]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tabLabel = (id: string) => TABS.find((t) => t.id === id)?.label ?? id;

  const rows: [string, string][] = [
    ['Type', `${config.site.type === 'indoor' ? 'Indoor' : 'Outdoor'} ${c.temperature}`],
    ['Shape', SHAPES.find((s) => s.id === c.shape)?.label ?? c.shape],
    ['Outside size', `${formatFeetInches(c.boxW)} × ${formatFeetInches(c.boxD)} × ${formatFeetInches(c.height)} high`],
    ['Exterior', FINISH_NAMES[c.finishes.exterior]],
    ['Floor', FLOOR_NAMES[c.finishes.floor]],
    ['Door', `${formatInches(c.door.width)}, hinged ${c.door.hinge}, ${formatInches(c.door.offset)} from the left corner`],
    ['Ramp', c.accessories.ramp === 'none' ? 'None' : c.accessories.ramp === 'interior' ? 'Interior' : 'Exterior'],
  ];

  return (
    <>
      {issues.length > 0 ? (
        <Section title="Fix before quoting">
          <ul className="issue-list">
            {issues.map((i, k) => (
              <li key={k} className={`issue issue-${i.severity}`}>
                <span>{i.message}</span>
                <button type="button" className="issue-fix" onClick={() => setUi({ tab: i.tab })}>
                  Go to {tabLabel(i.tab)}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Section title="Ready">
          <p className="panel-note">Everything checks out. Quote requests are not connected yet; save the configuration to send it on.</p>
        </Section>
      )}

      <Section title="Summary">
        <dl className="summary">
          {rows.map(([k, v]) => (
            <div key={k} className="summary-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Wall panels" hint="Outside lengths">
        <table className="part-table">
          <thead>
            <tr>
              <th scope="col">Panel</th>
              <th scope="col">Length</th>
              <th scope="col">Height</th>
            </tr>
          </thead>
          <tbody>
            {tree.walls.map((w) => (
              <tr key={w.letter}>
                <td>
                  {w.letter}
                  {w.hasDoor && <span className="part-tag">door</span>}
                </td>
                <td>{formatInches(w.length)}</td>
                <td>{formatInches(w.height)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="panel-note">
          {tree.parts.filter((p) => p.kind === 'post').length} corner joints. A full part list with part numbers comes with the BOM step.
        </p>
      </Section>

      <Section title="Configuration file">
        <div className="button-row">
          <button type="button" className="btn btn-ghost" onClick={() => saveConfiguration(config)}>
            Save as file
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              openConfiguration()
                .then((cfg) => {
                  setLoadError(null);
                  load(cfg);
                })
                .catch((e: Error) => setLoadError(e.message))
            }
          >
            Open a file
          </button>
        </div>
        {loadError && <p className="panel-error" role="alert">{loadError}</p>}
        <button type="button" className="btn btn-primary btn-block" disabled title="Quote requests are not connected yet">
          Request quote
        </button>
      </Section>
    </>
  );
}
