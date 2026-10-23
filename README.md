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
- **The camera only moves when the user moves it,** presses reset, or adds or removes a compartment. Changing settings never reframes the view.
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
| Forklift roll-up, custom (96" wide for now) | ICC-DR-96120 | none; coolers with 120" panels only |
| Traffic, single / double | ICC-DR-3684DS / 7284DS -GR·WH·BK | finish |

Man doors are the same 34" × 78" leaf whichever way they are mounted. Semi-buried doors stand proud of the wall on a 4.75" frame (20 mm proud) and lap 1.5" over the opening behind, leaving 3.25" of frame showing; the hinge bases and latch strike sit in the middle of that strip. Full-buried doors sit flush in a 2" frame with a gasket line around the leaf. Swing doors come with cam-lift hinges and a self closer, modelled after the ICC door pages. L/R is the swing side seen from outside: hinges on the left for L. Hardware add-ons: hydraulic closer ICC-20SS; handles ICC-P4, ICC-W58BL, ICC-W58BR, ICC-38.

The roll-up opening runs the full 120" panel height; its drum housing sits above the walls and is not counted against the panel height. The rules engine checks that each door fits its wall (with frame, guides and slide travel), that doors on one wall keep 4" apart, and that the compartment is tall enough for the door. Dragging the floor plan is refused when a wall would get too short for its doors.

## Compartments

A configuration holds one or more compartments ("Compartment 1", "Compartment 2"…; rename them on the Layout step). Each keeps its own shape, size, finish, floor, doors, glass doors, controller and accessories; the site type (indoor or outdoor) is shared. The bar over the 3D view switches between them and has **Add Compartment** and **Duplicate**. New and duplicated compartments are placed touching the right-hand side of the site, fronts in line; on the Layout step a compartment can be placed touching any side of another, or nudged in 6" steps. A position is the centre of the compartment's footprint, so resizing grows both ways. Overlapping compartments are flagged on both. The floor plan shows the compartment being edited.

## Floors and ramps

Floor is chosen on the Layout step: Standard, DuraFloor, Recessed (a concrete slab running 4" past the walls, flush with the room floor) or none (freezers always have a floor). With Standard or DuraFloor, the Exterior ramp option puts an ICC-R3436 aluminum ramp (34" × 36") outside every door close to 34" wide (man doors, single traffic doors), rising from the ground to the top of the floor.

## Glass display doors

Glass units live in the same `doors` list (family `glass`) so they share wall placement, spacing rules and red problem marking with doors. They are numbered G1, G2… and edited on the Glass doors step.

| Series | Per door | Door frame | Finishes | Handle | Models |
| --- | --- | --- | --- | --- | --- |
| Select | 30" × 66" | PVC, glossy black | glossy black | full length | ICC-GD-SELECT-2D/3D |
| Elite | 30" × 72" | aluminum | black (BK), anodized (AN) | full length | ICC-GD-ELITE-BK/AN-2D/3D |
| Signature | 30" × 72" | frameless | black (BK), anodized (SV) | 18" bar | ICC-GD-SIGNATURE-BK/SV-2D/3D |

A unit is its doors plus a 1.5" aluminum outer frame (2-door 63" wide, 3-door 93"). Two-door units open from the centre; three-door units hinge left, right, right. The small white squares at the top of the frame are the hinges, as in the ICC photos, so they mark which side each door opens from. Units can be raised up to 3' 0" (and only as far as the wall allows); a raised unit cuts a window in the wall rather than a notch.

Glass units of the same height and lift may touch side by side with no gap and are not flagged. Units of different heights, and glass next to any other door, keep a 4" gap and are flagged if closer. Dragging a door or unit on the plan, or with its slider, stops where it meets a neighbour; nothing passes through anything else.

## Checker plates

Aluminum checker plate is placed by the square foot: 1' × 1' squares on a 1-ft grid per wall, counted from the left end of the wall's inside run and from the floor. The tread texture is mapped in wall coordinates, so neighbouring squares form one seamless sheet. Paint squares on the wall elevation on the Accessories step, or use "Fill below with checker plate" on a raised glass unit. Squares can't cover a door opening or the controller; if a door is later moved over one, it is flagged.

## Controller

One per compartment, on the Refrigeration step. ICC-TSC2000 Smart Control (4½" × 4" × 1", Wi-Fi and app) or ICC-TC1000 Temperature Controller (about 4¼" × 2" × ½", estimated). It starts beside the first door on its latch side, 4" clear of the hardware, centred at 5' 0" (eye level), and can move to any wall, left or right, and between 3' 4" and 5' 6" high. It is flagged when it sits over or within ½" of a door opening.

## Finishes

Outside of the walls: White Coated, Grey White Coated, Logo Decals (the default: white background, 12" tiles), or a custom colour. Logo Decals tile an image across and down the outside of the walls, turned 45°, over a background colour (corner trim takes the background colour). The default image is the brand logo (`apps/web/src/assets/icc-logo.svg`); users can upload an SVG, PNG, JPG or WebP up to 2 MB, which is saved inside the configuration file. Tile size runs 12"–60".

## Problems in the 3D view

Every rule in `validate()` can name the parts it is about (`Issue.targets`: a door, a wall or the floor). `flaggedParts()` turns those into part ids, and the 3D view tints them red at 40% opacity and shows the messages on hover. A new rule only needs to set `targets` for its parts to be marked.

## Brand skins

A skin is a `[data-theme="<id>"]` block in `apps/web/src/theme/tokens.css` plus an entry in `apps/web/src/theme/brands.ts` (footer words, the WebGL scene colours, and the logo used on door badges and as the default decal). The neutral skin carries the ICC logo for now. An iCoola skin must set `logo: null`: iCoola deliverables never show ICC. Components only read the CSS variables.

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
