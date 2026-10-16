import { type ExteriorFinish, FINISH_COLORS, type FloorType } from '@wic/core';
import { useActiveCompartment, useStore } from '../store';
import { Section } from '../shell/controls';

const FINISHES: { id: ExteriorFinish; label: string; swatch: string }[] = [
  { id: 'stucco-aluminum', label: 'Stucco aluminum', swatch: FINISH_COLORS['stucco-aluminum'] },
  { id: 'stucco-galvanized', label: 'Stucco galvanized', swatch: FINISH_COLORS['stucco-galvanized'] },
  { id: 'stucco-stainless', label: 'Stucco stainless', swatch: 'linear-gradient(135deg,#b8bcc0,#d4d8dc)' },
  { id: 'stainless', label: 'Stainless steel', swatch: 'linear-gradient(135deg,#a8aeb4,#e0e4e8,#a8aeb4)' },
  { id: 'white', label: 'White coated', swatch: FINISH_COLORS.white },
];

const FLOORS: { id: FloorType; label: string }[] = [
  { id: 'standard', label: 'Standard floor (600 lb/sq ft, no rolling traffic)' },
  { id: 'durafloor', label: 'DuraFloor (12,000 lb/sq ft, no rolling traffic)' },
  { id: 'recessed', label: 'Recessed floor' },
  { id: 'none', label: 'No floor' },
];

export function FinishesTab() {
  const c = useActiveCompartment();
  const edit = useStore((s) => s.editCompartment);
  const f = c.finishes;
  const setFinishes = (patch: Partial<typeof f>) => edit((x) => ({ ...x, finishes: { ...x.finishes, ...patch } }));

  return (
    <>
      <Section title="Exterior finish">
        <div className="finish-grid" role="radiogroup" aria-label="Exterior finish">
          {FINISHES.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={f.exterior === o.id}
              className={`finish-swatch${f.exterior === o.id ? ' active' : ''}`}
              onClick={() => setFinishes({ exterior: o.id })}
            >
              <span className="swatch-circle" style={{ background: o.swatch }} />
              <span className="swatch-label">{o.label}</span>
            </button>
          ))}
        </div>
        <label className="color-row">
          <span className="color-preview">
            <input
              type="color"
              value={f.exteriorColor}
              onChange={(e) => setFinishes({ exterior: 'custom', exteriorColor: e.target.value })}
            />
          </span>
          <span className="color-text">{f.exterior === 'custom' ? `Custom colour ${f.exteriorColor}` : 'Pick a custom colour'}</span>
        </label>
      </Section>

      <Section title="Floor">
        <select
          className="custom-select"
          aria-label="Floor"
          value={f.floor}
          onChange={(e) => setFinishes({ floor: e.target.value as FloorType })}
        >
          {FLOORS.filter((o) => !(c.temperature === 'freezer' && o.id === 'none')).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {c.temperature === 'freezer' && <p className="panel-note">Freezers always include an insulated floor.</p>}
      </Section>
    </>
  );
}
