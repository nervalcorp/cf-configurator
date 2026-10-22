import { useEffect, useMemo, useRef, useState } from 'react';
import { buildCompartment, flaggedParts, validate } from '@wic/core';
import { activeBrand } from '../theme/brands';
import { useActiveCompartment, useStore, viewerApi } from '../store';
import { type Hover, SceneController } from './SceneController';

export function Viewer() {
  const host = useRef<HTMLDivElement>(null);
  const axes = useRef<HTMLCanvasElement>(null);
  const ctrl = useRef<SceneController | null>(null);
  const [tip, setTip] = useState<(Hover & { x: number; y: number }) | null>(null);

  const comp = useActiveCompartment();
  const site = useStore((s) => s.config.site.type);
  const config = useStore((s) => s.config);
  const flags = useMemo(() => flaggedParts(buildCompartment(comp, site), validate(config)), [comp, site, config]);
  const { showDims, wireframe, autoRotate, lightOrbit } = useStore((s) => s.ui);
  const tree = useMemo(() => buildCompartment(comp, site), [comp, site]);

  useEffect(() => {
    const c = new SceneController(host.current!, axes.current, (hover, x, y) =>
      setTip(hover && (hover.label || hover.problems.length) ? { ...hover, x, y } : null),
    );
    c.setLogo(activeBrand.logo);
    c.defaultDecal = activeBrand.logo;
    ctrl.current = c;
    viewerApi.current = { resetView: () => c.resetView(), screenshot: () => c.screenshot() };
    if (new URLSearchParams(location.search).has('debug')) {
      (window as unknown as { __wic: unknown }).__wic = { viewer: c, store: useStore };
    }
    return () => {
      viewerApi.current = null;
      ctrl.current = null;
      c.dispose();
    };
  }, []);

  // Re-frame only when the site type changes or on first build, not on every slider tick.
  const framedFor = useRef<string | null>(null);
  useEffect(() => {
    const c = ctrl.current;
    if (!c) return;
    c.update(tree, comp, flags);
    if (framedFor.current !== site) {
      framedFor.current = site;
      c.resetView();
    }
  }, [tree, comp, site, flags]);

  useEffect(() => ctrl.current?.setDims(showDims), [showDims, tree]);
  useEffect(() => ctrl.current?.setWireframe(wireframe), [wireframe]);
  useEffect(() => ctrl.current?.setAutoRotate(autoRotate), [autoRotate]);
  useEffect(() => ctrl.current?.setLightOrbit(lightOrbit), [lightOrbit]);

  return (
    <div className="canvas-area" ref={host}>
      <canvas className="axis-gizmo" ref={axes} width={120} height={120} aria-hidden="true" />
      {tip && (
        <div className={`hover-tip${tip.problems.length ? ' has-problems' : ''}`} style={{ left: tip.x + 14, top: tip.y + 14 }} role="status">
          {tip.label && <div>{tip.label}</div>}
          {tip.problems.map((m) => (
            <div key={m} className="hover-problem">
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
