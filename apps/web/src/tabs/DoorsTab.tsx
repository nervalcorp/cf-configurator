import { LIMITS, type HingeSide, footprint, doorWallLength, formatInches, inToMm, mmToIn } from '@wic/core';
import { useActiveCompartment, useStore } from '../store';
import { Section, Slider, Toggle } from '../shell/controls';

export function DoorsTab() {
  const c = useActiveCompartment();
  const { editCompartment: edit, commit } = useStore.getState();
  const wall = doorWallLength(footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD));
  const inside = wall - 2 * c.wallThickness;
  const maxOffset = Math.max(LIMITS.doorFrame, inside - c.door.width - LIMITS.doorFrame);
  const minIn = Math.ceil(mmToIn(LIMITS.doorFrame));
  const maxIn = Math.max(minIn, Math.floor(mmToIn(maxOffset)));

  return (
    <>
      <Section title="Door">
        <p className="panel-note">
          {formatInches(c.door.width)} swing door on the front wall (panels A and B). The front wall is {formatInches(wall)} outside.
        </p>
      </Section>
      <Section title="Hinge side" hint="Seen from outside">
        <Toggle<HingeSide>
          label="Hinge side"
          value={c.door.hinge}
          onChange={(v) => edit((x) => ({ ...x, door: { ...x.door, hinge: v } }))}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ]}
        />
      </Section>
      <Section title="Position">
        <Slider
          label="Distance from left corner"
          value={Math.min(Math.round(mmToIn(c.door.offset)), maxIn)}
          min={minIn}
          max={maxIn}
          step={1}
          display={formatInches(c.door.offset)}
          minLabel={`${minIn}"`}
          maxLabel={`${maxIn}"`}
          onInput={(v) => edit((x) => ({ ...x, door: { ...x.door, offset: inToMm(v) } }), { transient: true })}
          onCommit={commit}
        />
      </Section>
    </>
  );
}
