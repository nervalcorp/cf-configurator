import type { RampType } from '@wic/core';
import { useActiveCompartment, useStore } from '../store';
import { Section, Toggle } from '../shell/controls';

export function AccessoriesTab() {
  const c = useActiveCompartment();
  const edit = useStore((s) => s.editCompartment);
  return (
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
  );
}
