# Walk-In Configurator

Parametric walk-in cooler and freezer configurator: one rules engine, a 3D view and a floor-plan editor that both draw from it, and a step-by-step flow from layout to quote.

This is the rebuild of [icoolaca/walk-in-cooler-configurator](https://github.com/icoolaca/walk-in-cooler-configurator). The layout shell and the shape, wall and door logic carry over; the logic now lives in a tested core package instead of inside the render code. The plan is in the *Walk-In Configurator Rebuild — Roadmap* doc.

## Run it

Node 22 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # core rules tests
npm run typecheck
npm run build      # static site in apps/web/dist
```

Pushes to `main` run the tests and publish to GitHub Pages (see `.github/workflows/deploy.yml`). In the repo, set **Settings → Pages → Source** to **GitHub Actions** once.

Add `?theme=<id>` to the URL to pick a brand skin. Only `neutral` is defined so far.

## Layout

```
packages/core     Rules engine. Params in, component tree out. No DOM, no Three.js.
  src/config.ts      Configuration schema (mm), defaults, limits, migrate()
  src/rules.ts       normalize() and validate(); each issue names the tab that fixes it
  src/geometry.ts    Polygon helpers (winding-based normals, offsets)
  src/layout/        Shapes, door wall + lettering, buildCompartment(), floor-plan drag
  test/              Vitest
apps/web          React + Zustand + Three.js app
  src/store.ts       Config, undo/redo, view state
  src/shell/         Top tabs, toolbar, right panel, footer (ported layout)
  src/tabs/          One file per step
  src/viewer/        Component tree → meshes; scene, camera, hover
  src/floorplan/     2D plan editor
  src/theme/         Design tokens and brand skins
```

## Conventions

- **Lengths are millimetres** everywhere in the configuration and the component tree. Inches and feet are formatted only for display (`formatInches`, `formatFeetInches`).
- **Footprint space**: x left → right, y back → front. The front (max y) is the default door side. In 3D, x → X, y → Z, so the front faces +Z.
- **Normals come from winding, never the centroid.** The centroid moves while a notch is dragged and used to flip panel faces.
- **The rules engine owns constraints.** The UI may hide options, but `normalize()` is what guarantees a freezer has a floor or a notch stays in range.
- **Edits are committed or transient.** Drags and slider moves update live as transient edits and commit once on release, so each gesture is one undo step.
- **Configurations are versioned.** Bump `SCHEMA_VERSION` on breaking changes and teach `migrate()` to read the old shape.

## Brand skins

A skin is a `[data-theme="<id>"]` block in `apps/web/src/theme/tokens.css` plus an entry in `apps/web/src/theme/brands.ts` (footer words and the WebGL scene colours). Components only read the CSS variables.

## Changes from the icoolaca build

- Three.js r128 with inline OrbitControls/OBJLoader → three 0.186 with the official addons.
- Door-wall 72" minimum is measured on the real footprint; the old per-notch formula had `br` and `tr` swapped.
- Dragging the depth of a `br` notch moved the wrong way; fixed.
- Door-wall panels no longer paint the exterior finish on their inside face.
- The outdoor roof sits on the walls instead of floating 1 ft above them.
- Not ported yet: custom texture upload, 3D object import and transform gizmo, ramp geometry.

## Clean-room rule

No Roomle or Thermo-Kool code, meshes, scripts or materials. Their public parameter list is a feature reference only.
