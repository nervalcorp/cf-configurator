import { useState } from 'react';
import {
  type DecalParams,
  type ExteriorFinish,
  FINISH_COLORS,
  LIMITS,
  defaultDecal,
  formatInches,
  inToMm,
  mmToIn,
} from '@wic/core';
import { useActiveCompartment, useStore } from '../store';
import { Section, Slider } from '../shell/controls';
import { activeBrand } from '../theme/brands';
import { svgDataUrl } from '../viewer/textures';

const MAX_MB = LIMITS.decal.maxBytes / (1024 * 1024);

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsDataURL(file);
  });
}

export function FinishesTab() {
  const c = useActiveCompartment();
  const { editCompartment: edit, commit } = useStore.getState();
  const f = c.finishes;
  const setFinishes = (patch: Partial<typeof f>) => edit((x) => ({ ...x, finishes: { ...x.finishes, ...patch } }));
  const setDecal = (patch: Partial<DecalParams>, transient = false) =>
    edit((x) => ({ ...x, finishes: { ...x.finishes, decal: { ...x.finishes.decal, ...patch } } }), { transient });
  const [uploadError, setUploadError] = useState<string | null>(null);

  const defaultLogo = activeBrand.logo ? svgDataUrl(activeBrand.logo) : null;
  const decalSrc = f.decal.image ?? defaultLogo;

  const options: { id: ExteriorFinish; label: string; swatch: string }[] = [
    { id: 'white', label: 'White coated', swatch: FINISH_COLORS.white },
    { id: 'grey-white', label: 'Grey white coated', swatch: FINISH_COLORS['grey-white'] },
    {
      id: 'decal',
      label: 'Logo decals',
      swatch: decalSrc ? `center / 70% no-repeat url("${decalSrc}"), ${f.decal.background}` : f.decal.background,
    },
  ];

  return (
    <>
      <Section title="Exterior finish" hint="Outside of the walls">
        <div className="finish-grid" role="radiogroup" aria-label="Exterior finish">
          {options.map((o) => (
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
              value={f.exterior === 'custom' ? f.exteriorColor : '#f0f0f0'}
              onChange={(e) => setFinishes({ exterior: 'custom', exteriorColor: e.target.value })}
            />
          </span>
          <span className="color-text">{f.exterior === 'custom' ? `Custom colour ${f.exteriorColor}` : 'Pick a custom colour'}</span>
        </label>
      </Section>

      {f.exterior === 'decal' && (
        <Section title="Logo decal" hint={`SVG, PNG, JPG or WebP, up to ${MAX_MB} MB`}>
          <DecalPreview src={decalSrc} background={f.decal.background} />
          <div className="button-row">
            <label className="btn btn-ghost file-btn">
              Upload image
              <input
                type="file"
                accept={LIMITS.decal.types.join(',')}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (!LIMITS.decal.types.includes(file.type)) {
                    return setUploadError('Use an SVG, PNG, JPG or WebP image.');
                  }
                  if (file.size > LIMITS.decal.maxBytes) {
                    return setUploadError(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_MB} MB.`);
                  }
                  try {
                    setDecal({ image: await readFile(file) });
                    setUploadError(null);
                  } catch (err) {
                    setUploadError((err as Error).message);
                  }
                }}
              />
            </label>
            {f.decal.image && (
              <button type="button" className="btn btn-ghost" onClick={() => setDecal({ image: null })}>
                {defaultLogo ? 'Use the default logo' : 'Remove image'}
              </button>
            )}
          </div>
          {uploadError && (
            <p className="panel-error" role="alert">
              {uploadError}
            </p>
          )}
          {!decalSrc && <p className="panel-note">Upload an image to tile it across the walls.</p>}
          <label className="color-row">
            <span className="color-preview">
              <input type="color" value={f.decal.background} onChange={(e) => setDecal({ background: e.target.value })} />
            </span>
            <span className="color-text">Background {f.decal.background}</span>
          </label>
          <Slider
            label="Tile size"
            value={Math.round(mmToIn(f.decal.tile))}
            min={mmToIn(LIMITS.decal.tileMin)}
            max={mmToIn(LIMITS.decal.tileMax)}
            step={1}
            display={formatInches(f.decal.tile)}
            minLabel={formatInches(LIMITS.decal.tileMin)}
            maxLabel={formatInches(LIMITS.decal.tileMax)}
            onInput={(v) => setDecal({ tile: inToMm(v) }, true)}
            onCommit={commit}
          />
          <p className="panel-note">
            Tiled across and down, turned {f.decal.angle}°, on the outside of the walls only. Corner trim takes the background colour.
          </p>
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setDecal(defaultDecal());
              setUploadError(null);
            }}
          >
            Reset decal settings
          </button>
        </Section>
      )}

    </>
  );
}

/** A small tiled, rotated preview of the decal. */
function DecalPreview({ src, background }: { src: string | null; background: string }) {
  return (
    <div className="decal-preview" style={{ background }} aria-hidden="true">
      {src && <div className="decal-preview-tiles" style={{ backgroundImage: `url("${src}")` }} />}
    </div>
  );
}
