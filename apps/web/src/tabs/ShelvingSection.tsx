import {
  type Compartment,
  SHELVING,
  type ShelvingUnit,
  addShelving,
  formatFeetInches,
  gravityKey,
  inToMm,
  mmToIn,
  removeShelving,
  rotateShelving,
  shelfHeights,
  toggleGravity,
  updateShelving,
} from '@wic/core';
import { FloorPlan } from '../floorplan/FloorPlan';
import { useStore } from '../store';
import { Section, Slider } from '../shell/controls';

const FACING: Record<number, string> = { 0: 'the front wall', 90: 'the right wall', 180: 'the back wall', 270: 'the left wall' };

export function ShelvingSection({ c }: { c: Compartment }) {
  const selectedId = useStore((s) => s.ui.selectedShelf);
  const { editCompartment: edit, setUi } = useStore.getState();
  const units = c.accessories.shelving;
  const sel = units.find((u) => u.id === selectedId) ?? units[0];
  const tag = (u: ShelvingUnit) => u.id.replace('sh', 'S');
  const hasGlass = c.doors.some((d) => d.family === 'glass');

  return (
    <>
      <Section title="Shelving" hint={SHELVING.sku}>
        <p className="panel-note first">
          Heavy duty black wire shelving, sold by the bay (30" × 27" shelves, 5 per bay), with or without glass doors. {hasGlass ? 'New shelving goes behind the nearest glass doors.' : 'New shelving goes against the back wall.'} Gravity flow trays are {SHELVING.gravitySku}.
        </p>
        {units.length > 0 && (
          <ul className="door-list">
            {units.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className={`door-item${sel?.id === u.id ? ' active' : ''}`}
                  aria-pressed={sel?.id === u.id}
                  onClick={() => setUi({ selectedShelf: u.id })}
                >
                  <span className="door-num">{tag(u)}</span>
                  <span className="door-sku">
                    {u.bays} bay{u.bays === 1 ? '' : 's'} × {u.levels} shelves
                  </span>
                  <span className="door-where">
                    Facing {FACING[u.facing]}
                    {u.gravity.length ? ` · ${u.gravity.length} gravity flow` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="button-row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const r = addShelving(c);
              edit(() => r.compartment);
              setUi({ selectedShelf: r.id });
            }}
          >
            Add shelving
          </button>
          {sel && (
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              onClick={() => {
                edit((x) => removeShelving(x, sel.id));
                setUi({ selectedShelf: units.find((u) => u.id !== sel.id)?.id ?? null });
              }}
            >
              Remove {tag(sel)}
            </button>
          )}
        </div>
      </Section>

      {units.length > 0 && (
        <Section title="Floor plan" hint="Drag shelving to move it; the teal edge is the front">
          <FloorPlan mode="shelving" />
        </Section>
      )}

      {sel && <ShelvingEditor key={sel.id} c={c} u={sel} />}
    </>
  );
}

function ShelvingEditor({ c, u }: { c: Compartment; u: ShelvingUnit }) {
  const { editCompartment: edit, commit } = useStore.getState();
  const set = (patch: Partial<ShelvingUnit>, transient = false) => edit((x) => updateShelving(x, u.id, patch), { transient });
  const step = inToMm(1);
  const nudge = (dx: number, dy: number) => set({ x: u.x + dx, y: u.y + dy });
  const heights = shelfHeights(u);
  const maxPost = Math.floor(mmToIn(c.height - 25));
  const allGravity = u.gravity.length === u.bays * u.levels;

  return (
    <>
      <Section title={`Shelving ${u.id.replace('sh', 'S')}`}>
        <Slider
          label="Bays (door openings)"
          value={u.bays}
          min={1}
          max={SHELVING.maxBays}
          step={1}
          display={`${u.bays}`}
          minLabel="1"
          maxLabel={`${SHELVING.maxBays}`}
          onInput={(v) => set({ bays: v }, true)}
          onCommit={commit}
        />
        <Slider
          label="Shelves per bay"
          value={u.levels}
          min={1}
          max={8}
          step={1}
          display={`${u.levels}`}
          minLabel="1"
          maxLabel="8"
          onInput={(v) => set({ levels: v }, true)}
          onCommit={commit}
        />
        <Slider
          label="Lowest shelf"
          value={Math.round(mmToIn(u.bottom))}
          min={3}
          max={Math.max(3, Math.round(mmToIn(u.top)))}
          step={1}
          display={formatFeetInches(u.bottom)}
          minLabel={'3"'}
          maxLabel={formatFeetInches(u.top)}
          onInput={(v) => set({ bottom: inToMm(v) }, true)}
          onCommit={commit}
        />
        <Slider
          label="Highest shelf"
          value={Math.round(mmToIn(u.top))}
          min={Math.round(mmToIn(u.bottom))}
          max={Math.round(mmToIn(u.postHeight)) - 6}
          step={1}
          display={formatFeetInches(u.top)}
          minLabel={formatFeetInches(u.bottom)}
          maxLabel={formatFeetInches(u.postHeight - inToMm(6))}
          onInput={(v) => set({ top: inToMm(v) }, true)}
          onCommit={commit}
        />
        <Slider
          label="Post height"
          value={Math.round(mmToIn(u.postHeight))}
          min={48}
          max={maxPost}
          step={1}
          display={formatFeetInches(u.postHeight)}
          minLabel={`4' 0"`}
          maxLabel={formatFeetInches(inToMm(maxPost))}
          onInput={(v) => set({ postHeight: inToMm(v) }, true)}
          onCommit={commit}
        />
      </Section>

      <Section title="Gravity flow" hint="Click a shelf to add or remove a tray">
        <div className="gravity-grid" style={{ gridTemplateColumns: `repeat(${u.bays}, 1fr)` }} role="group" aria-label="Gravity flow trays by bay and shelf">
          {[...heights.keys()].reverse().map((k) =>
            Array.from({ length: u.bays }, (_, j) => {
              const on = u.gravity.includes(gravityKey(j, k));
              return (
                <button
                  key={`${j}-${k}`}
                  type="button"
                  className={`gravity-cell${on ? ' on' : ''}`}
                  aria-pressed={on}
                  aria-label={`Bay ${j + 1}, shelf ${k + 1}${on ? ', gravity flow' : ''}`}
                  title={`Bay ${j + 1}, shelf ${k + 1} at ${formatFeetInches(heights[k])}`}
                  onClick={() => edit((x) => toggleGravity(x, u.id, j, k))}
                />
              );
            }),
          )}
        </div>
        <button
          type="button"
          className="btn-link"
          onClick={() =>
            set({ gravity: allGravity ? [] : Array.from({ length: u.bays * u.levels }, (_, i) => gravityKey(i % u.bays, Math.floor(i / u.bays))) })
          }
        >
          {allGravity ? 'Remove all trays' : 'Gravity flow on every shelf'}
        </button>
      </Section>

      <Section title="Placement" hint='Nudge 1"'>
        <div className="nudge-row">
          <div className="nudge-pad" role="group" aria-label="Move the shelving">
            <button type="button" aria-label="Move back" onClick={() => nudge(0, -step)}>↑</button>
            <button type="button" aria-label="Move left" onClick={() => nudge(-step, 0)}>←</button>
            <button type="button" aria-label="Move right" onClick={() => nudge(step, 0)}>→</button>
            <button type="button" aria-label="Move forward" onClick={() => nudge(0, step)}>↓</button>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => edit((x) => rotateShelving(x, u.id))}>
            ↻ Turn 90°
          </button>
        </div>
        <p className="panel-note">Facing {FACING[u.facing]}. Arrows move it as seen on the floor plan.</p>
      </Section>
    </>
  );
}
