# Open questions

## Doors

- **Not in the ICC catalog.** Jamb guards, kickplates, pressure-relief vents and strip curtains have no model yet, so they are not offered.

## Shelving

- **Post height.** Defaults to 7' 0" (or the wall height if lower). Should posts run to the ceiling with the retainer brackets fixed to it?

## Evaporators

- **Unit sizes.** Proportions now come from the evaporator artwork, scaled by an estimated fan size (1-fan cooler about 28" × 17" × 16"; 3-fan freezer about 79" × 22½" × 20"). Send length × height × depth (and weight) per model; the rear gap rule and headroom depend on the height.
- **Values to check on the ICC pages:** EVC1000 lists the same 1 fan and 1523 CFM as EVC500 at nearly twice the capacity; EVC2000-4000 share one airflow; EVF3000 lists TES2-5 below EVF2000's TES2-6; heater counts are blank on EVF2000-4000.
- **Load and model choice.** The customer picks models. A heat-load estimate (to suggest a model and check total BTU/h) is not built; it needs engineering sign-off first.
## Condensing units

- **Capacity tolerance.** Under 75% of the evaporator load is blocked, over 125% warned; ICC's matched pairs run 77-93%. Confirm the range.
- **Site power.** No site power setting yet; each unit shows its own power (three SUOF models are 220V 3ph). Add one?
- **Values to check:** SUOC1000 compressor "NT622GK" (NT6226GK elsewhere); SUIF2000 YF41E7G vs SUOF2000 YF41E3G at the same rating; SUIF2000 RLA 25.2 vs SUOF2000 28; SUIF1000 at 3 HP for 8,913 BTU/h.
- **Sizes.** Now from ICC's drawings (in inches). SUIC386/530/700 and SUOC700 use the nearest family's drawing; outdoor feet heights are estimated (not dimensioned).
- **Packaged plug and thick ceilings.** The plug is 4.33" (110 mm); freezer ceilings thicker than that would need a deeper plug or a curb. The model stretches the plug to reach through; confirm what ICC supplies.
- **ICC Control Box** model number (needed over 5 HP with the Smart Control).
- **Liquid line solenoid valves** for shared units are noted as installer supplied. Does ICC sell one?
- **Evaporator fan rule of thumb** (1 fan ≈ 4,000-7,000 BTU/h; 200-250 CFM per 1,000 BTU/h) doesn't match several ICC evaporators (EVC4000: 2 fans for 41,037 BTU/h). Left as data to check, not a rule.

## Products from artwork

- **TSC2000 height.** At 4.5" wide the artwork's proportions make the housing about 4¼" tall; the spec says 4". Kept the artwork's shape.
- **Ids in future artwork.** Naming the shapes (`id="housing"`, `"boot"`, `"cable"`, `"gland"`, or `"hinge"`, `"handle"`…) lets recipes match parts by name instead of order.
- **Hinge size.** Scaled to 9" from pin to strap tip; confirm against the ICC-1238 spec.
- **Closer size.** Scaled to a 2" wide body (about 9" long); confirm against the ICC-20SS spec.
- **Hinge kit quantity.** One ICC-1238SL/SR per hinge, three per swing door. Is a kit one hinge?
- **Next:** knobs, pull handles, latches and similar hardware from John's SVGs, counted as accessories in the part list.

## Compartments and ramps

- **Interior ramp.** Withdrawn for now; saved drafts with it become the exterior ramp. Will it come back?
- **Which doors get a ramp.** Man doors and single traffic doors (within 2" of the ramp's 34" width). Pallet, sliding, roll-up and double traffic doors get none. Is a wider ramp coming?
- **Docking compartments.** Compartments can touch but each keeps its own walls. Sharing a wall, and a pass-through door between compartments, are not done yet.

## Glass doors

- **Mounting height.** Units sit on the floor (frame bottom at floor level). Are they raised on a curb or base in practice?
- **LED lights and heaters** are listed on every series but not drawn; lights inside the unit can come with the Accessories step.
- **Custom sizes** are available per the pages but not offered in the configurator yet.
- **Old glass door models** (ICC-GDC/GDF, ICC-GD-ASD/ASS) are not offered; the catalog marks them as pending removal.

## Checker plates

- **What to quote.** The ICC page lists no product ID. Plates are counted in square feet; the catalog also has 48" × 96" sheets (ICC-4896-3AL / -5AL, 32 sq ft each). Should the part list convert squares into sheets?

## Controller

- **TC1000 model number.** The page's variant button reads ICC-TSC1000, the model line reads ICC-TC1000. The configurator uses ICC-TC1000.
- **TC1000 size.** Estimated at 4¼" × 2" × ½" from the photo.
- **Over 5 HP.** The TSC2000 needs the ICC Control Box above 5 HP. Once condensing units are chosen, the configurator can add the Control Box or flag it.

## Finishes

- **Grey White Coated colour.** Set to `#d6d8da` as a placeholder; send the real colour.
- **Custom colour picker.** Kept, since it was not in the removal list. Remove it?
- **Footer logo.** The ICC logo is only on door badges and decals so far. Put it in the footer too?

## Resolved

- **Door closer** (2026-10-29). "Self closer" is the ICC-20SS Door Closer: fitted to swing doors by default, switchable, counted in the part list, modelled from artwork.
- **Hinge kits in the part list** (2026-10-29). ICC-1238SL/SR, three per swing door, modelled from artwork.

- **Gravity flow tray model** (2026-10-24). ICC-GRAVITY-SHELF.
- **Shelving quantity** (2026-10-24). Sold on its own by quantity, one per bay, with or without glass doors.
- **Resizing next to a neighbour** (2026-10-24). Grows away from the nearest neighbour; from the centre when alone.

- **Mobile framing** (2026-10-23). The camera pulls back on narrow screens so the whole site fits.
- **Camera on site type change** (2026-10-23). Switching indoor/outdoor no longer moves the view.

- **Glass hinge pattern** (2026-10-23). The white squares on the frame are the hinges; 2-door from the centre, 3-door left, right, right.
- **Semi-buried frame** (2026-10-23). 4.75" wide, hinges and strike mounted in the middle of the exposed frame.

- **Default finish** (2026-10-23). Logo decals on a white background, 12" tiles.
- **Man door leaf size** (2026-10-23). Semi- and full-buried leaves were different (37" × 79.5" vs 33.4" × 77.7"); both are now exactly 34" × 78".
- **Roll-up width** (2026-10-23). 96" until there is new information.

- **Finishes** (2026-10-22). Stucco and stainless finishes retired (saved drafts become White Coated); Grey White Coated and Logo Decals added.
- **Semi-buried frames** (2026-10-22). Semi-buried doors have a frame like full-buried, heavier.
- **13478 vs 3478** (2026-10-19). 13478 is full-buried (flush in a frame), 3478 is semi-buried (stands proud of the wall). Window models are full-buried only. 3D models follow the ICC door pages.
- **L/R in model numbers** (2026-10-19). Swing side seen from outside: an L door has its hinges on the left.
- **Roll-up height** (2026-10-19). Coolers only, 120" panels only, opening the full panel height, drum housing above the walls and not counted.
- **Height meaning** (2026-10-19). The Height setting is the wall panel height.
- **Door on Cut-out E** (2026-10-16). A door only has to fit its own wall.
- **Panel lettering** (2026-10-16). One letter per wall, A at the front, counter-clockwise on the plan.

## Later

- **Mobile bottom sheet.** The options panel still slides over the view on phones; a bottom sheet is planned for Phase 3.
