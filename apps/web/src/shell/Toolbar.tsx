import { useStore, viewerApi } from '../store';
import { Icon } from './controls';

export function Toolbar() {
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { undo, redo, setUi } = useStore.getState();
  const ui = useStore((s) => s.ui);

  return (
    <div className="left-toolbar" role="toolbar" aria-label="View tools" aria-orientation="vertical">
      <button className="tool-btn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
        <Icon d={<><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>} />
      </button>
      <button className="tool-btn" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!canRedo} onClick={redo}>
        <Icon d={<><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" /></>} />
      </button>
      <button
        className="tool-btn"
        title="Fullscreen"
        aria-label="Fullscreen"
        onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
      >
        <Icon d={<><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>} />
      </button>
      <button
        className={`tool-btn${ui.autoRotate ? ' active' : ''}`}
        title={ui.autoRotate ? 'Stop rotating' : 'Rotate the view'}
        aria-label="Auto-rotate"
        aria-pressed={ui.autoRotate}
        onClick={() => setUi({ autoRotate: !ui.autoRotate })}
      >
        {ui.autoRotate ? (
          <Icon d={<><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>} />
        ) : (
          <Icon fill d={<polygon points="6,4 20,12 6,20" />} />
        )}
      </button>
      <button
        className={`tool-btn${ui.lightOrbit ? ' active' : ''}`}
        title="Orbit the light"
        aria-label="Orbit the light"
        aria-pressed={ui.lightOrbit}
        onClick={() => setUi({ lightOrbit: !ui.lightOrbit })}
      >
        <Icon d={<><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>} />
      </button>
      <button
        className={`tool-btn${ui.showDims ? ' active' : ''}`}
        title="Show dimensions"
        aria-label="Show dimensions"
        aria-pressed={ui.showDims}
        onClick={() => setUi({ showDims: !ui.showDims })}
      >
        <Icon d={<><path d="M3 7v10M21 7v10M3 12h18" /><path d="M7 9l-4 3 4 3M17 9l4 3-4 3" /></>} />
      </button>
      <div className="toolbar-spacer" />
      <button className="tool-btn" title="Reset view" aria-label="Reset view" onClick={() => viewerApi.current?.resetView()}>
        <Icon d={<><path d="M3 12a9 9 0 1 0 9-9" /><polyline points="3 3 3 9 9 9" /></>} />
      </button>
      <button className="tool-btn" title="Save screenshot" aria-label="Save screenshot" onClick={() => viewerApi.current?.screenshot()}>
        <Icon d={<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>} />
      </button>
    </div>
  );
}
