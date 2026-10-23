import { useMemo, useState } from 'react';
import { CHECKER_PLATE, DOOR_CLOSER_SKU, HANDLES, SHAPES, getControl, buildCompartment, formatFeetInches, formatInches, validate } from '@wic/core';
import { openConfiguration, saveConfiguration } from '../files';
import { TABS, useActiveCompartment, useStore } from '../store';
import { Section } from '../shell/controls';

const FINISH_NAMES: Record<string, string> = {
  white: 'White coated',
  'grey-white': 'Grey white coated',
  decal: 'Logo decals',
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

  // Doors and the add-on hardware chosen for them, grouped by model.
  const parts = (() => {
    const map = new Map<string, { name: string; sku: string; qty: number }>();
    const add = (sku: string, name: string) => {
      const row = map.get(sku);
      if (row) row.qty += 1;
      else map.set(sku, { sku, name, qty: 1 });
    };
    tree.doors.forEach((d) => add(d.sku, d.tag.startsWith('G') ? 'Glass door unit' : 'Door'));
    c.doors.forEach((d) => {
      if (d.closer) add(DOOR_CLOSER_SKU, 'Door closer');
      if (d.handle !== 'included') add(d.handle, HANDLES.find((h) => h.id === d.handle)?.label.replace(/ \(.*\)$/, '') ?? 'Handle');
    });
    const ctl = getControl(c.control.model);
    if (ctl) add(ctl.sku, ctl.label);
    const plates = c.accessories.checker.length;
    if (plates) map.set('checker', { sku: '—', name: `${CHECKER_PLATE.label} (sq ft)`, qty: plates });
    return [...map.values()];
  })();

  const rows: [string, string][] = [
    ['Type', `${config.site.type === 'indoor' ? 'Indoor' : 'Outdoor'} ${c.temperature}`],
    ['Shape', SHAPES.find((s) => s.id === c.shape)?.label ?? c.shape],
    ['Outside size', `${formatFeetInches(c.boxW)} × ${formatFeetInches(c.boxD)}`],
    ['Wall panels', `${formatFeetInches(c.height)} high, ${formatInches(c.wallThickness)} PIR`],
    ['Overall height', `${formatFeetInches(tree.overall.height)} with floor and ceiling`],
    ['Exterior', FINISH_NAMES[c.finishes.exterior]],
    ['Floor', FLOOR_NAMES[c.finishes.floor]],
    ['Doors', `${c.doors.filter((d) => d.family !== 'glass').length || 'None'}`],
    ['Glass doors', `${c.doors.filter((d) => d.family === 'glass').length || 'None'}`],
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
                <button type="button" className="issue-fix" onClick={() => setUi(i.ref ? { tab: i.tab, selectedDoor: i.ref } : { tab: i.tab })}>
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

      <Section title="Walls">
        <table className="part-table">
          <thead>
            <tr>
              <th scope="col">Wall</th>
              <th scope="col">Outside</th>
              <th scope="col">Inside</th>
              <th scope="col">Height</th>
            </tr>
          </thead>
          <tbody>
            {tree.walls.map((w) => (
              <tr key={w.letter}>
                <td>
                  {w.letter}
                  {w.doors > 0 && <span className="part-tag">{w.doors === 1 ? 'door' : `${w.doors} doors`}</span>}
                </td>
                <td>{formatInches(w.length)}</td>
                <td>{formatInches(w.insideLength)}</td>
                <td>{formatInches(w.height)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="panel-note">
          {tree.parts.filter((p) => p.kind === 'post').length} corner joints. A full part list with part numbers comes with the BOM step.
        </p>
      </Section>

      {parts.length > 0 && (
        <Section title="Products and hardware" hint="ICC models, under audit">
          <table className="part-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Model</th>
                <th scope="col">Qty</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.name + p.sku}>
                  <td>{p.name}</td>
                  <td>{p.sku}</td>
                  <td>{p.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

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
