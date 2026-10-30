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
- **Screenshots** come in three sizes: as on screen, 2×, and 4× for print with 300 dpi written into the PNG (capped at 8192 px on the long side).
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

A configuration holds one or more compartments ("Compartment 1", "Compartment 2"…; rename them on the Layout step). Each keeps its own shape, size, finish, floor, doors, glass doors, controller and accessories; the site type (indoor or outdoor) is shared. The bar over the 3D view switches between them and has **Add Compartment** and **Duplicate**. New and duplicated compartments are placed touching the right-hand side of the site, fronts in line; on the Layout step a compartment can be placed touching any side of another, or nudged in 6" steps. Alone, a compartment grows from its centre when resized; with others on the site it grows away from its nearest neighbour on each axis (the edge facing the neighbour stays put). Overlapping compartments are flagged on both. Names are unique: the name field refuses one that is taken, and loaded files with repeated names get a number. With more than one compartment, the one being edited glows teal on the floor. The floor plan shows the compartment being edited.

## Floors and ramps

Floor is chosen on the Layout step: Standard, DuraFloor, Recessed (a concrete slab running 4" past the walls, flush with the room floor) or none (freezers always have a floor). With Standard or DuraFloor, the Exterior ramp option puts an ICC-R3436 aluminum ramp (34" × 36") outside every door close to 34" wide (man doors, single traffic doors), rising from the ground to the top of the floor.

## Shelving

ICC-ACC-SHELVING-HD heavy duty shelving goes inside a compartment from the Accessories step. A unit is a run of bays, one per door opening, each with 30" × 27" wire shelves (5 by default, heights adjustable by setting the lowest and highest shelf). It is built from the product sheet's parts: perforated black posts with foot plates and post retainer brackets, wire shelves (a flat panel with a see-through mesh texture), clear price tag strips, diagonal side braces and stabilizer bars along the top. Any shelf can take a gravity flow tray, which tips the shelf toward the front and adds a dark bed, wire lane dividers and a front stop.

**Add shelving** puts a unit behind the nearest glass door unit that has none yet: one bay per glass door, facing the glass, 3" back from the wall, with shelves inside the door opening. Without glass doors it goes against the back wall. Drag units on the floor plan (the teal edge is the front), nudge them 1" at a time, or turn them 90°. A unit that leaves the compartment or overlaps another is flagged. Shelving is sold on its own by quantity, one ICC-ACC-SHELVING-HD per bay, with or without glass doors; gravity flow trays are ICC-GRAVITY-SHELF.

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

## Products built from artwork

Artwork SVGs are bundled into the app, so keep their embedded photos small: the evaporator photos are re-encoded as 1200 px JPEGs (the SVG went from 6.7 MB to 0.23 MB with no visible loss on the fans). The `<image>` width and height attributes must stay as drawn, since the outlines and texture mapping use them.

Some products are modelled from artwork John supplies: one SVG with the product photo as an `<image>` and a vector shape over each part, in the same coordinates. `apps/web/src/viewer/productModels.ts` reads it with three.js's SVGLoader, turns each shape into 3D by its role (extruded housing, raised glass face, tapered boot, cable, hex gland…) and projects the photo onto every part from the SVG's x/y, so the model's face is the photo. Shapes are matched by `id` when they have one (`id="housing"`), otherwise by order. Add a product by dropping its SVG in `apps/web/src/assets/products/` and adding a recipe (roles, real width, depths). Built so far:

- **ICC-TSC2000 Smart Control**: housing, raised glass face, boot, cable, gland.
- **ICC-1238SL/SR cam-lift hinge** (`hardwareModels.ts`): base plate on the frame, pin block, pin barrel with cap, strap with raised spine on the leaf, screw heads. Drawn left-hand; right-hand doors mirror it. Three per swing door, in the part list.
- **ICC-20SS door closer**: body with top cap and mounting tabs on the leaf; catch bracket with ears, channel and hood on the frame above; arm and black roller from the angled photo. Fitted to swing doors by default (switch on the Doors step), in the part list.

Door hardware takes a `standoff` (how far the leaf face stands in front of the frame face) so the same artwork fits semi- and full-buried doors; each distinct fit is built once and shared. A soft studio environment gives polished stainless real reflections.

## Evaporators

On the Refrigeration step (above the controller). Eleven ICC models: coolers ICC-EVC500 to EVC4000 (1 or 2 fans) and freezers ICC-EVF1000 to EVF4000 (1, 2 or 3 fans); a compartment offers the line for its temperature and swaps to the nearest-capacity model when the temperature changes. The rules decide how many units and where; the customer picks the model.

Rules encoded (`layout/evaporators.ts`, `EVAP_RULES`): never over a door (no unit on a door's wall within 12" of the opening); rear gap at least the coil height and never under 12"; one unit throws up to 25' (20' comfortable) and covers about 15' of width; keep shelving 12" clear of the unit; flag two units blowing at each other in a short room; flag headroom under 6' 6". Errors tint the unit red with the reason on hover; warnings show on Review.

**Add evaporator** puts one unit in the best open spot: the ceiling spot whose air reaches the most floor not yet reached, preferring the wall facing the main door so it blows toward it. **Suggest layout** builds the full set: it adds units that way until about all of the floor is within 20' of one (never suggesting a spot that throws past 25'), spaces units sharing a wall into equal sections, then drops any unit the others already cover. This gives one unit for small rooms, two for rooms 20'-40' long or more than 15' wide, and a unit for the leg of an L-shaped room. Units can be dragged along the ceiling on the plan or onto another wall.

The units are modelled from John's evaporator artwork (`apps/web/src/viewer/evaporatorModel.ts`): the 1, 2 and 3 fan outlines give the housing, top lip, drain rail, side rails, hanger brackets with studs, and the black pipe stubs and flanges; the frame is brushed aluminium, and only the fans and the ICC badge take the photos as textures (each outline set sits directly below its photo, shifted 527.8 units). Sizes keep the artwork's proportions, scaled so the fan matches a fan size estimated from airflow, until the spec sheets arrive.

On the Refrigeration step each unit shows its air throw as a flat zone under the ceiling, clipped to the room's shape so it never passes through a wall or into a cut-out, with a soft feathered edge (per-vertex alpha, no blur pass). Zones never block clicks: the pointer picks whatever solid part is behind them. Display options has Show air throw, its opacity, and its opacity under the pointer. **Show airflow** adds a light particle loop: cold air jets out of the fans along the ceiling, slows and sinks, runs back along the floor and rises behind the unit into the coil; walls keep particles inside the room. It shows on every step once switched on. It is one point cloud (up to 320 particles) stepped on the CPU each frame, and it starts off for people who ask their system for reduced motion.

## Condensing units

On the Refrigeration step, after the evaporators. ICC lineup: coolers ICC-SUIC386 to SUIC1500 (indoor) and SUOC500 to SUOC4000 (outdoor); freezers ICC-SUIF1000 to SUIF2000 (indoor) and SUOF1000 to SUOF4000 (outdoor). Packaged (self-contained) units ICC-MBIC350 to MBIC1500 and MBIF450 to MBIF1500 are picked among the evaporators, since each is its own evaporator and condenser; they need no condensing unit and nothing can connect to them.

Customers add units freely; the model list greys out what doesn't fit, with the reason. Rules (John's notes, `MAX_EVAPS_PER_CU`, `CU_MATCH`): one unit serves at most 3 evaporators indoors and 2 outdoors for coolers, 1 for freezers; capacity must cover the combined evaporator load, with under 75% blocked (ICC's same-number matched pairs, e.g. EVC1000 + SUIC1000, run 77-93%) and over 125% warned as short-cycling; same-number pairs are marked "matched pair" and chosen first. **Add condensing unit** takes unserved evaporators while a model can still carry them, indoor on an indoor site (switching to outdoor when no indoor unit is big enough, as for EVC2000 and up) and outdoor on an outdoor site; **Match all evaporators** repeats until every split evaporator is served. Indoor units sit on the roof above their first evaporator; outdoor units stand outside its wall, 12" clear, facing out; both can be dragged on the plan and turned. A shared unit notes that each evaporator needs its own liquid line solenoid valve. Over 5 HP the Smart Control needs the ICC Control Box (added to the part list); the Temperature Controller warns on 220V units. Units are simple boxes until artwork arrives.

## Controller

One per compartment, on the Refrigeration step. ICC-TSC2000 Smart Control (4½" wide, 1" deep, about 4¼" tall at the artwork's proportions; Wi-Fi and app), modelled from its artwork, or ICC-TC1000 Temperature Controller (about 4¼" × 2" × ½", estimated). It starts beside the first door on its latch side, 4" clear of the hardware, centred at 5' 0" (eye level), and can move to any wall, left or right, and between 3' 4" and 5' 6" high. It is flagged when it sits over or within ½" of a door opening.

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
