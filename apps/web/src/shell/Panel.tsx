import { useState } from 'react';
import type { TabId } from '@wic/core';
import { TABS, useStore } from '../store';
import { Slider, Switch } from './controls';
import { LayoutTab } from '../tabs/LayoutTab';
import { FinishesTab } from '../tabs/FinishesTab';
import { DoorsTab } from '../tabs/DoorsTab';
import { AccessoriesTab } from '../tabs/AccessoriesTab';
import { ReviewTab } from '../tabs/ReviewTab';
import { GlassTab } from '../tabs/GlassTab';
import { RefrigerationTab } from '../tabs/RefrigerationTab';

const PAGES: Record<TabId, () => React.ReactNode> = {
  layout: LayoutTab,
  finishes: FinishesTab,
  doors: DoorsTab,
  glass: GlassTab,
  refrigeration: RefrigerationTab,
  accessories: AccessoriesTab,
  review: ReviewTab,
};

export function Panel() {
  // Display options fold away to save space in the panel; closed by default.
  const [displayOpen, setDisplayOpen] = useState(false);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const idx = TABS.findIndex((t) => t.id === ui.tab);
  const prev = TABS[idx - 1];
  const next = TABS[idx + 1];
  const Page = PAGES[ui.tab];

  return (
    <>
      <button
        type="button"
        className={`panel-toggle${ui.panelOpen ? '' : ' collapsed'}`}
        aria-label={ui.panelOpen ? 'Hide options' : 'Show options'}
        aria-expanded={ui.panelOpen}
        onClick={() => setUi({ panelOpen: !ui.panelOpen })}
      >
        {ui.panelOpen ? '›' : '‹'}
      </button>
      <aside className={`right-panel${ui.panelOpen ? '' : ' collapsed'}`} aria-label={`${TABS[idx].label} options`}>
        <div className="panel-scroll" key={ui.tab}>
          <h2 className="panel-title">{TABS[idx].label}</h2>
          <Page />
        </div>
        <section className={`panel-section display-options${displayOpen ? ' open' : ''}`}>
          <button type="button" className="display-head" aria-expanded={displayOpen} onClick={() => setDisplayOpen(!displayOpen)}>
            <span className="section-label">Display options</span>
            <span className="card-chevron" aria-hidden="true">
              ▾
            </span>
          </button>
          {displayOpen && (
            <div className="display-body">
          <Switch label="Show dimensions" checked={ui.showDims} onChange={(v) => setUi({ showDims: v })} />
          <Switch label="Wireframe" checked={ui.wireframe} onChange={(v) => setUi({ wireframe: v })} />
          <Switch label="Show airflow" checked={ui.airflow} onChange={(v) => setUi({ airflow: v })} />
          {ui.tab === 'refrigeration' && (
            <>
              <Switch label="Show air throw" checked={ui.showThrow} onChange={(v) => setUi({ showThrow: v })} />
              {ui.showThrow && (
                <>
                  <Slider
                    label="Air throw opacity"
                    value={Math.round(ui.throwOpacity * 100)}
                    min={0}
                    max={60}
                    step={5}
                    display={`${Math.round(ui.throwOpacity * 100)}%`}
                    minLabel="0%"
                    maxLabel="60%"
                    onInput={(v) => setUi({ throwOpacity: v / 100 })}
                    onCommit={() => undefined}
                  />
                  <Slider
                    label="Air throw on hover"
                    value={Math.round(ui.throwHoverOpacity * 100)}
                    min={0}
                    max={80}
                    step={5}
                    display={`${Math.round(ui.throwHoverOpacity * 100)}%`}
                    minLabel="0%"
                    maxLabel="80%"
                    onInput={(v) => setUi({ throwHoverOpacity: v / 100 })}
                    onCommit={() => undefined}
                  />
                </>
              )}
            </>
          )}
            </div>
          )}
        </section>
        <div className="continue-row">
          {prev && (
            <button type="button" className="btn-back" onClick={() => setUi({ tab: prev.id })}>
              ← Back
            </button>
          )}
          {next && (
            <button type="button" className="btn-continue" onClick={() => setUi({ tab: next.id })}>
              Continue to {next.label}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
