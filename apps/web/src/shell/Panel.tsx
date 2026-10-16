import type { TabId } from '@wic/core';
import { TABS, useStore } from '../store';
import { Switch } from './controls';
import { LayoutTab } from '../tabs/LayoutTab';
import { FinishesTab } from '../tabs/FinishesTab';
import { DoorsTab } from '../tabs/DoorsTab';
import { AccessoriesTab } from '../tabs/AccessoriesTab';
import { ReviewTab } from '../tabs/ReviewTab';
import { NotYetTab } from '../tabs/NotYetTab';

const PAGES: Record<TabId, () => React.ReactNode> = {
  layout: LayoutTab,
  finishes: FinishesTab,
  doors: DoorsTab,
  glass: () => <NotYetTab what="Glass display doors" />,
  refrigeration: () => <NotYetTab what="Evaporator and condensing-unit selection" />,
  accessories: AccessoriesTab,
  review: ReviewTab,
};

export function Panel() {
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
        <section className="panel-section display-options">
          <h3 className="section-label">Display options</h3>
          <Switch label="Show dimensions" checked={ui.showDims} onChange={(v) => setUi({ showDims: v })} />
          <Switch label="Wireframe" checked={ui.wireframe} onChange={(v) => setUi({ wireframe: v })} />
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
