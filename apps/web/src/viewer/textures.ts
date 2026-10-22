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
