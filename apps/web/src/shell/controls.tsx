/** Small form controls matching the original panel styles. */
import { type ReactNode, useState } from 'react';

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="panel-section">
      <h3 className="section-label">
        {title}
        {hint && <span className="section-hint"> {hint}</span>}
      </h3>
      {children}
    </section>
  );
}

/**
 * A collapsible card for grouping a step's sections. Closed, it shows a one-line
 * summary so the panel stays short; the status pill flags problems either way.
 */
export function Card({
  title,
  step,
  summary,
  status,
  defaultOpen = true,
  children,
}: {
  title: string;
  step?: string;
  summary?: ReactNode;
  status?: { kind: 'ok' | 'warn' | 'error'; text: string };
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`card${open ? ' open' : ''}`}>
      <button type="button" className="card-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {step && <span className="card-step">{step}</span>}
        <span className="card-title">{title}</span>
        {status && <span className={`card-status ${status.kind}`}>{status.text}</span>}
        <span className="card-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {!open && summary && <p className="card-summary">{summary}</p>}
      {open && <div className="card-body">{children}</div>}
    </section>
  );
}

export function Toggle<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="toggle-group" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`toggle-option${value === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  minLabel,
  maxLabel,
  onInput,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  minLabel: string;
  maxLabel: string;
  /** Live while dragging (no undo step). */
  onInput: (v: number) => void;
  /** On release (one undo step). */
  onCommit: () => void;
}) {
  return (
    <div className="slider-row">
      <div className="slider-header">
        <span className="slider-name">{label}</span>
        <output className="slider-value">{display}</output>
      </div>
      <div className="slider-track">
        <input
          type="range"
          aria-label={label}
          aria-valuetext={display}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onInput(Number(e.target.value))}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          onBlur={onCommit}
        />
      </div>
      <div className="slider-range-labels">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check-row">
      <span className="check-label">{label}</span>
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-track" />
      </span>
    </label>
  );
}

export function Icon({ d, fill }: { d: ReactNode; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}
