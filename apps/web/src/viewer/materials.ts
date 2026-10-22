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
  dimLine = new THREE.LineBasicMaterial({ color: 0xdd3333 });

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

  setBadge(tex: THREE.Texture | null) {
    this.badgeFace.map = tex;
    this.badgeFace.color.set(tex ? '#ffffff' : '#283442');
    this.badgeFace.needsUpdate = true;
  }

  setWireframe(on: boolean) {
    for (const m of this.meshMaterials()) m.wireframe = on;
  }

  private meshMaterials() {
    return [this.exterior, this.exteriorPlain, this.badgeBody, this.badgeFace, this.roof, this.interior, this.floor, this.doorLeaf, this.frame, this.threshold, this.chrome, this.glass, this.track, this.curtain, this.highlight];
  }

  /** Materials shared across rebuilds; per-part colour clones are disposed with the model. */
  shared(): THREE.Material[] {
    return [...this.meshMaterials(), this.edge, this.dimLine, this.flag];
  }

  dispose() {
    for (const m of this.meshMaterials()) m.dispose();
    this.edge.dispose();
    this.dimLine.dispose();
    this.flag.dispose();
  }
}
