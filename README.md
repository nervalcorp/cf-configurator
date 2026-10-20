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
  src/catalog.ts     Product options and model numbers (ICC spec-widget catalog, under audit)
  src/rules.ts       normalize() and validate(); each issue names the tab that fixes it
  src/geometry.ts    Polygon helpers (winding-based normals, offsets)
  src/layout/        Shapes, walls + lettering, doors, buildCompartment(), floor-plan drag
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
- **Configurations are versioned.** Bump `SCHEMA_VERSION` on breaking changes and teach `migrate()` to read the old shape. v1 → v2 turned the single front `door` into a `doors` list.
- **Height means wall panel height.** The ceiling panel sits on top, so the overall height is floor + panels + ceiling.
- **Walls are lettered A, B, C… counter-clockwise on the plan, starting with A at the front wall.** Joint 1 is the left end of wall A.
- **Anything placed on a wall goes through `wallFrames()`**: an origin at the inside face of the wall's left end (seen from outside), a `u` axis along the wall and an outward normal `n`. Doors use it now; glass doors, shelving and lights will too.
- **Model numbers live in `catalog.ts`.** They come from the ICC spec-widget catalog and are provisional until the line-up audit closes. Lines marked `CONFIRM` are assumptions.

## Doors

A compartment holds any number of doors, each on any wall. Each door records its wall, its offset along the wall's inside run, its type and its options; its model number is derived from those (for example `ICC-DR-3478CR` = 34" × 78" man door, cooler, right hinge).

| Type | Models | Options |
| --- | --- | --- |
| Man door 34" × 78", semi-buried | ICC-DR-3478 C·F L·R | swing side, in/out, closer add-on, handle |
| Man door 34" × 78", full-buried | ICC-DR-13478 C·F L·R, with window …W | swing side, in/out, window, closer add-on, handle |
| Pallet door 48" × 78", semi-buried | ICC-DR-4878 C·F L·R | swing side, in/out, closer add-on, handle |
| Pallet sliding 54" × 96" | ICC-DR-5496 L·R | slide direction, handle |
| Forklift sliding 72" × 96" | ICC-DR-7296 L·R | slide direction, handle |
| Forklift roll-up, custom (96" wide shown) | ICC-DR-96120 | none; coolers with 120" panels only |
| Traffic, single / double | ICC-DR-3684DS / 7284DS -GR·WH·BK | finish |

Semi-buried doors stand proud of the wall and overlap the opening; full-buried doors sit flush in their own frame. Swing doors come with cam-lift hinges and a self closer, modelled after the ICC door pages. L/R is the swing side seen from outside: hinges on the left for L. Hardware add-ons: hydraulic closer ICC-20SS; handles ICC-P4, ICC-W58BL, ICC-W58BR, ICC-38.

The roll-up opening runs the full 120" panel height; its drum housing sits above the walls and is not counted against the panel height. The rules engine checks that each door fits its wall (with frame, guides and slide travel), that doors on one wall keep 4" apart, and that the compartment is tall enough for the door. Dragging the floor plan is refused when a wall would get too short for its doors.

## Brand skins

A skin is a `[data-theme="<id>"]` block in `apps/web/src/theme/tokens.css` plus an entry in `apps/web/src/theme/brands.ts` (footer words and the WebGL scene colours). Components only read the CSS variables.

## Changes from the icoolaca build

- Three.js r128 with inline OrbitControls/OBJLoader → three 0.186 with the official addons.
- The fixed 72" door-wall minimum is gone; each door must fit its own wall instead. (The old per-notch formula also had `br` and `tr` swapped.)
- Walls are one lettered panel each (A, B, C…) instead of the door wall splitting into A and B.
- Dragging the depth of a `br` notch moved the wrong way; fixed.
- Wall panels no longer paint the exterior finish on their inside face.
- The outdoor roof sits on the walls instead of floating 1 ft above them.
- Not ported yet: custom texture upload, 3D object import and transform gizmo, ramp geometry.

## Clean-room rule

No Roomle or Thermo-Kool code, meshes, scripts or materials. Their public parameter list is a feature reference only.
