import { validate } from '@wic/core';
import { saveConfiguration } from '../files';
import { useStore } from '../store';
import { activeBrand } from '../theme/brands';

export function Footer() {
  const config = useStore((s) => s.config);
  const setUi = useStore((s) => s.setUi);
  return (
    <footer className="footer-bar">
      <div className="footer-brand">
        <span className="company">{activeBrand.company}</span>
        <span className="product">{activeBrand.product}</span>
      </div>
      <div className="footer-actions">
        <button type="button" className="btn btn-ghost" onClick={() => saveConfiguration(config)}>
          Save draft
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            // Validation gate: send the user to the first tab with a problem.
            const first = validate(config).find((i) => i.severity === 'error');
            setUi({ tab: first ? first.tab : 'review', panelOpen: true });
          }}
        >
          Review and quote
        </button>
      </div>
    </footer>
  );
}
