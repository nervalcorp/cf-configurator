/**
 * Product catalog for options that map to real models.
 *
 * Source: the ICC Energy spec-widget catalog (ICC_Door_Catalog.xlsx and the
 * accessory widgets). Those models are still being audited against the master
 * lineup, so every value here is provisional. The Phase 6 admin console will
 * replace this file with catalog data from the backend.
 *
 * Assumptions to confirm are marked CONFIRM.
 */
import type { Temperature } from './config';
import { inToMm } from './units';

export const CATALOG_SOURCE = 'ICC spec-widget catalog (models under audit)';

export type DoorKind = 'swing' | 'slide' | 'rollup' | 'traffic';
export type DoorFamilyId =
  | 'man'
  | 'pallet'
  | 'slide-pallet'
  | 'slide-forklift'
  | 'rollup'
  | 'traffic-single'
  | 'traffic-double';
export type ManSeries = '3478' | '13478';
export type HandleId = 'included' | 'ICC-P4' | 'ICC-W58BL' | 'ICC-W58BR' | 'ICC-38';
export type TrafficFinish = 'GR' | 'WH' | 'BK';

export interface DoorFamily {
  id: DoorFamilyId;
  label: string;
  kind: DoorKind;
  /** Clear opening. */
  width: number;
  height: number;
  /** Space the door needs above the opening (frame, header, track or coil box). */
  headroom: number;
  /** Space beside the opening, [left, right] seen from outside, before any slide travel. */
  side: number;
  /** Which compartment temperatures the model is built for. */
  temps: Temperature[];
  /** Whether the hinge (or slide direction) is part of the model number. */
  handed: boolean;
}

const BOTH: Temperature[] = ['cooler', 'freezer'];
const FRAME = inToMm(2);

export const DOOR_FAMILIES: readonly DoorFamily[] = [
  { id: 'man', label: 'Man door 34" × 78"', kind: 'swing', width: inToMm(34), height: inToMm(78), headroom: FRAME + inToMm(2), side: FRAME, temps: BOTH, handed: true },
  { id: 'pallet', label: 'Pallet door 48" × 78"', kind: 'swing', width: inToMm(48), height: inToMm(78), headroom: FRAME + inToMm(2), side: FRAME, temps: BOTH, handed: true },
  { id: 'slide-pallet', label: 'Pallet sliding door 54" × 96"', kind: 'slide', width: inToMm(54), height: inToMm(96), headroom: inToMm(8), side: inToMm(4), temps: BOTH, handed: true },
  { id: 'slide-forklift', label: 'Forklift sliding door 72" × 96"', kind: 'slide', width: inToMm(72), height: inToMm(96), headroom: inToMm(8), side: inToMm(4), temps: BOTH, handed: true },
  { id: 'rollup', label: 'Forklift roll-up door 96" × 120"', kind: 'rollup', width: inToMm(96), height: inToMm(120), headroom: inToMm(16), side: inToMm(4), temps: BOTH, handed: false },
  { id: 'traffic-single', label: 'Traffic door, single 36" × 84"', kind: 'traffic', width: inToMm(36), height: inToMm(84), headroom: FRAME + inToMm(2), side: FRAME, temps: BOTH, handed: false },
  { id: 'traffic-double', label: 'Traffic door, double 72" × 84"', kind: 'traffic', width: inToMm(72), height: inToMm(84), headroom: FRAME + inToMm(2), side: FRAME, temps: BOTH, handed: false },
];

const families = new Map(DOOR_FAMILIES.map((f) => [f.id, f]));
export function getDoorFamily(id: DoorFamilyId): DoorFamily {
  const f = families.get(id);
  if (!f) throw new Error(`Unknown door type: ${id}`);
  return f;
}

export const MAN_SERIES: { id: ManSeries; label: string }[] = [
  { id: '3478', label: 'ICC-DR-3478' },
  // CONFIRM: how the 13478 series differs from 3478. Only 13478 has window (W) models.
  { id: '13478', label: 'ICC-DR-13478' },
];

export const HANDLES: { id: HandleId; label: string }[] = [
  { id: 'included', label: 'Handle supplied with the door' },
  { id: 'ICC-P4', label: 'Safety latch handle, polished chrome (ICC-P4)' },
  { id: 'ICC-W58BL', label: 'Pull handle, black (ICC-W58BL)' },
  { id: 'ICC-W58BR', label: 'Pull handle, brass (ICC-W58BR)' },
  { id: 'ICC-38', label: 'Industrial handle, stainless (ICC-38)' },
];

export const TRAFFIC_FINISHES: { id: TrafficFinish; label: string; color: string }[] = [
  { id: 'GR', label: 'Grey', color: '#8a8f96' },
  { id: 'WH', label: 'White', color: '#f2f2f0' },
  { id: 'BK', label: 'Black', color: '#2a2c30' },
];

export const DOOR_CLOSER_SKU = 'ICC-20SS';

/** Model number for a door. L/R is the hinge (or slide) side seen from outside. CONFIRM. */
export function doorSku(
  d: { family: DoorFamilyId; series: ManSeries; window: boolean; hinge: 'left' | 'right'; finish: TrafficFinish },
  temperature: Temperature,
): string {
  const t = temperature === 'freezer' ? 'F' : 'C';
  const h = d.hinge === 'left' ? 'L' : 'R';
  switch (d.family) {
    case 'man':
      return `ICC-DR-${d.series}${t}${h}${d.series === '13478' && d.window ? 'W' : ''}`;
    case 'pallet':
      return `ICC-DR-4878${t}${h}`;
    case 'slide-pallet':
      return `ICC-DR-5496${h}`;
    case 'slide-forklift':
      return `ICC-DR-7296${h}`;
    case 'rollup':
      return 'ICC-DR-96120';
    case 'traffic-single':
      return `ICC-DR-3684DS-${d.finish}`;
    case 'traffic-double':
      return `ICC-DR-7284DS-${d.finish}`;
  }
}
