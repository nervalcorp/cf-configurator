/**
 * Brand skins. The app ships neutral; a brand is a data-theme on <html> that
 * overrides tokens in tokens.css, plus the words shown in the footer.
 * Pick one with ?theme=<id> (embeds will set it from their host page).
 */
export interface Brand {
  id: string;
  /** Small line above the product name in the footer. */
  company: string;
  product: string;
  /** Scene background and ground, which live in WebGL rather than CSS. */
  scene: { background: string; ground: string; grid: string };
}

export const BRANDS: Record<string, Brand> = {
  neutral: {
    id: 'neutral',
    company: 'Configurator',
    product: 'Walk-In',
    scene: { background: '#d8dce3', ground: '#cdd2d9', grid: '#b0b8c4' },
  },
  // icc: { id: 'icc', company: 'ICC Energy', product: 'Walk-In', scene: {...} },
  // icoola: { id: 'icoola', company: 'iCoola', product: 'Walk-In', scene: {...} },
};

export let activeBrand: Brand = BRANDS.neutral;

export function applyTheme(id: string | null) {
  activeBrand = (id && BRANDS[id]) || BRANDS.neutral;
  document.documentElement.dataset.theme = activeBrand.id;
}
