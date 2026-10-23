/**
 * Wall elevation for placing checker plate squares. Shows the wall's inside
 * run (left end seen from outside on the left), its door and glass openings,
 * the controller, and the 1-ft grid. Click or drag to paint squares on or off;
 * squares that would cover an opening or the controller are skipped.
 */
import { useEffect, useRef } from 'react';
import {
  CHECKER_PLATE,
  type CheckerSquare,
  type Compartment,
  checkerGrid,
  controlRect,
  doorTag,
  framesFor,
  paintSquares,
  squareBlocker,
  wallOpenings,
} from '@wic/core';
import { useStore } from '../store';

const W = 600;
const H = 300;
const PAD = 14;

export function CheckerPainter({ c, wall }: { c: Compartment; wall: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { editCompartment: edit, commit } = useStore.getState();
  const stroke = useRef<{ on: boolean; seen: Set<string> } | null>(null);
  const f = framesFor(c)[wall];
  const { cols, rows } = checkerGrid(c, wall);
  const S = CHECKER_PLATE.size;
  const len = f?.length ?? 1;
  const scale = Math.min((W - PAD * 2) / len, (H - PAD * 2) / c.height);
  const ox = (W - len * scale) / 2;
  const oy = (H + c.height * scale) / 2; // canvas y of the floor
  const X = (u: number) => ox + u * scale;
  const Y = (v: number) => oy - v * scale;

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !f) return;
    ctx.clearRect(0, 0, W, H);
    // Wall
    ctx.fillStyle = '#f4f6f8';
    ctx.fillRect(X(0), Y(c.height), len * scale, c.height * scale);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(X(0), Y(c.height), len * scale, c.height * scale);
    // Squares
    const on = new Set(c.accessories.checker.filter((q) => q.wall === wall).map((q) => `${q.col}:${q.row}`));
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const x = X(col * S);
        const y = Y((row + 1) * S);
        const s = S * scale;
        if (on.has(`${col}:${row}`)) {
          const bad = !!squareBlocker(c, { wall, col, row });
          ctx.fillStyle = bad ? 'rgba(225,29,72,0.45)' : '#b8bec4';
          ctx.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + s * 0.25, y + s * 0.75);
          ctx.lineTo(x + s * 0.75, y + s * 0.25);
          ctx.stroke();
        }
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 0.75;
        ctx.strokeRect(x, y, s, s);
      }
    }
    // Openings
    for (const o of wallOpenings(c, wall)) {
      ctx.fillStyle = 'rgba(30,41,59,0.75)';
      ctx.fillRect(X(o.from), Y(o.top), (o.to - o.from) * scale, (o.top - o.bottom) * scale);
      ctx.fillStyle = '#fff';
      ctx.font = '600 11px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(doorTag(c.doors, o.doorId), X((o.from + o.to) / 2), Y((o.bottom + o.top) / 2));
    }
    // Controller
    const ctl = controlRect(c);
    if (ctl && ctl.wall === wall) {
      ctx.fillStyle = '#0891b2';
      ctx.fillRect(X(ctl.from), Y(ctl.top), Math.max(3, (ctl.to - ctl.from) * scale), Math.max(3, (ctl.top - ctl.bottom) * scale));
    }
  });

  const cellAt = (e: React.PointerEvent): CheckerSquare | null => {
    const r = canvas.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) * W) / r.width;
    const py = ((e.clientY - r.top) * H) / r.height;
    const col = Math.floor((px - ox) / scale / S);
    const row = Math.floor((oy - py) / scale / S);
    return col >= 0 && row >= 0 && col < cols && row < rows ? { wall, col, row } : null;
  };

  const paint = (q: CheckerSquare) => {
    const s = stroke.current;
    if (!s) return;
    const k = `${q.col}:${q.row}`;
    if (s.seen.has(k)) return;
    s.seen.add(k);
    edit((x) => paintSquares(x, [q], s.on), { transient: true });
  };

  if (!f) return null;
  return (
    <canvas
      ref={canvas}
      className="wall-painter"
      width={W}
      height={H}
      aria-label={`Wall ${f.letter} elevation. Click or drag to add or remove 1 foot checker plate squares.`}
      onPointerDown={(e) => {
        const q = cellAt(e);
        if (!q) return;
        const has = c.accessories.checker.some((x) => x.wall === wall && x.col === q.col && x.row === q.row);
        stroke.current = { on: !has, seen: new Set() };
        e.currentTarget.setPointerCapture(e.pointerId);
        paint(q);
      }}
      onPointerMove={(e) => {
        if (!stroke.current) return;
        const q = cellAt(e);
        if (q) paint(q);
      }}
      onPointerUp={(e) => {
        if (!stroke.current) return;
        stroke.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        commit();
      }}
    />
  );
}
