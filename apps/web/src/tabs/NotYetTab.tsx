import { Section } from '../shell/controls';

export function NotYetTab({ what }: { what: string }) {
  return (
    <Section title="Not available yet">
      <p className="panel-note">{what} will be set here. Nothing on this step changes your walk-in for now, so continue to the next step.</p>
    </Section>
  );
}
