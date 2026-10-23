import {
  type Compartment,
  CATALOG_SOURCE,
  DOOR_CLOSER_SKU,
  DOOR_FAMILIES,
  type Door,
  type DoorFamilyId,
  HANDLES,
  type HandleId,
  type HingeSide,
  type Swing,
  TRAFFIC_FINISHES,
  type TrafficFinish,
  addDoor,
  doorSku,
  doorTag,
  framesFor,
  formatInches,
  getDoorFamily,
  inToMm,
  mmToIn,
  moveDoor,
  offsetRange,
  removeDoor,
  updateDoor,
} from '@wic/core';
import { FloorPlan } from '../floorplan/FloorPlan';
import { useActiveCompartment, useStore } from '../store';
import { Section, Slider, Switch, Toggle } from '../shell/controls';

type ManType = 'semi' | 'full' | 'full-window';
const MAN_TYPES: Record<ManType, Partial<Door>> = {
  semi: { series: '3478', window: false },
  full: { series: '13478', window: false },
  'full-window': { series: '13478', window: true },
};

export function DoorsTab() {
  const c = useActiveCompartment();
  const selectedId = useStore((s) => s.ui.selectedDoor);
  const { editCompartment: edit, setUi } = useStore.getState();
  const frames = framesFor(c);
  const doors = c.doors.filter((d) => d.family !== 'glass');
  const sel = doors.find((d) => d.id === selectedId) ?? doors[0];
  const patch = (p: Partial<Door>) => sel && edit((x) => updateDoor(x, sel.id, p));

  return (
    <>
      <Section title="Doors on this compartment">
        {doors.length ? (
          <ul className="door-list">
            {doors.map((d) => (
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
                    Wall {frames[d.wall]?.letter ?? '?'} · {formatInches(d.offset)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-note">This compartment has no door yet. Add one to get started.</p>
        )}
        <div className="button-row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const r = addDoor(c);
              if (!r.id) return;
              edit(() => r.compartment);
              setUi({ selectedDoor: r.id });
            }}
          >
            Add door
          </button>
          {sel && (
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              onClick={() => {
                const rest = doors.filter((d) => d.id !== sel.id);
                edit((x) => removeDoor(x, sel.id));
                setUi({ selectedDoor: rest[0]?.id ?? null });
              }}
            >
              Remove {doorTag(c.doors, sel.id)}
            </button>
          )}
        </div>
      </Section>

      <Section title="Floor plan" hint="Drag a door along its wall, or click another wall to move it">
        <FloorPlan mode="doors" pick="doors" />
      </Section>

      {sel && <DoorEditor key={sel.id} c={c} door={sel} tag={doorTag(c.doors, sel.id)} patch={patch} />}

      <Section title="Catalog">
        <p className="panel-note">Model numbers come from the {CATALOG_SOURCE}. Jamb guards, kickplates and pressure-relief vents have no ICC model yet, so they are not offered. Glass display doors are on the next step.</p>
      </Section>
    </>
  );
}

function DoorEditor({ c, door, tag, patch }: { c: Compartment; door: Door; tag: string; patch: (p: Partial<Door>) => void }) {
    const { editCompartment: edit, commit } = useStore.getState();
    const frames = framesFor(c);
    const fam = getDoorFamily(door.family);
    const f = frames[door.wall];
    const [lo, hi] = f ? offsetRange(door, f.length) : [0, 0];
    const fits = hi >= lo;
    const loIn = Math.ceil(mmToIn(lo));
    const hiIn = Math.max(loIn, Math.floor(mmToIn(hi)));
    const swingOrTraffic = fam.kind === 'swing';

    return (
      <>
        <Section title={`Door ${tag}`} hint={doorSku(door, c.temperature)}>
          <label className="field">
            <span className="field-label">Type</span>
            <select
              className="custom-select"
              value={door.family}
              onChange={(e) => {
                const family = e.target.value as DoorFamilyId;
                // Re-seat the door so a wider type still lands where it fits.
                edit((x) => moveDoor(updateDoor(x, door.id, { family }), door.id, door.wall, door.offset));
              }}
            >
              {DOOR_FAMILIES.filter((o) => o.kind !== 'glass').map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {door.family === 'man' && (
            <div className="field">
              <span className="field-label">Door type</span>
              <Toggle<ManType>
                label="Door type"
                value={door.series === '13478' ? (door.window ? 'full-window' : 'full') : 'semi'}
                onChange={(v) => patch(MAN_TYPES[v])}
                options={[
                  { value: 'semi', label: 'Semi-buried' },
                  { value: 'full', label: 'Full-buried' },
                  { value: 'full-window', label: 'With window' },
                ]}
              />
              <p className="panel-note">
                {door.series === '13478'
                  ? `Full-buried: the door sits flush with the wall in its own frame.${door.window ? ' Heated 12" × 16" window.' : ''}`
                  : 'Semi-buried: the door and part of its body stand out from the wall.'}
              </p>
            </div>
          )}
          {door.family === 'rollup' && (c.temperature !== 'cooler' || Math.abs(c.height - inToMm(120)) > 0.5) && (
            <div className="field">
              <p className="panel-error">The roll-up door is made for coolers with 10' 0" (120") wall panels.</p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => edit((x) => ({ ...x, height: inToMm(120), temperature: 'cooler' }))}
              >
                Set this compartment to a 10' cooler
              </button>
            </div>
          )}
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
                  aria-checked={door.wall === w.edge}
                  className={`wall-chip${door.wall === w.edge ? ' active' : ''}`}
                  onClick={() => edit((x) => moveDoor(x, door.id, w.edge, door.offset))}
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
              value={Math.min(Math.max(Math.round(mmToIn(door.offset)), loIn), hiIn)}
              min={loIn}
              max={hiIn}
              step={1}
              display={formatInches(door.offset)}
              minLabel={`${loIn}"`}
              maxLabel={`${hiIn}"`}
              onInput={(v) => edit((x) => updateDoor(x, door.id, { offset: inToMm(v) }), { transient: true })}
              onCommit={commit}
            />
          ) : (
            <p className="panel-error">This door does not fit on wall {f?.letter}. Pick another wall or a smaller door.</p>
          )}
          <p className="panel-note">Measured from the inside of the left corner post, seen from outside.</p>
        </Section>

        {fam.kind !== 'rollup' && fam.kind !== 'traffic' && (
          <Section title={fam.kind === 'slide' ? 'Slides open to' : 'Door swing'} hint={fam.kind === 'slide' ? 'Seen from outside' : 'Hinge side, seen from outside'}>
            <Toggle<HingeSide>
              label={fam.kind === 'slide' ? 'Slide direction' : 'Hinge side'}
              value={door.hinge}
              onChange={(v) => patch({ hinge: v })}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
              ]}
            />
            {swingOrTraffic && (
              <div className="field">
                <span className="field-label">Opens</span>
                <Toggle<Swing>
                  label="Swing direction"
                  value={door.swing}
                  onChange={(v) => patch({ swing: v })}
                  options={[
                    { value: 'out', label: 'Outward' },
                    { value: 'in', label: 'Inward' },
                  ]}
                />
              </div>
            )}
          </Section>
        )}

        {fam.kind === 'traffic' && (
          <Section title="Finish">
            <Toggle<TrafficFinish> label="Finish" value={door.finish} onChange={(v) => patch({ finish: v })} options={TRAFFIC_FINISHES.map((t) => ({ value: t.id, label: t.label }))} />
          </Section>
        )}

        {(fam.kind === 'swing' || fam.kind === 'slide') && (
          <Section title="Hardware">
            {fam.kind === 'swing' && (
              <>
                <p className="panel-note first">Cam-lift hinges and a self closer come with the door.</p>
                <Switch label={`Add a hydraulic closer (${DOOR_CLOSER_SKU})`} checked={door.closer} onChange={(v) => patch({ closer: v })} />
              </>
            )}
            <label className="field">
              <span className="field-label">Handle</span>
              <select className="custom-select" value={door.handle} onChange={(e) => patch({ handle: e.target.value as HandleId })}>
                {HANDLES.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label}
                  </option>
                ))}
              </select>
            </label>
          </Section>
        )}
      </>
    );
  }
