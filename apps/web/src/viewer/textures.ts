/**
 * Logo textures: the badge on swing doors and the tiled wall decal.
 * Images are drawn onto canvases so SVGs without a pixel size still work and
 * the decal tile can carry its own background and spacing.
 */
import * as THREE from 'three';

/** Give an SVG a width/height from its viewBox; some browsers won't draw it otherwise. */
export function sizedSvg(markup: string, width = 1024): string {
  const vb = markup.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (!vb) return markup;
  const [w, h] = [Number(vb[1]), Number(vb[2])];
  const height = Math.round((width * h) / w);
  return markup.replace(/<svg\b([^>]*)>/i, (_tag, attrs: string) => {
    const clean = attrs.replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, '');
    return `<svg${clean} width="${width}" height="${height}">`;
  });
}

export const svgDataUrl = (markup: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sizedSvg(markup))}`;

const cache = new Map<string, Promise<HTMLImageElement>>();

/** Load an image from a URL or data URL (SVG data URLs get a pixel size first). */
export function loadImage(src: string): Promise<HTMLImageElement> {
  let url = src;
  if (src.startsWith('data:image/svg+xml')) {
    const comma = src.indexOf(',');
    const head = src.slice(0, comma);
    const body = src.slice(comma + 1);
    const markup = head.includes(';base64') ? atob(body) : decodeURIComponent(body);
    url = svgDataUrl(markup);
  }
  const hit = cache.get(url);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The image could not be read.'));
    img.src = url;
  });
  cache.set(url, p);
  return p;
}

function canvasTexture(canvas: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Logo filling a badge face. */
export function badgeTexture(img: HTMLImageElement): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * img.naturalHeight) / img.naturalWidth) || 328;
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return canvasTexture(c);
}

/**
 * One square decal tile: background colour with the logo centred at 70% of
 * the tile width. Repeats in u and v; the caller sets size and rotation.
 */
export function decalTexture(img: HTMLImageElement, background: string): THREE.Texture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, S, S);
  const w = S * 0.7;
  const h = (w * (img.naturalHeight || 1)) / (img.naturalWidth || 1);
  ctx.drawImage(img, (S - w) / 2, (S - Math.min(h, S * 0.9)) / 2, w, Math.min(h, S * 0.9));
  const t = canvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * The logo in white with its background removed, for printing on glass.
 * Works with the ICC logo's classes (cls-3 is the navy background); for any
 * other SVG it forces every fill to white, which is the intent anyway.
 */
export function whiteLogo(markup: string): string {
  const style = '<style>*{fill:#fff!important;stroke:none!important}.cls-3{fill:none!important}</style>';
  return markup.includes('</defs>') ? markup.replace('</defs>', `</defs>${style}`) : markup.replace(/<svg\b[^>]*>/i, (t) => t + style);
}

/** Logo on a transparent canvas, for decals that sit on glass. */
export function transparentLogoTexture(img: HTMLImageElement): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * img.naturalHeight) / img.naturalWidth) || 328;
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return canvasTexture(c);
}

/**
 * One foot of aluminum tread plate, tileable: an 8 × 8 grid of cells, each with
 * five raised bars turned ±45° in a checkerboard, as in the ICC product photo.
 * Plate UVs are wall millimetres ÷ 304.8, so squares side by side line up.
 */
export function checkerTexture(): THREE.Texture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  // Brushed aluminium base with fine noise (noise has no structure, so it tiles).
  ctx.fillStyle = '#9ea4aa';
  ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const cells = 8;
  const cs = S / cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      ctx.save();
      ctx.translate(i * cs + cs / 2, j * cs + cs / 2);
      ctx.rotate(((i + j) % 2 ? 1 : -1) * (Math.PI / 4));
      for (let b = -2; b <= 2; b++) {
        const x = b * cs * 0.13;
        const len = cs * (0.62 - Math.abs(b) * 0.06);
        // shadow, body, highlight
        ctx.strokeStyle = 'rgba(40,44,48,0.55)';
        ctx.lineWidth = cs * 0.075;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 1.5, -len / 2 + 1.5);
        ctx.lineTo(x + 1.5, len / 2 + 1.5);
        ctx.stroke();
        ctx.strokeStyle = '#d9dde1';
        ctx.lineWidth = cs * 0.07;
        ctx.beginPath();
        ctx.moveTo(x, -len / 2);
        ctx.lineTo(x, len / 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = cs * 0.022;
        ctx.beginPath();
        ctx.moveTo(x - cs * 0.015, -len / 2 + 2);
        ctx.lineTo(x - cs * 0.015, len / 2 - 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  const t = canvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

const CYAN = '#7fe3ef';
const CYAN_DIM = 'rgba(127,227,239,0.35)';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * ICC-TSC2000 face: black glass, logo at the top, large segment temperature,
 * an indicator row with a small clock, and five round touch buttons.
 */
export function tsc2000Face(logo: HTMLImageElement | null): THREE.Texture {
  const W = 512;
  const H = 445;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#15181b');
  g.addColorStop(1, '#050607');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Teal arc frame behind the logo
  ctx.strokeStyle = '#2fa7b8';
  ctx.lineWidth = 4;
  roundRect(ctx, 120, 18, 272, 70, 22);
  ctx.stroke();
  if (logo) {
    const lw = 220;
    const lh = (lw * logo.naturalHeight) / logo.naturalWidth;
    ctx.drawImage(logo, (W - lw) / 2, 53 - lh / 2, lw, lh);
  }
  // Display window
  ctx.fillStyle = '#1b1f22';
  ctx.fillRect(34, 104, W - 68, 196);
  ctx.fillStyle = CYAN;
  ctx.font = 'bold 140px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('-38.8', 52, 232);
  ctx.font = '600 34px "IBM Plex Mono", monospace';
  ctx.fillText('°F', 420, 170);
  ctx.fillStyle = CYAN_DIM;
  ctx.fillText('°C', 420, 222);
  ctx.fillStyle = CYAN;
  ctx.font = '600 44px "IBM Plex Mono", monospace';
  ctx.fillText('08:3.6', 248, 286);
  ctx.font = '26px sans-serif';
  ['❄', '❄', '✣', '⚿'].forEach((s, i) => ctx.fillText(s, 60 + i * 46, 280));
  // Touch buttons
  for (let i = 0; i < 5; i++) {
    const cx = 72 + i * 92;
    const cy = 368;
    ctx.strokeStyle = '#2fa7b8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = CYAN;
    ctx.beginPath();
    if (i === 2) {
      ctx.moveTo(cx - 16, cy - 8);
      ctx.lineTo(cx + 16, cy - 8);
      ctx.lineTo(cx, cy + 12);
    } else if (i === 3) {
      ctx.moveTo(cx - 16, cy + 8);
      ctx.lineTo(cx + 16, cy + 8);
      ctx.lineTo(cx, cy - 12);
    } else if (i === 4) {
      ctx.moveTo(cx - 12, cy - 14);
      ctx.lineTo(cx + 6, cy);
      ctx.lineTo(cx - 12, cy + 14);
    } else {
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  return canvasTexture(c);
}

/**
 * ICC-TC1000 face: dark bezel, black display window with the set point and a
 * snowflake, three embossed buttons down each side, logo above the display.
 */
export function tc1000Face(logo: HTMLImageElement | null): THREE.Texture {
  const W = 512;
  const H = 220;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#34373c';
  ctx.fillRect(0, 0, W, H);
  // Button columns
  for (const x of [14, W - 96]) {
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = '#8c9197';
      ctx.lineWidth = 3;
      roundRect(ctx, x, 16 + k * 66, 82, 56, 6);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#9ca1a7';
  ctx.font = '600 18px sans-serif';
  ctx.fillText('SET', 34, 182);
  // Display window
  ctx.fillStyle = '#0b0d0f';
  roundRect(ctx, 110, 22, W - 220, H - 44, 8);
  ctx.fill();
  if (logo) {
    const lw = 150;
    const lh = (lw * logo.naturalHeight) / logo.naturalWidth;
    ctx.drawImage(logo, (W - lw) / 2, 30, lw, lh);
  }
  ctx.fillStyle = CYAN;
  ctx.font = 'bold 96px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillText('28', 250, 178);
  ctx.font = '30px sans-serif';
  ctx.fillText('❄', 150, 120);
  ctx.font = '600 18px sans-serif';
  ctx.fillText('SET', 182, 168);
  return canvasTexture(c);
}

/**
 * Wire shelf: black plastic-dipped wire grid on a transparent ground, so a flat
 * panel reads as a mesh shelf. Main rails every 3", fine wires every 0.75";
 * one texture spans the whole 30" × 27" shelf.
 */
export function wireShelfTexture(): THREE.Texture {
  const W = 1024;
  const H = Math.round((W * 27) / 30);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#141516';
  const px = W / 30; // pixels per inch
  // fine wires along the depth
  ctx.lineWidth = px * 0.16;
  for (let x = px * 0.375; x < W; x += px * 0.75) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  // cross rails
  ctx.lineWidth = px * 0.3;
  for (let y = px * 1.5; y < H; y += px * 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // heavier frame and two support channels
  ctx.lineWidth = px * 0.6;
  ctx.strokeRect(px * 0.3, px * 0.3, W - px * 0.6, H - px * 0.6);
  for (const x of [W / 3, (2 * W) / 3]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
