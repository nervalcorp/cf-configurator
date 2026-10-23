/**
 * 2D floor plan. Draws the footprint, walls and doors from core, and edits
 * through core functions so the plan and the 3D view never disagree.
 *
 * mode "shape": drag corners to resize the box or its cut-out.
 * mode "doors": click a door to select it, drag it along its wall, or click
 *               another wall to move the selected door there.
 *
 * The view scale is frozen while dragging so the shape doesn't rescale under
 * the pointer.
 */
import { useEffect, useRef } from 'react';
import {
  type Compartment,
  type DragHandle,
  type Vec2,
  type WallFrame,
  dragHandle,
  edgeLength,
  edgeNormal,
  findFrontEdge,
  footprint,
  formatInches,
  getDoorFamily,
  doorSize,
  doorTag,
  getGlassSeries,
  inToMm,
  isClockwise,
  jointNumber,
  moveDoor,
  offsetPolygon,
  pickHandle,
  slideDoor,
  shelvingRect,
  facingVector,
  updateShelving,
  getControl,
  wallFrames,
  wallPoint,
} from '@wic/core';
import { useActiveCompartment, useStore } from '../store';

const SIZE = 600;
const PAD = 80;
const HIT = 16;

interface View {
  scale: number;
  ox: number;
  oy: number;
}

/** Fit the footprint plus door swings (which hang off the walls) into the canvas. */
function fitView(fp: Vec2[], swing: number): View {
  let maxX = 0;
  let maxY = 0;
  for (const [x, y] of fp) {
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const LABEL = 30;
  const span = Math.max(maxX + swing * 2, maxY + swing * 2);
  const scale = (SIZE - PAD * 2 - LABEL) / (span || 1);
  return { scale, ox: (SIZE - maxX * scale) / 2, oy: (SIZE - maxY * scale) / 2 };
}

const toCanvas = (v: View, [x, y]: Vec2): Vec2 => [v.ox + x * v.scale, v.oy + y * v.scale];
const toPlan = (v: View, cx: number, cy: number): Vec2 => [(cx - v.ox) / v.scale, (cy - v.oy) / v.scale];

function css(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const fpOf = (c: Compartment) => footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);
const maxSwing = (c: Compartment) =>
  c.doors.reduce((m, d) => {
    const k = getDoorFamily(d.family).kind;
    const reach = k === 'swing' ? doorSize(d).width : k === 'glass' ? getGlassSeries(d.glass.series).doorWidth : inToMm(12);
    return Math.max(m, reach);
  }, inToMm(12));

/** Which doors this plan lets you pick and drag. */
export type DoorPick = 'doors' | 'glass';
const pickable = (pick: DoorPick, family: string) => (pick === 'glass' ? family === 'glass' : family !== 'glass');

/** Project a plan point onto a wall: distance along it and distance from its outside face. */
function project(f: WallFrame, T: number, p: Vec2) {
  const dx = p[0] - f.origin[0];
  const dy = p[1] - f.origin[1];
  return { along: dx * f.u[0] + dy * f.u[1], out: dx * f.n[0] + dy * f.n[1] - T };
}

type Mode = 'shape' | 'doors' | 'shelving';

function draw(ctx: CanvasRenderingContext2D, c: Compartment, view: View, mode: Mode, active: number, selected: string | null, pick: DoorPick, shelf: string | null) {
  const fp = fpOf(c);
  const n = fp.length;
  const cw = isClockwise(fp);
  const front = findFrontEdge(fp);
  const frames = wallFrames(fp, c.wallThickness);
  const line = css('--fp-line', '#0891b2');
  const doorCol = css('--fp-door', '#dd3333');
  const P = (p: Vec2) => toCanvas(view, p);

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = css('--fp-grid', '#e8ecf0');
  ctx.lineWidth = 0.5;
  const step = 304.8 * view.scale;
  for (let x = view.ox % step; x < SIZE; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, SIZE);
    ctx.stroke();
  }
  for (let y = view.oy % step; y < SIZE; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SIZE, y);
    ctx.stroke();
  }

  const path = (pts: Vec2[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
    ctx.closePath();
  };

  path(fp);
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = line;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  path(fp);
  ctx.clip();
  ctx.globalAlpha = 0.08;
  ctx.lineWidth = 0.8;
  for (let d = -SIZE; d < SIZE * 2; d += 12) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d - SIZE, SIZE);
    ctx.stroke();
  }
  ctx.restore();
  path(offsetPolygon(fp, -c.wallThickness));
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Edge lengths outside, wall letters inside
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const a = fp[i];
    const b = fp[(i + 1) % n];
    const [nx, ny] = edgeNormal(a, b, cw);
    const [mx, my] = P([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    if (mode === 'shape') {
      const txt = formatInches(edgeLength(a, b));
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      const tw = ctx.measureText(txt).width;
      const lx = mx + nx * 20;
      const ly = my + ny * 20;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(lx - tw / 2 - 5, ly - 9, tw + 10, 18);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(lx - tw / 2 - 5, ly - 9, tw + 10, 18);
      ctx.fillStyle = '#1e293b';
      ctx.fillText(txt, lx, ly);
    }
    ctx.font = '700 13px Outfit, sans-serif';
    ctx.fillStyle = line;
    ctx.fillText(frames[i].letter, mx - nx * 24, my - ny * 24);
  }

  // Doors
  c.doors.forEach((d) => {
    const f = frames[d.wall];
    if (!f) return;
    const fam = getDoorFamily(d.family);
    const T = c.wallThickness;
    const W = doorSize(d).width;
    const isSel = mode === 'doors' && d.id === selected;
    const dim = mode === 'doors' && (!isSel || !pickable(pick, d.family));
    const col = isSel ? doorCol : dim ? '#94a3b8' : doorCol;
    const outside = (along: number, out: number) => P(wallPoint(f, along, T + out));
    const r = W * view.scale;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    // opening
    ctx.lineWidth = isSel ? 6 : 4;
    ctx.beginPath();
    ctx.moveTo(...outside(d.offset, -T / 2));
    ctx.lineTo(...outside(d.offset + W, -T / 2));
    ctx.stroke();
    ctx.lineWidth = isSel ? 2.5 : 1.5;
    const angleOf = (v: Vec2) => Math.atan2(v[1], v[0]);
    if (fam.kind === 'swing') {
      const hingeAlong = d.hinge === 'right' ? d.offset + W : d.offset;
      const dir = d.swing === 'out' ? 1 : -1;
      const hingePt = outside(hingeAlong, dir > 0 ? 0 : -T);
      const leafDir: Vec2 = [f.n[0] * dir, f.n[1] * dir];
      const closedDir: Vec2 = d.hinge === 'right' ? [-f.u[0], -f.u[1]] : [f.u[0], f.u[1]];
      ctx.beginPath();
      ctx.moveTo(...hingePt);
      ctx.lineTo(hingePt[0] + leafDir[0] * r, hingePt[1] + leafDir[1] * r);
      ctx.stroke();
      const a1 = angleOf(leafDir);
      const a2 = angleOf(closedDir);
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(hingePt[0], hingePt[1], r, a1, a2, diff < 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(hingePt[0], hingePt[1], 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (fam.kind === 'slide') {
      const shift = d.hinge === 'right' ? W : -W;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(...outside(d.offset - 100, 60));
      ctx.lineTo(...outside(d.offset + W + 100, 60));
      ctx.stroke();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(...outside(d.offset - 100 + shift, 110));
      ctx.lineTo(...outside(d.offset + W + 100 + shift, 110));
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (fam.kind === 'rollup') {
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      const p1 = outside(d.offset - 60, 0);
      const p2 = outside(d.offset + W + 60, 0);
      const p3 = outside(d.offset + W + 60, 380);
      const p4 = outside(d.offset - 60, 380);
      ctx.moveTo(...p1);
      ctx.lineTo(...p2);
      ctx.lineTo(...p3);
      ctx.lineTo(...p4);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (fam.kind === 'glass') {
      // Glass unit: each door's swing outward, hinges as the unit's pattern.
      const s = getGlassSeries(d.glass.series);
      const FG = (W - d.glass.count * s.doorWidth) / 2;
      const hinges = d.glass.count === 2 ? ['left', 'right'] : ['left', 'right', 'right'];
      for (let i = 0; i < d.glass.count; i++) {
        const a = d.offset + FG + i * s.doorWidth;
        const b = a + s.doorWidth;
        const hingeAlong = hinges[i] === 'left' ? a : b;
        const hp = outside(hingeAlong, 0);
        const lr = s.doorWidth * view.scale;
        const leafDir: Vec2 = [f.n[0], f.n[1]];
        const closedDir: Vec2 = hinges[i] === 'left' ? [f.u[0], f.u[1]] : [-f.u[0], -f.u[1]];
        const a1 = angleOf(leafDir);
        const a2 = angleOf(closedDir);
        let diff = a2 - a1;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(hp[0], hp[1], lr, a1, a2, diff < 0);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    } else {
      // traffic: two-way swing, short arcs both sides
      const leaves = d.family === 'traffic-double' ? 2 : 1;
      const lw = W / leaves;
      for (let s = 0; s < leaves; s++) {
        const hingeAlong = leaves === 2 ? (s === 0 ? d.offset : d.offset + W) : d.offset + W;
        for (const dir of [1, -1]) {
          const hp = outside(hingeAlong, dir > 0 ? 0 : -T);
          const lr = lw * view.scale;
          const leafDir: Vec2 = [f.n[0] * dir, f.n[1] * dir];
          const closedDir: Vec2 = hingeAlong === d.offset ? [f.u[0], f.u[1]] : [-f.u[0], -f.u[1]];
          const a1 = angleOf(leafDir);
          const a2 = angleOf(closedDir);
          let diff = a2 - a1;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          ctx.setLineDash([3, 4]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(hp[0], hp[1], lr, a1, a2, diff < 0);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }
    // label
    ctx.font = `${isSel ? 700 : 600} 11px Outfit, sans-serif`;
    const lab = outside(d.offset + W / 2, Math.min(W, inToMm(40)) + 140);
    ctx.fillStyle = col;
    ctx.fillText(doorTag(c.doors, d.id), ...lab);
  });

  // Shelving: footprint, with the front edge (the side customers face) in teal
  for (const u of c.accessories.shelving) {
    const r = shelvingRect(u);
    const sel = mode === 'shelving' && u.id === shelf;
    const [x0, y0] = P([r.minX, r.minY]);
    const [x1, y1] = P([r.maxX, r.maxY]);
    ctx.fillStyle = sel ? 'rgba(20,184,200,0.18)' : 'rgba(30,41,59,0.10)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = sel ? '#0e9aa7' : '#334155';
    ctx.lineWidth = sel ? 2 : 1.2;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    // bay lines
    const f = facingVector(u.facing);
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);
    for (let i = 1; i < u.bays; i++) {
      const t = i / u.bays;
      ctx.beginPath();
      if (f[1] !== 0) {
        const x = x0 + (x1 - x0) * t;
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      } else {
        const y = y0 + (y1 - y0) * t;
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = '#0e9aa7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (f[1] > 0) (ctx.moveTo(x0, y1), ctx.lineTo(x1, y1));
    else if (f[1] < 0) (ctx.moveTo(x0, y0), ctx.lineTo(x1, y0));
    else if (f[0] > 0) (ctx.moveTo(x1, y0), ctx.lineTo(x1, y1));
    else (ctx.moveTo(x0, y0), ctx.lineTo(x0, y1));
    ctx.stroke();
    ctx.fillStyle = sel ? '#0e7490' : '#334155';
    ctx.font = '700 11px Outfit, sans-serif';
    ctx.fillText(u.id.replace('sh', 'S'), (x0 + x1) / 2, (y0 + y1) / 2);
  }

  // Controller: a small dark tab on the outside of its wall
  const ctl = getControl(c.control.model);
  const cf = frames[c.control.wall];
  if (ctl && cf) {
    const a = P(wallPoint(cf, c.control.offset - ctl.width / 2, c.wallThickness + 20));
    const b = P(wallPoint(cf, c.control.offset + ctl.width / 2, c.wallThickness + 20));
    ctx.strokeStyle = '#1f2a33';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
    ctx.fillStyle = '#1f2a33';
    ctx.font = '600 10px Outfit, sans-serif';
    const lp = P(wallPoint(cf, c.control.offset, c.wallThickness + 140));
    ctx.fillText('CTRL', ...lp);
  }

  // Corner handles (shape mode) and joint numbers
  for (let i = 0; i < n; i++) {
    const [x, y] = P(fp[i]);
    if (mode === 'shape') {
      ctx.fillStyle = i === active ? line : '#fff';
      ctx.strokeStyle = line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, i === active ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const prev = fp[(i - 1 + n) % n];
    const next = fp[(i + 1) % n];
    const n1 = edgeNormal(prev, fp[i], cw);
    const n2 = edgeNormal(fp[i], next, cw);
    ctx.font = '600 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`J${jointNumber(i, fp, front)}`, x + (n1[0] + n2[0]) * 18, y + (n1[1] + n2[1]) * 18);
  }
}

type Drag =
  | { type: 'corner'; handle: DragHandle; view: View; vertex: number }
  | { type: 'door'; id: string; view: View; grab: number }
  | { type: 'shelf'; id: string; view: View; dx: number; dy: number };

export function FloorPlan({ mode, pick = 'doors' }: { mode: Mode; pick?: DoorPick }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const comp = useActiveCompartment();
  const selected = useStore((s) => s.ui.selectedDoor);
  const shelf = useStore((s) => s.ui.selectedShelf);
  const { editCompartment, commit, setUi } = useStore.getState();
  const drag = useRef<Drag | null>(null);

  const viewNow = () => drag.current?.view ?? fitView(fpOf(comp), maxSwing(comp));

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    const d = drag.current;
    if (ctx) draw(ctx, comp, viewNow(), mode, d?.type === 'corner' ? d.vertex : -1, selected, pick, shelf);
  });

  const pos = (e: React.PointerEvent): Vec2 => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * SIZE) / r.width, ((e.clientY - r.top) * SIZE) / r.height];
  };

  const vertexAt = (p: Vec2, v: View) =>
    fpOf(comp).findIndex((q) => {
      const [x, y] = toCanvas(v, q);
      return (x - p[0]) ** 2 + (y - p[1]) ** 2 < HIT * HIT;
    });

  /** Nearest wall to a plan point and where along it the point falls. */
  const wallAt = (planPt: Vec2, v: View) => {
    const frames = wallFrames(fpOf(comp), comp.wallThickness);
    let best: { frame: WallFrame; along: number; dist: number } | null = null;
    for (const f of frames) {
      const pr = project(f, comp.wallThickness, planPt);
      const inside = pr.along > -inToMm(6) && pr.along < f.length + inToMm(6);
      const dist = Math.abs(pr.out + comp.wallThickness / 2) * v.scale;
      if (inside && dist < 30 && (!best || dist < best.dist)) best = { frame: f, along: pr.along, dist };
    }
    return best;
  };

  const doorAt = (planPt: Vec2, v: View) => {
    const hit = wallAt(planPt, v);
    if (!hit) return null;
    const door = comp.doors.find(
      (d) =>
        pickable(pick, d.family) &&
        d.wall === hit.frame.edge &&
        hit.along >= d.offset - inToMm(4) &&
        hit.along <= d.offset + doorSize(d).width + inToMm(4),
    );
    return door ? { door, along: hit.along } : null;
  };

  return (
    <canvas
      ref={canvas}
      className="floor-plan"
      width={SIZE}
      height={SIZE}
      aria-label={
        mode === 'shape'
          ? 'Floor plan. Drag a corner to resize the compartment or its cut-out.'
          : 'Floor plan. Click a door to select it, drag it along its wall, or click another wall to move it there.'
      }
      onPointerDown={(e) => {
        const v = viewNow();
        const p = pos(e);
        if (mode === 'shelving') {
          const [px, py] = toPlan(v, ...p);
          const u = [...comp.accessories.shelving].reverse().find((x) => {
            const r = shelvingRect(x);
            return px >= r.minX && px <= r.maxX && py >= r.minY && py <= r.maxY;
          });
          if (!u) return;
          setUi({ selectedShelf: u.id });
          drag.current = { type: 'shelf', id: u.id, view: v, dx: px - u.x, dy: py - u.y };
        } else if (mode === 'shape') {
          const vi = vertexAt(p, v);
          if (vi < 0) return;
          const handle = pickHandle(comp, vi);
          if (!handle) return;
          drag.current = { type: 'corner', handle, view: v, vertex: vi };
        } else {
          const planPt = toPlan(v, ...p);
          const hit = doorAt(planPt, v);
          if (hit) {
            setUi({ selectedDoor: hit.door.id });
            drag.current = { type: 'door', id: hit.door.id, view: v, grab: hit.along - hit.door.offset };
          } else if (selected && comp.doors.some((x) => x.id === selected && pickable(pick, x.family))) {
            const w = wallAt(planPt, v);
            if (w) {
              const d = comp.doors.find((x) => x.id === selected);
              const W = d ? doorSize(d).width : 0;
              editCompartment((c) => moveDoor(c, selected, w.frame.edge, w.along - W / 2));
            }
            return;
          } else return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.style.cursor = 'grabbing';
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        const v = viewNow();
        if (!d) {
          if (mode === 'shelving') {
            const [px, py] = toPlan(v, ...pos(e));
            const over = comp.accessories.shelving.some((x) => {
              const r = shelvingRect(x);
              return px >= r.minX && px <= r.maxX && py >= r.minY && py <= r.maxY;
            });
            e.currentTarget.style.cursor = over ? 'grab' : 'default';
            return;
          }
          const hot = mode === 'shape' ? vertexAt(pos(e), v) >= 0 : !!doorAt(toPlan(v, ...pos(e)), v);
          const wall = mode === 'doors' && selected && !hot && wallAt(toPlan(v, ...pos(e)), v);
          e.currentTarget.style.cursor = hot ? 'grab' : wall ? 'copy' : 'crosshair';
          return;
        }
        const [px, py] = toPlan(d.view, ...pos(e));
        if (d.type === 'corner') {
          editCompartment((c) => dragHandle(c, d.handle, [px, py]), { transient: true });
        } else if (d.type === 'shelf') {
          const snap = (v: number) => Math.round(v / 25.4) * 25.4;
          editCompartment((c) => updateShelving(c, d.id, { x: snap(px - d.dx), y: snap(py - d.dy) }), { transient: true });
        } else {
          editCompartment(
            (c) => {
              const door = c.doors.find((x) => x.id === d.id);
              const f = door && wallFrames(fpOf(c), c.wallThickness)[door.wall];
              if (!door || !f) return c;
              // Slides toward the pointer and stops where it meets a neighbour.
              return slideDoor(c, d.id, project(f, c.wallThickness, [px, py]).along - d.grab);
            },
            { transient: true },
          );
        }
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        e.currentTarget.style.cursor = mode === 'shelving' ? 'default' : 'crosshair';
        commit();
      }}
    />
  );
}

export function ShapeThumb({ shape, nw, nd }: { shape: Compartment['shape']; nw: number; nd: number }) {
  const s = inToMm(150);
  const fp = footprint(shape, s, s, nw, nd);
  return (
    <svg viewBox={`${-s * 0.08} ${-s * 0.08} ${s * 1.16} ${s * 1.16}`} aria-hidden="true">
      <polygon points={fp.map((p) => p.join(',')).join(' ')} />
    </svg>
  );
}
