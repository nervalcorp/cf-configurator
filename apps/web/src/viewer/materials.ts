import * as THREE from 'three';
import type { ExteriorFinish } from '@wic/core';

/** Surface feel per stock finish. Colour comes from the configuration. */
const FINISH_SURFACE: Record<ExteriorFinish, { roughness: number; metalness: number }> = {
  white: { roughness: 0.4, metalness: 0.05 },
  'grey-white': { roughness: 0.42, metalness: 0.05 },
  decal: { roughness: 0.45, metalness: 0.05 },
  custom: { roughness: 0.45, metalness: 0.05 },
};

export class Materials {
  /** Outside face of the wall panels; carries the decal map when that finish is chosen. */
  exterior = new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.45, metalness: 0.05 });
  /** Outside faces of corner posts: the finish colour (decal background) without the map. */
  exteriorPlain = new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.45, metalness: 0.05 });
  badgeBody = new THREE.MeshStandardMaterial({ color: '#283442', roughness: 0.5 });
  /** Logo face of the door badge; falls back to plain navy until the logo loads. */
  badgeFace = new THREE.MeshStandardMaterial({ color: '#283442', roughness: 0.4 });
  /** White logo printed on glass (transparent background). */
  logoWhite = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  /** Glass display door panes: clear with a cool tint. */
  displayGlass = new THREE.MeshStandardMaterial({ color: 0xaeb7be, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.5 });
  /** Aluminum checker plate; texture is mapped in wall coordinates. */
  checker = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.45 });
  /** Controller faces (glossy black glass). */
  screenTSC = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.1 });
  screenTC = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.05 });
  /** Controller cable and gland. */
  cable = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6 });
  /** Shelving: powder-coated black steel, wire shelves (mesh texture with cut-outs), clear price tag strips. */
  shelfSteel = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.55, metalness: 0.25 });
  wireShelf = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.2, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
  priceTag = new THREE.MeshStandardMaterial({ color: 0xe8f0f4, roughness: 0.2, transparent: true, opacity: 0.55 });
  /** Evaporator: brushed stainless housing, black fan guards, dark coil, and the throw zone. */
  evapHousing = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.35, metalness: 0.5 });
  fanGuard = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.55, metalness: 0.2 });
  coil = new THREE.MeshStandardMaterial({ color: 0x6b7177, roughness: 0.7, metalness: 0.4 });
  throwZone = new THREE.MeshBasicMaterial({ color: 0x14b8c8, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  throwOver = new THREE.MeshBasicMaterial({ color: 0xe11d48, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  /** Throw zone under the pointer: the same colour, a little stronger, still see-through. */
  throwHover = new THREE.MeshBasicMaterial({ color: 0x14b8c8, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });

  /** Throw zone opacity (0-1); hover adds a little, capped so it stays see-through. */
  setThrowOpacity(o: number) {
    this.throwZone.opacity = o;
    this.throwOver.opacity = Math.min(0.8, o + 0.02);
    this.throwHover.opacity = Math.min(0.75, o + 0.18);
  }
  /** Floor glow under the compartment being edited. */
  glow = new THREE.MeshBasicMaterial({ color: 0x14b8c8, transparent: true, opacity: 0.55, depthWrite: false });
  glowSoft = new THREE.MeshBasicMaterial({ color: 0x14b8c8, transparent: true, opacity: 0.16, depthWrite: false });
  /** Red tint over parts with a problem. */
  flag = new THREE.MeshBasicMaterial({
    color: 0xff1a1a,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  roof = new THREE.MeshStandardMaterial({
    color: '#c4c8cc',
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  interior = new THREE.MeshStandardMaterial({ color: 0xf5f3eb, roughness: 0.4, metalness: 0.05 });
  floor = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.7, metalness: 0.1 });
  doorLeaf = new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.35, metalness: 0.05 });
  frame = new THREE.MeshStandardMaterial({ color: 0xe8e8e6, roughness: 0.4, metalness: 0.08 });
  threshold = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  // No environment map, so metals stay low-metalness and light to read as polished chrome.
  chrome = new THREE.MeshStandardMaterial({ color: 0xc4cad0, roughness: 0.25, metalness: 0.5 });
  glass = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.05, metalness: 0.05, transparent: true, opacity: 0.55 });
  track = new THREE.MeshStandardMaterial({ color: 0xbfc4c9, roughness: 0.3, metalness: 0.4 });
  curtain = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.55, metalness: 0.35 });
  highlight = new THREE.MeshStandardMaterial({ color: 0x14b8a6, roughness: 0.4, emissive: 0x0d9488, emissiveIntensity: 0.35 });
  edge = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.22 });
  dimLine = new THREE.LineBasicMaterial({ color: 0x0e9aa7 });
  /** Recessed floors: concrete slab. */
  concrete = new THREE.MeshStandardMaterial({ color: 0x7d8185, roughness: 0.95, metalness: 0 });
  /** Ramp body (polished aluminium) and its grit strips. */
  rampBody = new THREE.MeshStandardMaterial({ color: 0xcfd3d7, roughness: 0.3, metalness: 0.45 });
  rampGrit = new THREE.MeshStandardMaterial({ color: 0x9a9ea2, roughness: 0.95, metalness: 0.1 });
  rampSlot = new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.7 });

  /** Colour of the outside; with a decal map the panel colour stays white so the map shows true. */
  setFinish(finish: ExteriorFinish, color: string, decal: THREE.Texture | null) {
    const s = FINISH_SURFACE[finish];
    for (const m of [this.exterior, this.exteriorPlain]) {
      m.roughness = s.roughness;
      m.metalness = s.metalness;
    }
    this.exteriorPlain.color.set(color);
    this.roof.color.set(color);
    if (this.exterior.map !== decal) {
      this.exterior.map = decal;
      this.exterior.needsUpdate = true;
    }
    this.exterior.color.set(decal ? '#ffffff' : color);
  }

  setGlassLogo(tex: THREE.Texture | null) {
    this.logoWhite.map = tex;
    this.logoWhite.opacity = tex ? 0.95 : 0;
    this.logoWhite.needsUpdate = true;
  }

  setBadge(tex: THREE.Texture | null) {
    this.badgeFace.map = tex;
    this.badgeFace.color.set(tex ? '#ffffff' : '#283442');
    this.badgeFace.needsUpdate = true;
  }

  setWireframe(on: boolean) {
    for (const m of this.meshMaterials()) m.wireframe = on;
  }

  private meshMaterials() {
    return [this.exterior, this.exteriorPlain, this.badgeBody, this.badgeFace, this.logoWhite, this.displayGlass, this.checker, this.screenTSC, this.screenTC, this.cable, this.concrete, this.rampBody, this.rampGrit, this.rampSlot, this.shelfSteel, this.wireShelf, this.priceTag, this.evapHousing, this.fanGuard, this.coil, this.roof, this.interior, this.floor, this.doorLeaf, this.frame, this.threshold, this.chrome, this.glass, this.track, this.curtain, this.highlight];
  }

  /** Materials shared across rebuilds; per-part colour clones are disposed with the model. */
  shared(): THREE.Material[] {
    return [...this.meshMaterials(), this.edge, this.dimLine, this.flag, this.glow, this.glowSoft, this.throwZone, this.throwOver, this.throwHover];
  }

  dispose() {
    for (const m of this.meshMaterials()) m.dispose();
    this.edge.dispose();
    this.dimLine.dispose();
    this.flag.dispose();
    this.throwZone.dispose();
    this.throwOver.dispose();
    this.throwHover.dispose();
  }
}

/**
 * The outside finish of one compartment. Compartments can have different
 * finishes, so each gets its own wall, corner and roof materials.
 */
export class Skin {
  exterior = new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.45, metalness: 0.05 });
  exteriorPlain = new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.45, metalness: 0.05 });
  roof = new THREE.MeshStandardMaterial({ color: '#f0f0f0', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  decalKey: string | null = null;
  decalTex: THREE.Texture | null = null;

  setFinish(finish: ExteriorFinish, color: string, decal: THREE.Texture | null) {
    const s = FINISH_SURFACE[finish];
    for (const m of [this.exterior, this.exteriorPlain]) {
      m.roughness = s.roughness;
      m.metalness = s.metalness;
    }
    this.exteriorPlain.color.set(color);
    this.roof.color.set(color);
    if (this.exterior.map !== decal) {
      this.exterior.map = decal;
      this.exterior.needsUpdate = true;
    }
    this.exterior.color.set(decal ? '#ffffff' : color);
  }

  materials(): THREE.Material[] {
    return [this.exterior, this.exteriorPlain, this.roof];
  }

  dispose() {
    this.decalTex?.dispose();
    for (const m of this.materials()) m.dispose();
  }
}
