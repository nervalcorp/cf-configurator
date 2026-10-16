/**
 * Units. Every length in the configuration and the component tree is stored in
 * millimetres. Inches are a display concern only.
 */
export const MM_PER_IN = 25.4;

export const inToMm = (inches: number): number => inches * MM_PER_IN;
export const mmToIn = (mm: number): number => mm / MM_PER_IN;

/** Round a mm value to the nearest whole inch, returned in mm. */
export const snapToInch = (mm: number): number => inToMm(Math.round(mmToIn(mm)));

/** Round a mm value to a multiple of `stepIn` inches, returned in mm. */
export const snapToStep = (mm: number, stepIn: number): number =>
  inToMm(Math.round(mmToIn(mm) / stepIn) * stepIn);

/** 2540 mm → `8' 4"`. Rounds to the whole inch before splitting so 11.6" never shows as 12". */
export function formatFeetInches(mm: number): string {
  const total = Math.round(mmToIn(mm));
  const feet = Math.floor(total / 12);
  const inches = total - feet * 12;
  return `${feet}' ${inches}"`;
}

/** 863.6 mm → `34"`. */
export function formatInches(mm: number): string {
  return `${Math.round(mmToIn(mm))}"`;
}
