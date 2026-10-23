import { useMemo } from 'react';
import { validate } from '@wic/core';
import { useStore } from '../store';

/**
 * Compartment switcher over the 3D view: one chip per compartment, then
 * "Add Compartment" and "Duplicate". Scrolls sideways on narrow screens.
 */
export function CompartmentBar() {
  const config = useStore((s) => s.config);
  const active = useStore((s) => s.ui.active);
  const { setActive, addCompartment, duplicateCompartment } = useStore.getState();
  const flagged = useMemo(() => new Set(validate(config).filter((i) => i.severity === 'error').map((i) => i.compartmentId)), [config]);

  return (
    <div className="compartment-bar" role="toolbar" aria-label="Compartments">
      <div className="compartment-chips" role="tablist" aria-label="Compartment to edit">
        {config.compartments.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === active}
            className={`compartment-chip${c.id === active ? ' active' : ''}`}
            onClick={() => setActive(c.id)}
            title={c.name}
          >
            <span className="chip-name">{c.name}</span>
            {flagged.has(c.id) && <span className="nav-flag" aria-label="needs attention" />}
          </button>
        ))}
      </div>
      <button type="button" className="pill-btn" onClick={addCompartment}>
        <span aria-hidden="true">+</span> Add Compartment
      </button>
      <button type="button" className="pill-btn" onClick={duplicateCompartment} title="Copy this compartment and place it to the right">
        <span aria-hidden="true">⧉</span> Duplicate
      </button>
    </div>
  );
}
