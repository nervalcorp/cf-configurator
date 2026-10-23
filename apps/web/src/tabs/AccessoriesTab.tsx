import { useState } from 'react';
import { CHECKER_PLATE, type RampType, framesByLetter, framesFor } from '@wic/core';
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

      <Section title="Ramp">
        <Toggle<RampType>
          label="Ramp"
          value={c.accessories.ramp}
          onChange={(v) => edit((x) => ({ ...x, accessories: { ...x.accessories, ramp: v } }))}
          options={[
            { value: 'interior', label: 'Interior' },
            { value: 'exterior', label: 'Exterior' },
            { value: 'none', label: 'None' },
          ]}
        />
        <p className="panel-note">The ramp is recorded on the configuration. It is not drawn in 3D yet.</p>
      </Section>
    </>
  );
}
