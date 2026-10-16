import { useMemo } from 'react';
import { validate } from '@wic/core';
import { TABS, useStore } from '../store';

export function TopNav() {
  const tab = useStore((s) => s.ui.tab);
  const setUi = useStore((s) => s.setUi);
  const config = useStore((s) => s.config);
  const issues = useMemo(() => validate(config), [config]);
  const flagged = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.tab));
  return (
    <nav className="top-nav" aria-label="Configuration steps">
      {TABS.map((t, i) => (
        <button
          key={t.id}
          type="button"
          className={`nav-tab${tab === t.id ? ' active' : ''}`}
          aria-current={tab === t.id ? 'step' : undefined}
          onClick={() => setUi({ tab: t.id, panelOpen: true })}
        >
          <span className="nav-step">{i + 1}</span>
          {t.label}
          {flagged.has(t.id) && <span className="nav-flag" aria-label="needs attention" />}
        </button>
      ))}
    </nav>
  );
}
