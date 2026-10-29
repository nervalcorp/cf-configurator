/**
 * Airflow particles: a light sketch of how a walk-in moves air, not a fluid
 * simulation. Each evaporator owns a few dozen particles that loop:
 *
 *   jet   out of the fans along the ceiling, slowing with drag and sagging as cold air does
 *   sink  down to the floor once the jet runs out of speed or meets a wall
 *   floor back along the floor toward the unit
 *   rise  up behind the unit into the coil, then out of the fans again
 *
 * Walls are the room's inside outline: a particle that would leave it stays put
 * and drops (air hitting a wall turns down). One THREE.Points for the whole site,
 * positions updated on the CPU each frame — a few hundred tiny steps, cheap.
 */
import * as THREE from 'three';

export interface AirUnit {
  /** Front centre of the fan face, plan mm (x right, z toward the front), compartment-centred. */
  front: [number, number];
  /** Unit vector the air blows, in plan. */
  into: [number, number];
  /** Along the unit's length, in plan. */
  along: [number, number];
  length: number;
  /** Fan centre height, floor top, and how far the jet can go before the far wall. */
  fanY: number;
  floorY: number;
  depth: number;
  gap: number;
}

export interface AirRoom {
  /** Compartment position on the site (mm). */
  offset: [number, number];
  /** Inside outline, compartment-centred plan mm. */
  inner: [number, number][];
  units: AirUnit[];
}

const PER_UNIT = 36;
const MAX = 320;
const MM = 0.001;

interface P {
  room: number;
  unit: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  phase: 0 | 1 | 2 | 3;
  age: number;
}

function inside(poly: [number, number][], x: number, z: number) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const COLD = new THREE.Color('#1fb6c9');
const WARM = new THREE.Color('#6f8597');
const SINKING = COLD.clone().lerp(WARM, 0.4);

export class Airflow {
  readonly points: THREE.Points;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.PointsMaterial;
  private parts: P[] = [];
  private rooms: AirRoom[] = [];
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({
      size: 0.12,
      map: dotTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  /** New rooms and units: rebuild the particle set (keeps it within MAX). */
  setRooms(rooms: AirRoom[]) {
    this.rooms = rooms;
    const units = rooms.flatMap((r, ri) => r.units.map((_, ui) => [ri, ui] as const));
    const per = units.length ? Math.max(8, Math.min(PER_UNIT, Math.floor(MAX / units.length))) : 0;
    this.parts = [];
    for (const [ri, ui] of units) {
      for (let k = 0; k < per; k++) {
        const p: P = { room: ri, unit: ui, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, phase: 0, age: 0 };
        this.spawn(p);
        // Stagger: fast-forward each particle a random amount so the loop is full at once.
        const steps = Math.floor(Math.random() * 300);
        for (let s = 0; s < steps; s++) this.step(p, 1 / 30);
        this.parts.push(p);
      }
    }
    this.geo.setDrawRange(0, this.parts.length);
    this.write();
  }

  private spawn(p: P) {
    const u = this.rooms[p.room].units[p.unit];
    const t = (Math.random() - 0.5) * u.length * 0.8;
    p.x = u.front[0] + u.along[0] * t;
    p.z = u.front[1] + u.along[1] * t;
    p.y = u.fanY + (Math.random() - 0.5) * 120;
    const v = 2000 + Math.random() * 600;
    const spread = (Math.random() - 0.5) * 0.35;
    p.vx = (u.into[0] + u.along[0] * spread) * v;
    p.vz = (u.into[1] + u.along[1] * spread) * v;
    p.vy = (Math.random() - 0.5) * 60;
    p.phase = 0;
    p.age = 0;
  }

  private step(p: P, dt: number) {
    const room = this.rooms[p.room];
    const u = room.units[p.unit];
    p.age += dt;
    if (p.age > 25) return this.spawn(p);
    switch (p.phase) {
      case 0: {
        // Jet: drag slows it, cold air sags.
        const drag = 1 - 0.55 * dt;
        p.vx *= drag;
        p.vz *= drag;
        p.vy -= 220 * dt;
        if (Math.hypot(p.vx, p.vz) < 450) p.phase = 1;
        break;
      }
      case 1:
        // Sink to the floor, drifting.
        p.vx *= 1 - 1.2 * dt;
        p.vz *= 1 - 1.2 * dt;
        p.vy = Math.max(p.vy - 900 * dt, -900);
        if (p.y <= u.floorY + 120) {
          p.phase = 2;
          p.vy = 0;
        }
        break;
      case 2: {
        // Back along the floor to just under the unit.
        const tx = u.front[0] - u.into[0] * (u.depth + u.gap * 0.5) - p.x;
        const tz = u.front[1] - u.into[1] * (u.depth + u.gap * 0.5) - p.z;
        const d = Math.hypot(tx, tz) || 1;
        p.vx += ((tx / d) * 900 - p.vx) * 2 * dt;
        p.vz += ((tz / d) * 900 - p.vz) * 2 * dt;
        p.y = u.floorY + 120;
        if (d < 450) p.phase = 3;
        break;
      }
      case 3:
        // Rise behind the unit into the coil.
        p.vx *= 1 - 3 * dt;
        p.vz *= 1 - 3 * dt;
        p.vy = Math.min(p.vy + 1400 * dt, 1000);
        if (p.y >= u.fanY) return this.spawn(p);
        break;
    }
    const nx = p.x + p.vx * dt;
    const nz = p.z + p.vz * dt;
    if (inside(room.inner, nx, nz)) {
      p.x = nx;
      p.z = nz;
    } else if (p.phase === 0) {
      // Hit a wall: the jet turns down.
      p.vx *= -0.2;
      p.vz *= -0.2;
      p.phase = 1;
    } else {
      p.vx = 0;
      p.vz = 0;
    }
    p.y += p.vy * dt;
  }

  private write() {
    this.parts.forEach((p, i) => {
      const room = this.rooms[p.room];
      this.pos[i * 3] = (room.offset[0] + p.x) * MM;
      this.pos[i * 3 + 1] = p.y * MM;
      this.pos[i * 3 + 2] = (room.offset[1] + p.z) * MM;
      const c = p.phase === 0 ? COLD : p.phase === 1 ? SINKING : WARM;
      this.col[i * 3] = c.r;
      this.col[i * 3 + 1] = c.g;
      this.col[i * 3 + 2] = c.b;
    });
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number) {
    if (!this.points.visible || !this.parts.length) return;
    const step = Math.min(dt, 1 / 20);
    for (const p of this.parts) this.step(p, step);
    this.write();
  }

  dispose() {
    this.geo.dispose();
    this.mat.map?.dispose();
    this.mat.dispose();
  }
}
