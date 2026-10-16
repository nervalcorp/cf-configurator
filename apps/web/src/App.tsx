import { useEffect } from 'react';
import { Footer } from './shell/Footer';
import { Panel } from './shell/Panel';
import { Toolbar } from './shell/Toolbar';
import { TopNav } from './shell/TopNav';
import { useStore } from './store';
import { Viewer } from './viewer/Viewer';

export function App() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input[type="text"], input[type="number"], textarea, select')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useStore.getState().undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        useStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopNav />
      <div className="main-layout">
        <Toolbar />
        <Viewer />
        <Panel />
      </div>
      <Footer />
    </div>
  );
}
