import { useState } from 'react';
import { CHECKER_PLATE, RAMP, type RampType, doorTag, framesByLetter, framesFor, rampServes } from '@wic/core';
import { useActiveCompartment, useStore } from '../store';
import { Section, Toggle } from '../shell/controls';
import { CheckerPainter } from './CheckerPainter';

export function AccessoriesTab() {
  const c = useActiveCompartment();
  const edit = useStore((s) => s.editCompartment);
  const frames = framesFor(c);
  const firstWithPlates = c.accessories.checker[0]?.wall;
  const [wall, setWall] = useState<number>(firstWithPlates ?? frames.find((f) => f.letter === 'A')?.edge ?? 0);
  const onWall = c.accessories.checker.filter((q) => q.wall === wall).length;
  const total = c.accessories.checker.length;
  const rampFloor = c.finishes.floor === 'standard' || c.finishes.floor === 'durafloor';
  const served = c.doors.filter(rampServes);

  return (
    <>
      <Section title="Checker plates" hint={`${CHECKER_PLATE.label}`}>
        <p className="panel-note first">
          Click or drag on the wall to add or remove squares. Squares line up on a 1-ft grid, so the tread pattern runs on from square to square.
        </p>
        <div className="wall-picker" role="radiogroup" aria-label="Wall">
          {framesByLetter(frames).map((w) => (
            <button
              key={w.edge}
              type="button"
              role="radio"
              aria-checked={wall === w.edge}
              className={`wall-chip${wall === w.edge ? ' active' : ''}`}
              onClick={() => setWall(w.edge)}
            >
              {w.letter}
            </button>
          ))}
        </div>
        <CheckerPainter c={c} wall={wall} />
        <p className="panel-note">
          Wall {frames[wall]?.letter}: {onWall} sq ft. All walls: {total} sq ft.
        </p>
        {onWall > 0 && (
          <button
            type="button"
            className="btn-link"
            onClick={() => edit((x) => ({ ...x, accessories: { ...x.accessories, checker: x.accessories.checker.filter((q) => q.wall !== wall) } }))}
          >
            Clear this wall
          </button>
        )}
      </Section>

      <Section title="Ramp" hint={`${RAMP.label} (${RAMP.sku})`}>
        {rampFloor ? (
          <>
            <Toggle<RampType>
              label="Ramp"
              value={c.accessories.ramp}
              onChange={(v) => edit((x) => ({ ...x, accessories: { ...x.accessories, ramp: v } }))}
              options={[
                { value: 'exterior', label: 'Exterior ramp' },
                { value: 'none', label: 'None' },
              ]}
            />
            <p className="panel-note">
              {c.accessories.ramp === 'none'
                ? 'No ramps.'
                : served.length
                  ? `One ramp outside ${served.map((d) => doorTag(c.doors, d.id)).join(', ')}, rising to the top of the floor.`
                  : 'No door here takes a 34" ramp (man doors and single traffic doors do).'}
            </p>
          </>
        ) : (
          <p className="panel-note">
            {c.finishes.floor === 'recessed' ? 'A recessed floor sits flush with the room floor' : 'Without a floor the walk-in sits on the room floor'}, so there is no step to ramp. Ramps are offered with Standard and DuraFloor floors.
          </p>
        )}
      </Section>
    </>
  );
}
