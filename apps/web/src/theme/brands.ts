/**
 * Brand skins. The app ships neutral; a brand is a data-theme on <html> that
 * overrides tokens in tokens.css, plus the words shown in the footer.
 * Pick one with ?theme=<id> (embeds will set it from their host page).
 */
import iccLogo from '../assets/icc-logo.svg?raw';

export interface Brand {
  id: string;
  /**
   * Logo SVG markup used on door badges and as the default logo decal.
   * Null for a brand that must not show it (iCoola deliverables never show ICC).
   */
  logo: string | null;
  /** Small line above the product name in the footer. */
  company: string;
  product: string;
  /** Scene background and ground, which live in WebGL rather than CSS. */
  scene: { background: string; ground: string; grid: string };
}

export const BRANDS: Record<string, Brand> = {
  neutral: {
    id: 'neutral',
    // The neutral skin currently carries the ICC logo, as requested for the ICC configurator.
    logo: iccLogo,
    company: 'Configurator',
    product: 'Walk-In',
    scene: { background: '#d8dce3', ground: '#cdd2d9', grid: '#b0b8c4' },
  },
  // icc: { id: 'icc', logo: iccLogo, company: 'ICC Energy', product: 'Walk-In', scene: {...} },
  // icoola: { id: 'icoola', logo: null, company: 'iCoola', product: 'Walk-In', scene: {...} },  // never the ICC logo
};

export let activeBrand: Brand = BRANDS.neutral;

export function applyTheme(id: string | null) {
  activeBrand = (id && BRANDS[id]) || BRANDS.neutral;
  document.documentElement.dataset.theme = activeBrand.id;
}
