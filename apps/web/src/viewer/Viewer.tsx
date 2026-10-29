import { useEffect, useMemo, useRef, useState } from 'react';
import { buildCompartment, flaggedParts, validate } from '@wic/core';
import { activeBrand } from '../theme/brands';
import { useStore, viewerApi } from '../store';
import { type Hover, SceneController } from './SceneController';
import { CompartmentBar } from '../shell/CompartmentBar';

export function Viewer() {
  const host = useRef<HTMLDivElement>(null);
  const axes = useRef<HTMLCanvasElement>(null);
  const ctrl = useRef<SceneController | null>(null);
  const [tip, setTip] = useState<(Hover & { x: number; y: number }) | null>(null);

  const site = useStore((s) => s.config.site.type);
  const config = useStore((s) => s.config);
  const activeId = useStore((s) => s.ui.active);
  const entries = useMemo(() => {
    const issues = validate(config);
    return config.compartments.map((comp) => {
      const tree = buildCompartment(comp, site);
      return { comp, tree, flags: flaggedParts(tree, issues) };
    });
  }, [config, site]);
  const { showDims, wireframe, autoRotate, lightOrbit } = useStore((s) => s.ui);

  useEffect(() => {
    const c = new SceneController(host.current!, axes.current, (hover, x, y) =>
      setTip(hover && (hover.label || hover.problems.length) ? { ...hover, x, y } : null),
    );
    c.setLogo(activeBrand.logo);
    c.defaultDecal = activeBrand.logo;
    ctrl.current = c;
    viewerApi.current = { resetView: () => c.resetView(), screenshot: (scale, dpi) => void c.screenshot(scale, dpi) };
    if (new URLSearchParams(location.search).has('debug')) {
      (window as unknown as { __wic: unknown }).__wic = { viewer: c, store: useStore };
    }
    return () => {
      viewerApi.current = null;
      ctrl.current = null;
      c.dispose();
    };
  }, []);

  // Frame the site once, on the first build. After that the view only moves
  // when the user moves it or presses reset.
  // Also reframe when compartments are added or removed, so a new one is in view.
  const framedCount = useRef(0);
  useEffect(() => {
    const c = ctrl.current;
    if (!c) return;
    c.update(entries, activeId);
    if (framedCount.current !== entries.length) {
      framedCount.current = entries.length;
      c.resetView();
    }
  }, [entries, activeId]);

  useEffect(() => ctrl.current?.setDims(showDims), [showDims]);
  const tab = useStore((s) => s.ui.tab);
  const airflow = useStore((s) => s.ui.airflow);
  const throwOpacity = useStore((s) => s.ui.throwOpacity);
  useEffect(() => ctrl.current?.setShowThrow(tab === 'refrigeration'), [tab, entries]);
  useEffect(() => ctrl.current?.setAirflow(tab === 'refrigeration' && airflow), [tab, airflow]);
  useEffect(() => ctrl.current?.setThrowOpacity(throwOpacity), [throwOpacity]);
  useEffect(() => ctrl.current?.setWireframe(wireframe), [wireframe]);
  useEffect(() => ctrl.current?.setAutoRotate(autoRotate), [autoRotate]);
  useEffect(() => ctrl.current?.setLightOrbit(lightOrbit), [lightOrbit]);

  return (
    <div className="canvas-area" ref={host}>
      <canvas className="axis-gizmo" ref={axes} width={120} height={120} aria-hidden="true" />
      <CompartmentBar />
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
