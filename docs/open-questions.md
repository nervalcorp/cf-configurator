# Open questions from Phase 1

- **Door wall on Cut-out E.** `findDoorEdge()` picks the longest front-facing edge, which for Cut-out E is the 60" inner edge of the notch. That edge is under the 72" minimum, so the default shape starts with an error. Options: prefer the outermost front edge, or wait for Phase 4 (door on any wall).
- **Panel lettering direction.** Code letters C on the right of the door wall (counter-clockwise as drawn on the plan). The old skill notes say C is the left side wall. Behaviour kept as coded until confirmed.
- **Mobile framing.** Camera frames for a wide viewport and crops on phones. Planned with the Phase 3 bottom sheet.
