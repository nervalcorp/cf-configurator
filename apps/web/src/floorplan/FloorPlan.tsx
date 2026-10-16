/**
 * 2D floor plan editor. Draws the footprint from core and drags vertices
 * through core's pickHandle/dragHandle, so the plan and the 3D view can never
 * disagree. The view scale is frozen while dragging so the shape doesn't
 * rescale under the pointer.
 */
import { useEffect, useRef } from 'react';
import {
  type Compartment,
  type DragHandle,
  type Vec2,
  dragHandle,
  edgeLength,
  edgeNormal,
  findDoorEdge,
  footprint,
  formatInches,
  inToMm,
  isClockwise,
  jointNumber,
  offsetPolygon,
  panelLetter,
  pickHandle,
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

/** Fit the footprint plus the door swing (which hangs off the front) into the canvas. */
function fitView(fp: Vec2[], swing: number): View {
  let maxX = 0;
  let maxY = 0;
  for (const [x, y] of fp) {
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const LABEL = 30;
  const scale = Math.min((SIZE - PAD * 2) / (maxX || 1), (SIZE - PAD * 2 - LABEL) / (maxY + swing || 1));
  const h = (maxY + swing) * scale + LABEL;
  return { scale, ox: (SIZE - maxX * scale) / 2, oy: (SIZE - h) / 2 };
}

const toCanvas = (v: View, [x, y]: Vec2): Vec2 => [v.ox + x * v.scale, v.oy + y * v.scale];
const toPlan = (v: View, cx: number, cy: number): Vec2 => [(cx - v.ox) / v.scale, (cy - v.oy) / v.scale];

function css(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function draw(ctx: CanvasRenderingContext2D, c: Compartment, view: View, active: number) {
  const fp = footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);
  const n = fp.length;
  const cw = isClockwise(fp);
  const door = findDoorEdge(fp);
  const line = css('--fp-line') || '#0891b2';
  const doorCol = css('--fp-door') || '#dd3333';
  const P = (p: Vec2) => toCanvas(view, p);

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = css('--fp-grid') || '#e8ecf0';
  ctx.lineWidth = 0.5;
  // 1 ft grid aligned to the shape's origin
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

  // Outline, hatch, inner face
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

  // Edge lengths outside, panel letters inside
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const a = fp[i];
    const b = fp[(i + 1) % n];
    const [nx, ny] = edgeNormal(a, b, cw);
    const [mx, my] = P([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
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

    ctx.font = '700 12px Outfit, sans-serif';
    ctx.fillStyle = line;
    if (i === door) {
      const span = Math.abs(b[0] - a[0]);
      ctx.fillText('A', mx - span * 0.28 * view.scale - nx * 22, my - ny * 22);
      ctx.fillText('B', mx + span * 0.28 * view.scale - nx * 22, my - ny * 22);
    } else {
      ctx.fillText(panelLetter(i, door, n), mx - nx * 22, my - ny * 22);
    }
  }

  // Door opening, leaf and swing
  {
    const a = fp[door];
    const b = fp[(door + 1) % n];
    const left = Math.min(a[0], b[0]) + c.wallThickness + c.door.offset;
    const right = left + c.door.width;
    const y = a[1];
    const [, ny] = edgeNormal(a, b, cw);
    const hingeRight = c.door.hinge === 'right';
    const hinge: Vec2 = [hingeRight ? right : left, y];
    const open: Vec2 = [hinge[0], y + ny * c.door.width];
    ctx.strokeStyle = doorCol;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(...P([left, y]));
    ctx.lineTo(...P([right, y]));
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(...P(hinge));
    ctx.lineTo(...P(open));
    ctx.stroke();
    const [hx, hy] = P(hinge);
    const r = c.door.width * view.scale;
    const outward = ny > 0 ? Math.PI / 2 : -Math.PI / 2;
    const closed = hingeRight ? Math.PI : 0;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(hx, hy, r, Math.min(closed, outward), Math.max(closed, outward));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = doorCol;
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '600 11px Outfit, sans-serif';
    const [dx, dy] = P([(left + right) / 2, y]);
    ctx.fillText(`${formatInches(c.door.width)} door`, dx, dy + ny * (r + 16));
  }

  // Vertex handles and joint numbers
  for (let i = 0; i < n; i++) {
    const [x, y] = P(fp[i]);
    ctx.fillStyle = i === active ? line : '#fff';
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, i === active ? 8 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // label on the outside diagonal
    const prev = fp[(i - 1 + n) % n];
    const next = fp[(i + 1) % n];
    const n1 = edgeNormal(prev, fp[i], cw);
    const n2 = edgeNormal(fp[i], next, cw);
    ctx.font = '600 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`J${jointNumber(i, fp, door)}`, x + (n1[0] + n2[0]) * 18, y + (n1[1] + n2[1]) * 18);
  }
}

export function FloorPlan() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const comp = useActiveCompartment();
  const editCompartment = useStore((s) => s.editCompartment);
  const commit = useStore((s) => s.commit);
  const drag = useRef<{ handle: DragHandle; view: View; vertex: number } | null>(null);

  const viewNow = () => {
    const d = drag.current;
    return d ? d.view : fitView(footprint(comp.shape, comp.boxW, comp.boxD, comp.notchW, comp.notchD), comp.door.width);
  };

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) draw(ctx, comp, viewNow(), drag.current?.vertex ?? -1);
  });

  const pos = (e: React.PointerEvent): Vec2 => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * SIZE) / r.width, ((e.clientY - r.top) * SIZE) / r.height];
  };

  const vertexAt = (p: Vec2, v: View) => {
    const fp = footprint(comp.shape, comp.boxW, comp.boxD, comp.notchW, comp.notchD);
    return fp.findIndex((q) => {
      const [x, y] = toCanvas(v, q);
      return (x - p[0]) ** 2 + (y - p[1]) ** 2 < HIT * HIT;
    });
  };

  return (
    <canvas
      ref={canvas}
      className="floor-plan"
      width={SIZE}
      height={SIZE}
      aria-label="Floor plan. Drag a corner to resize the compartment or its cut-out."
      onPointerDown={(e) => {
        const v = viewNow();
        const vi = vertexAt(pos(e), v);
        if (vi < 0) return;
        const handle = pickHandle(comp, vi);
        if (!handle) return;
        drag.current = { handle, view: v, vertex: vi };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.style.cursor = 'grabbing';
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) {
          e.currentTarget.style.cursor = vertexAt(pos(e), viewNow()) >= 0 ? 'grab' : 'crosshair';
          return;
        }
        const [px, py] = toPlan(d.view, ...pos(e));
        editCompartment((c) => dragHandle(c, d.handle, [px, py]), { transient: true });
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        e.currentTarget.style.cursor = 'crosshair';
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
