/**
 * App state. `config` is the only thing the rules engine sees; `ui` is view
 * state that never goes into a saved file or the undo history.
 *
 * Edits are either committed (one undo step each) or transient (live preview
 * while dragging). A transient run ends with commit(), which records the whole
 * drag as one undo step.
 */
import { create } from 'zustand';
import {
  type Compartment,
  type Configuration,
  type SiteType,
  type TabId,
  addCompartment,
  defaultCompartment,
  defaultConfiguration,
  duplicateCompartment,
  normalize,
  removeCompartment,
} from '@wic/core';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'layout', label: 'Layout' },
  { id: 'finishes', label: 'Finishes' },
  { id: 'doors', label: 'Doors' },
  { id: 'glass', label: 'Glass doors' },
  { id: 'refrigeration', label: 'Refrigeration' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'review', label: 'Review' },
];

interface UI {
  tab: TabId;
  panelOpen: boolean;
  showDims: boolean;
  wireframe: boolean;
  autoRotate: boolean;
  lightOrbit: boolean;
  /** Compartment the panel is editing. One for now; docking adds more. */
  active: string;
  /** Door being edited on the Doors tab. */
  selectedDoor: string | null;
}

interface State {
  config: Configuration;
  /** Last committed config; the base of the next undo step. */
  checkpoint: Configuration;
  past: Configuration[];
  future: Configuration[];
  ui: UI;
  editCompartment: (fn: (c: Compartment) => Compartment, opts?: { transient?: boolean }) => void;
  setSite: (type: SiteType) => void;
  commit: () => void;
  undo: () => void;
  redo: () => void;
  load: (config: Configuration) => void;
  setUi: (patch: Partial<UI>) => void;
  /** Make a compartment the one the panel edits. */
  setActive: (id: string) => void;
  addCompartment: () => void;
  duplicateCompartment: () => void;
  removeCompartment: (id: string) => void;
}

const HISTORY = 50;

export const useStore = create<State>((set, get) => {
  const initial = normalize(defaultConfiguration());

  const apply = (next: Configuration, transient: boolean) => {
    const cfg = normalize(next);
    if (transient) return set({ config: cfg });
    const { checkpoint, past } = get();
    set({ config: cfg, checkpoint: cfg, past: [...past, checkpoint].slice(-HISTORY), future: [] });
  };

  return {
    config: initial,
    checkpoint: initial,
    past: [],
    future: [],
    ui: {
      tab: 'layout',
      // Phones start on the model; the panel opens from the tab bar or the edge handle.
      panelOpen: typeof window === 'undefined' || window.innerWidth > 768,
      showDims: true,
      wireframe: false,
      autoRotate: false,
      lightOrbit: false,
      active: initial.compartments[0].id,
      selectedDoor: initial.compartments[0].doors[0]?.id ?? null,
    },

    editCompartment: (fn, opts) => {
      const { config, ui } = get();
      apply(
        { ...config, compartments: config.compartments.map((c) => (c.id === ui.active ? fn(c) : c)) },
        !!opts?.transient,
      );
    },

    setSite: (type) => apply({ ...get().config, site: { type } }, false),

    commit: () => {
      const { config, checkpoint, past } = get();
      if (config === checkpoint) return;
      set({ checkpoint: config, past: [...past, checkpoint].slice(-HISTORY), future: [] });
    },

    undo: () => {
      const { past, config, future } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({ config: prev, checkpoint: prev, past: past.slice(0, -1), future: [config, ...future] });
    },

    redo: () => {
      const { past, config, future } = get();
      const next = future[0];
      if (!next) return;
      set({ config: next, checkpoint: next, past: [...past, config], future: future.slice(1) });
    },

    load: (config) => {
      const cfg = normalize(config);
      set((s) => ({
        config: cfg,
        checkpoint: cfg,
        past: [...s.past, s.config].slice(-HISTORY),
        future: [],
        ui: { ...s.ui, active: cfg.compartments[0].id, selectedDoor: cfg.compartments[0].doors[0]?.id ?? null },
      }));
    },

    setUi: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),

    setActive: (id) => {
      const c = get().config.compartments.find((x) => x.id === id);
      if (!c) return;
      set((s) => ({ ui: { ...s.ui, active: id, selectedDoor: c.doors[0]?.id ?? null } }));
    },

    addCompartment: () => {
      const r = addCompartment(get().config, (id, name) => defaultCompartment(id, name));
      apply(r.config, false);
      get().setActive(r.id);
    },

    duplicateCompartment: () => {
      const r = duplicateCompartment(get().config, get().ui.active);
      apply(r.config, false);
      get().setActive(r.id);
    },

    removeCompartment: (id) => {
      const next = removeCompartment(get().config, id);
      if (next === get().config) return;
      apply(next, false);
      get().setActive(next.compartments[0].id);
    },
  };
});

export const useActiveCompartment = () =>
  useStore((s) => s.config.compartments.find((c) => c.id === s.ui.active) ?? s.config.compartments[0]);

/**
 * Bridge for toolbar buttons that act on the 3D view (screenshot, reset).
 * The viewer registers itself here when it mounts.
 */
export interface ViewerApi {
  resetView: () => void;
  screenshot: () => void;
}
export const viewerApi: { current: ViewerApi | null } = { current: null };
