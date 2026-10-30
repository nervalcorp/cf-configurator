import { useMemo, useState } from 'react';
import {
  CHECKER_PLATE,
  type Compartment,
  type ComponentTree,
  DOOR_CLOSER_SKU,
  HINGE_KIT,
  getDoorFamily,
  HANDLES,
  RAMP,
  SHELVING,
  SHAPES,
  buildCompartment,
  formatFeetInches,
  formatInches,
  getControl,
  getEvaporator,
  getCondenser,
  CONTROL_LIMITS,
  validate,
} from '@wic/core';
import { openConfiguration, saveConfiguration } from '../files';
import { TABS, useStore } from '../store';
import { Section } from '../shell/controls';

const FINISH_NAMES: Record<string, string> = {
  white: 'White coated',
  'grey-white': 'Grey white coated',
  decal: 'Logo decals',
  custom: 'Custom colour',
};
const FLOOR_NAMES: Record<string, string> = { standard: 'Standard', durafloor: 'DuraFloor', recessed: 'Recessed', none: 'No floor' };

interface Row {
  name: string;
  sku: string;
  qty: number;
}

/** Products and add-ons in one compartment, grouped by model. */
function partsOf(c: Compartment, tree: ComponentTree, into: Map<string, Row>) {
  const add = (sku: string, name: string, qty = 1) => {
    const k = `${name}|${sku}`;
    const row = into.get(k);
    if (row) row.qty += qty;
    else into.set(k, { sku, name, qty });
  };
  tree.doors.forEach((d) => add(d.sku, d.tag.startsWith('G') ? 'Glass door unit' : 'Door'));
  c.doors.forEach((d) => {
    if (getDoorFamily(d.family).kind === 'swing') add(HINGE_KIT.sku(d.hinge), HINGE_KIT.label, HINGE_KIT.perDoor);
    if (d.closer) add(DOOR_CLOSER_SKU, 'Door closer');
    if (d.handle !== 'included') add(d.handle, HANDLES.find((h) => h.id === d.handle)?.label.replace(/ \(.*\)$/, '') ?? 'Handle');
  });
  const ramps = tree.parts.filter((p) => p.kind === 'ramp').length;
  if (ramps) add(RAMP.sku, RAMP.label, ramps);
  c.evaporators.forEach((e) => {
    const d = getEvaporator(e.model);
    add(d.sku, d.kind === 'packaged' ? 'Packaged unit (self-contained)' : 'Evaporator');
  });
  c.condensers.forEach((u) => add(getCondenser(u.model).sku, `Condensing unit, ${getCondenser(u.model).type}`));
  const hp = c.condensers.reduce((n, u) => n + getCondenser(u.model).hp, 0) + c.evaporators.reduce((n, e) => n + (getEvaporator(e.model).hp ?? 0), 0);
  if (c.control.model === 'TSC2000' && hp > CONTROL_LIMITS.volts220Hp) add('—', CONTROL_LIMITS.controlBox);
  const ctl = getControl(c.control.model);
  if (ctl) add(ctl.sku, ctl.label);
  if (c.accessories.checker.length) add('—', `${CHECKER_PLATE.label} (sq ft)`, c.accessories.checker.length);
  const bays = c.accessories.shelving.reduce((n, u) => n + u.bays, 0);
  if (bays) add(SHELVING.sku, SHELVING.label, bays);
  const trays = c.accessories.shelving.reduce((n, u) => n + u.gravity.length, 0);
  if (trays) add(SHELVING.gravitySku, SHELVING.gravityLabel, trays);
}

export function ReviewTab() {
  const config = useStore((s) => s.config);
  const { setUi, load, setActive } = useStore.getState();
  const trees = useMemo(() => config.compartments.map((c) => buildCompartment(c, config.site.type)), [config]);
  const issues = useMemo(() => validate(config), [config]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tabLabel = (id: string) => TABS.find((t) => t.id === id)?.label ?? id;
  const nameOf = (id: string) => config.compartments.find((c) => c.id === id)?.name ?? '';
  const many = config.compartments.length > 1;

  const parts = useMemo(() => {
    const map = new Map<string, Row>();
    config.compartments.forEach((c, i) => partsOf(c, trees[i], map));
    return [...map.values()];
  }, [config, trees]);

  return (
    <>
      {issues.length > 0 ? (
        <Section title="Fix before quoting">
          <ul className="issue-list">
            {issues.map((i, k) => (
              <li key={k} className={`issue issue-${i.severity}`}>
                <span>
                  {many && <strong>{nameOf(i.compartmentId)}: </strong>}
                  {i.message}
                </span>
                <button
                  type="button"
                  className="issue-fix"
                  onClick={() => {
                    setActive(i.compartmentId);
                    setUi(i.ref ? { tab: i.tab, selectedDoor: i.ref } : { tab: i.tab });
                  }}
                >
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

      {config.compartments.map((c, i) => (
        <CompartmentSummary key={c.id} c={c} tree={trees[i]} site={config.site.type} />
      ))}

      {parts.length > 0 && (
        <Section title={many ? 'Products and hardware, all compartments' : 'Products and hardware'} hint="ICC models, under audit">
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
        {loadError && (
          <p className="panel-error" role="alert">
            {loadError}
          </p>
        )}
        <button type="button" className="btn btn-primary btn-block" disabled title="Quote requests are not connected yet">
          Request quote
        </button>
      </Section>
    </>
  );
}

function CompartmentSummary({ c, tree, site }: { c: Compartment; tree: ComponentTree; site: string }) {
  const ramps = tree.parts.filter((p) => p.kind === 'ramp').length;
  const ctl = getControl(c.control.model);
  const rows: [string, string][] = [
    ['Type', `${site === 'indoor' ? 'Indoor' : 'Outdoor'} ${c.temperature}`],
    ['Shape', SHAPES.find((s) => s.id === c.shape)?.label ?? c.shape],
    ['Outside size', `${formatFeetInches(c.boxW)} × ${formatFeetInches(c.boxD)}`],
    ['Wall panels', `${formatFeetInches(c.height)} high, ${formatInches(c.wallThickness)} PIR`],
    ['Overall height', `${formatFeetInches(tree.overall.height)} with floor and ceiling`],
    ['Exterior', FINISH_NAMES[c.finishes.exterior]],
    ['Floor', FLOOR_NAMES[c.finishes.floor]],
    ['Doors', `${c.doors.filter((d) => d.family !== 'glass').length || 'None'}`],
    ['Glass doors', `${c.doors.filter((d) => d.family === 'glass').length || 'None'}`],
    ['Ramps', ramps ? `${ramps}` : 'None'],
    ['Condensing units', c.condensers.length ? c.condensers.map((u) => getCondenser(u.model).sku).join(', ') : 'None'],
    ['Evaporators', c.evaporators.length ? `${c.evaporators.length}, ${c.evaporators.reduce((n, e) => n + getEvaporator(e.model).btu, 0).toLocaleString('en-US')} BTU/h total` : 'None'],
    ['Controller', ctl ? `${ctl.label} ${ctl.sku}` : 'None'],
    ['Shelving', c.accessories.shelving.length ? `${c.accessories.shelving.reduce((n, u) => n + u.bays, 0)} bays` : 'None'],
  ];
  return (
    <Section title={c.name}>
      <dl className="summary">
        {rows.map(([k, v]) => (
          <div key={k} className="summary-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <table className="part-table walls-table">
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
                {w.doors > 0 && <span className="part-tag">{w.doors === 1 ? '1 opening' : `${w.doors} openings`}</span>}
              </td>
              <td>{formatInches(w.length)}</td>
              <td>{formatInches(w.insideLength)}</td>
              <td>{formatInches(w.height)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
