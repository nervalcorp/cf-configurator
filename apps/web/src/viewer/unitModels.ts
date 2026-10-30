/**
 * Condensing and packaged units, low-poly, built from ICC's drawing sizes
 * (passed in inches) and styled after the product renders: off-white powder
 * coat, chrome fan guards over grey-green blades (outdoor), black guards
 * (indoor), copper coil ends, louvred panels and the ICC badge. Detail comes
 * from small procedural textures rather than geometry.
 *
 * Three families:
 *   CU-INDOOR   open frame on a base plate: coil block with fan(s), compressor,
 *               receiver, electrical box (SUIC / SUIF)
 *   CU-OUTDOOR  slim cabinet on feet: fan panel (1 fan, or 2 stacked), service
 *               door with handle and badge, louvred end, pipe stubs (SUOC / SUOF)
 *   PACKAGED    roof cabinet (louvred condenser section + evaporator section with
 *               latches, handle, lifting lugs, side brackets) and the plug through
 *               the ceiling, with a fan guard and discharge grille underneath (MBIC / MBIF)
 */
import * as THREE from 'three';

const IN = 25.4;

export interface UnitModel {
  object: THREE.Object3D;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

// ── Shared materials and textures ──

let badge: THREE.Material | null = null;
/** The scene's ICC badge material (its texture follows the brand logo). */
export function setUnitBadge(m: THREE.Material) {
  badge = m;
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Fan guard seen from the front: blades, hub, concentric wire rings and spokes. */
function fanGuardTexture(style: 'chrome' | 'black') {
  return canvasTexture(512, 512, (g) => {
    const c = 256;
    g.fillStyle = style === 'chrome' ? '#2c312c' : '#151617';
    g.beginPath();
    g.arc(c, c, 250, 0, Math.PI * 2);
    g.fill();
    // blades
    g.fillStyle = style === 'chrome' ? '#8b9682' : '#2b2e31';
    for (let k = 0; k < 5; k++) {
      g.save();
      g.translate(c, c);
      g.rotate((k * Math.PI * 2) / 5);
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(60, -40, 200, -90, 225, -10);
      g.bezierCurveTo(200, 30, 90, 40, 0, 0);
      g.fill();
      g.restore();
    }
    // hub
    g.fillStyle = style === 'chrome' ? '#cfd3cf' : '#26292c';
    g.beginPath();
    g.roundRect(c - 52, c - 52, 104, 104, 26);
    g.fill();
    // wire rings and spokes
    g.strokeStyle = style === 'chrome' ? 'rgba(232,235,238,0.95)' : 'rgba(20,20,22,1)';
    g.lineWidth = 4;
    for (let r = 70; r <= 246; r += 22) {
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.lineWidth = 7;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + 0.2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * 60, c + Math.sin(a) * 60);
      g.lineTo(c + Math.cos(a) * 248, c + Math.sin(a) * 248);
      g.stroke();
    }
  });
}

/** Rows of rounded louvre slots, tiling. */
function louvreTexture() {
  return canvasTexture(
    128,
    128,
    (g) => {
      g.fillStyle = '#e6e8ea';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#5d6369';
      for (let y = 10; y < 128; y += 32) {
        g.beginPath();
        g.roundRect(14, y, 100, 12, 6);
        g.fill();
      }
    },
    true,
  );
}

/** Copper hairpin tube ends over aluminium fins, tiling vertically. */
function coilTexture() {
  return canvasTexture(
    128,
    128,
    (g) => {
      g.fillStyle = '#c9ccce';
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(120,125,130,0.5)';
      g.lineWidth = 1;
      for (let x = 0; x < 128; x += 4) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, 128);
        g.stroke();
      }
      g.strokeStyle = '#b87333';
      g.lineWidth = 9;
      for (const y of [32, 96]) {
        g.beginPath();
        g.arc(64, y, 22, Math.PI * 0.5, Math.PI * 1.5, true);
        g.stroke();
      }
    },
    true,
  );
}

/** Discharge grille: thin horizontal slats. */
function grilleTexture() {
  return canvasTexture(
    64,
    64,
    (g) => {
      g.fillStyle = '#d6d9dc';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#4a4f55';
      for (let y = 4; y < 64; y += 10) g.fillRect(4, y, 56, 4);
    },
    true,
  );
}

let tex: { chrome: THREE.Texture; black: THREE.Texture; louvre: THREE.Texture; coil: THREE.Texture; grille: THREE.Texture } | null = null;
const textures = () =>
  (tex ??= { chrome: fanGuardTexture('chrome'), black: fanGuardTexture('black'), louvre: louvreTexture(), coil: coilTexture(), grille: grilleTexture() });

const STD = (color: number, rough = 0.45, metal = 0.2) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

// ── Small builders ──

class Kit {
  root = new THREE.Group();
  geometries: THREE.BufferGeometry[] = [];
  materials: THREE.Material[] = [];

  mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material | THREE.Material[]) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    this.geometries.push(g);
    const mesh = new THREE.Mesh(g, m);
    this.root.add(mesh);
    return mesh;
  }

  cyl(r: number, h: number, x: number, y: number, z: number, m: THREE.Material, axis: 'x' | 'y' | 'z' = 'y', seg = 20) {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    this.geometries.push(g);
    this.root.add(new THREE.Mesh(g, m));
  }

  /** A fan guard facing +z (or another axis via rotation): textured disc plus a wire rim. */
  fan(r: number, x: number, y: number, z: number, face: THREE.Material, rim: THREE.Material, facing: 'z' | 'down' = 'z') {
    const disc = new THREE.CircleGeometry(r, 40);
    const ring = new THREE.TorusGeometry(r, Math.max(3, r * 0.035), 6, 40);
    if (facing === 'down') {
      disc.rotateX(Math.PI / 2);
      ring.rotateX(Math.PI / 2);
    }
    disc.translate(x, y, z);
    ring.translate(x, y, z);
    this.geometries.push(disc, ring);
    this.root.add(new THREE.Mesh(disc, face), new THREE.Mesh(ring, rim));
  }

  /** A face-only panel (plane) facing +z, or ±x / -y. */
  panel(w: number, h: number, x: number, y: number, z: number, m: THREE.Material, facing: 'z' | '-x' | 'x' | 'down' = 'z') {
    const g = new THREE.PlaneGeometry(w, h);
    if (facing === '-x') g.rotateY(-Math.PI / 2);
    if (facing === 'x') g.rotateY(Math.PI / 2);
    if (facing === 'down') g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    this.geometries.push(g);
    this.root.add(new THREE.Mesh(g, m));
  }

  badge(x: number, y: number, z: number, size = 5 * IN) {
    const side = this.mat(STD(0x1f2a33));
    const face = badge ?? side;
    this.box(size * 0.9, size, 3, x, y, z, [side, side, side, side, face, side]);
  }

  done(): UnitModel {
    this.root.traverse((o) => {
      o.castShadow = true;
      o.userData.shared = true;
    });
    return { object: this.root, geometries: this.geometries, materials: this.materials };
  }
}

const WHITE = 0xeceeef;

/**
 * Indoor open-frame unit (SUIC / SUIF). Origin: bottom centre of the base plate.
 * Local +z: the fan face. Sizes in inches.
 */
export function buildIndoorUnit(p: Record<string, number>): UnitModel {
  const k = new Kit();
  const t = textures();
  const W = p.w * IN;
  const D = p.d * IN;
  const H = p.h * IN;
  const B = p.base * IN;
  const white = k.mat(STD(WHITE, 0.5, 0.1));
  const plate = k.mat(STD(0xe2e5e7, 0.55, 0.15));
  const dark = k.mat(STD(0x3d4247, 0.5, 0.3));
  const grey = k.mat(STD(0x8a9096, 0.5, 0.3));
  const copper = k.mat(STD(0xb87333, 0.35, 0.7));
  const coil = k.mat(new THREE.MeshStandardMaterial({ map: t.coil, roughness: 0.5, metalness: 0.3 }));
  const guard = k.mat(new THREE.MeshStandardMaterial({ map: t.black, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }));
  const rim = k.mat(STD(0x151617, 0.5, 0.3));

  // Base plate
  k.box(W, B, D, 0, B / 2, 0, plate);
  // Coil block across the back, coil ends on both sides
  const cw = W * 0.94;
  const cd = D * 0.2;
  const ch = H - B - 12;
  const cz = -D / 2 + cd / 2 + 12;
  k.box(cw, ch, cd, 0, B + ch / 2, cz, [coil, coil, white, white, white, white]);
  k.badge(0, B + ch * 0.6, cz - cd / 2 - 2);
  // Fan(s) on the coil's front face
  const fans = Math.max(1, p.fans);
  const r = Math.min(ch * 0.42, (cw / fans) * 0.42);
  for (let i = 0; i < fans; i++) {
    const x = -cw / 2 + (cw / fans) * (i + 0.5);
    k.fan(r, x, B + ch * 0.55, cz + cd / 2 + 4, guard, rim);
  }
  // Compressor (dome), receiver, electrical box, a couple of copper lines
  const cr = Math.min(D * 0.12, W * 0.12);
  const chh = (H - B) * 0.42;
  const czc = D * 0.12;
  k.cyl(cr, chh, 0, B + chh / 2, czc, dark);
  const dome = new THREE.SphereGeometry(cr, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.translate(0, B + chh, czc);
  k.geometries.push(dome);
  k.root.add(new THREE.Mesh(dome, dark));
  const rr = cr * 0.55;
  k.cyl(rr, (H - B) * 0.5, -W * 0.34, B + (H - B) * 0.25, D * 0.22, grey);
  k.box(W * 0.17, (H - B) * 0.45, D * 0.16, W * 0.36, B + (H - B) * 0.225, D * 0.3, grey);
  k.cyl(8, W * 0.3, -W * 0.17, B + chh * 0.85, czc, copper, 'x', 10);
  k.cyl(8, (H - B) * 0.35, cr * 1.2, B + chh + (H - B) * 0.12, czc - cd * 0.4, copper, 'y', 10);
  return k.done();
}

/**
 * Outdoor slim cabinet (SUOC / SUOF). Origin: on the ground at the centre.
 * Local +z: the fan face. Sizes in inches.
 */
export function buildOutdoorUnit(p: Record<string, number>): UnitModel {
  const k = new Kit();
  const t = textures();
  const W = p.w * IN;
  const D = p.d * IN;
  const H = p.h * IN;
  const F = p.base * IN;
  const FD = (p.feetD || p.d) * IN;
  const BH = H - F;
  const white = k.mat(STD(WHITE, 0.45, 0.1));
  const recess = k.mat(STD(0xe1e4e6, 0.5, 0.1));
  const dark = k.mat(STD(0x3a3f44, 0.6, 0.3));
  const knob = k.mat(STD(0x141516, 0.4, 0.3));
  const copper = k.mat(STD(0xb87333, 0.35, 0.7));
  const louvre = k.mat(new THREE.MeshStandardMaterial({ map: t.louvre.clone(), roughness: 0.5, metalness: 0.1 }));
  (louvre.map as THREE.Texture).repeat.set(Math.max(1, Math.round(D / 120)), Math.max(2, Math.round(BH / 45)));
  (louvre.map as THREE.Texture).needsUpdate = true;
  const guard = k.mat(new THREE.MeshStandardMaterial({ map: t.chrome, roughness: 0.4, metalness: 0.4, side: THREE.DoubleSide }));
  const rim = k.mat(STD(0xd9dde0, 0.25, 0.8));

  const y0 = F;
  // Body and lid
  k.box(W, BH, D, 0, y0 + BH / 2, 0, white);
  k.box(W + 12, 14, D + 12, 0, y0 + BH + 7, 0, white);
  // Fan panel (left ~58%) and service door (right)
  const fw = W * 0.56;
  const fx = -W / 2 + W * 0.035 + fw / 2;
  k.box(fw, BH * 0.9, 6, fx, y0 + BH / 2, D / 2 + 3, recess);
  const stack = p.stack === 1 && p.fans > 1;
  if (stack) {
    const r = Math.min(fw * 0.4, BH * 0.22);
    for (const dy of [0.26, -0.24]) k.fan(r, fx, y0 + BH / 2 + BH * dy, D / 2 + 10, guard, rim);
  } else {
    const r = Math.min(fw * 0.42, BH * 0.4);
    k.fan(r, fx, y0 + BH / 2, D / 2 + 10, guard, rim);
  }
  const dw = W - fw - W * 0.09;
  const dx = W / 2 - W * 0.035 - dw / 2;
  k.box(dw, BH * 0.9, 8, dx, y0 + BH / 2, D / 2 + 4, white);
  k.cyl(14, 30, dx - dw / 2 + 40, y0 + BH * 0.5, D / 2 + 20, knob, 'z', 12);
  k.badge(dx, y0 + BH * 0.62, D / 2 + 9, Math.min(5.5 * IN, dw * 0.45));
  // Louvred end, pipe stubs on the other end
  k.panel(D * 0.86, BH * 0.86, -W / 2 - 1, y0 + BH / 2, 0, louvre, '-x');
  for (const dz of [-0.08, 0.08]) k.cyl(9, 60, W / 2 + 30, y0 + BH * 0.22, D * dz, copper, 'x', 10);
  // Feet: dark channels across the depth at each end
  for (const s of [-1, 1]) k.box(2.4 * IN, F, FD, s * (W / 2 - 3.5 * IN), F / 2, 0, dark);
  return k.done();
}

/**
 * Packaged (monoblock) roof unit (MBIC / MBIF). Origin: the plug's centre on the
 * roof surface. Local +z: the way air leaves the plug (into the room). The
 * cabinet sits on the roof; the plug passes through the ceiling and shows a fan
 * guard and discharge grille on its underside. Sizes in inches.
 */
export function buildPackagedUnit(p: Record<string, number>): UnitModel {
  const k = new Kit();
  const t = textures();
  const W = p.w * IN;
  const D = p.d * IN;
  const H = p.h * IN;
  const BD = p.bracketD * IN;
  const PW = p.plugW * IN;
  const PD = p.plugD * IN;
  const ceiling = p.ceiling * IN;
  const PH = Math.max(p.plugH * IN, ceiling + 8);
  const CW = p.condW * IN;
  // Cabinet centre sits opposite the plug's offset (see packagedCabinet in the core).
  const cx = -p.plugX * IN;
  const white = k.mat(STD(WHITE, 0.4, 0.15));
  const steel = k.mat(STD(0xd7dadd, 0.3, 0.6));
  const dark = k.mat(STD(0x4a4f55, 0.5, 0.3));
  const louvre = k.mat(new THREE.MeshStandardMaterial({ map: t.louvre.clone(), roughness: 0.5, metalness: 0.1 }));
  (louvre.map as THREE.Texture).repeat.set(2, Math.max(4, Math.round(H / 45)));
  (louvre.map as THREE.Texture).needsUpdate = true;
  const grille = k.mat(new THREE.MeshStandardMaterial({ map: t.grille.clone(), roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }));
  (grille.map as THREE.Texture).repeat.set(Math.max(4, Math.round(PW / 60)), 1);
  (grille.map as THREE.Texture).needsUpdate = true;
  const guard = k.mat(new THREE.MeshStandardMaterial({ map: t.black, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }));
  const rim = k.mat(STD(0x151617, 0.5, 0.3));

  // Condenser (louvred) and evaporator sections
  const left = p.condLeft === 1;
  const condX = cx + (left ? -W / 2 + CW / 2 : W / 2 - CW / 2);
  const evapW = W - CW;
  const evapX = cx + (left ? W / 2 - evapW / 2 : -W / 2 + evapW / 2);
  k.box(CW, H * 0.96, D, condX, (H * 0.96) / 2, 0, white);
  k.panel(CW * 0.7, H * 0.6, condX, H * 0.48, D / 2 + 1, louvre);
  k.panel(D * 0.6, H * 0.6, condX + (left ? -CW / 2 - 1 : CW / 2 + 1), H * 0.48, 0, louvre, left ? '-x' : 'x');
  k.box(evapW, H, D, evapX, H / 2, 0, white);
  k.box(evapW + 6, 14, D + 6, evapX, H + 7, 0, white); // lid
  // Latches, handle bar, badge on the evaporator section's front
  for (const s of [-0.38, 0.38]) k.box(36, 60, 10, evapX + evapW * s, H - 40, D / 2 + 5, steel);
  k.box(evapW * 0.45, 22, 26, evapX, H * 0.1, D / 2 + 13, steel);
  k.badge(evapX, H * 0.55, D / 2 + 2, Math.min(6 * IN, evapW * 0.25));
  // Lifting lugs on top of the condenser section
  for (const s of [-0.25, 0.25]) {
    const lug = new THREE.TorusGeometry(16, 5, 6, 14);
    lug.translate(condX + CW * s, H * 0.96 + 16, 0);
    k.geometries.push(lug);
    k.root.add(new THREE.Mesh(lug, steel));
  }
  // Side brackets (flanges reaching to the bracket depth)
  for (const s of [-1, 1]) k.box(evapW * 0.5, 10, (BD - D) / 2 + 20, evapX, 5, s * (D / 2 + (BD - D) / 4), dark);
  // Plug through the ceiling, fan guard and discharge grille on its underside
  k.box(PW, PH, PD, 0, -PH / 2, 0, steel);
  const r = Math.min(PW, PD) * 0.3;
  k.fan(r, -PW * 0.12, -PH - 1, -PD * 0.08, guard, rim, 'down');
  k.panel(PW * 0.9, PD * 0.22, 0, -PH - 1, PD / 2 - PD * 0.14, grille, 'down');
  return k.done();
}
