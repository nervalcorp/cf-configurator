import * as THREE from 'three';
import type { ExteriorFinish } from '@wic/core';

/** Surface feel per stock finish. Colour comes from the configuration. */
const FINISH_SURFACE: Record<ExteriorFinish, { roughness: number; metalness: number }> = {
  'stucco-aluminum': { roughness: 0.55, metalness: 0.15 },
  'stucco-galvanized': { roughness: 0.6, metalness: 0.2 },
  'stucco-stainless': { roughness: 0.45, metalness: 0.3 },
  stainless: { roughness: 0.25, metalness: 0.55 },
  white: { roughness: 0.4, metalness: 0.05 },
  custom: { roughness: 0.55, metalness: 0.15 },
};

export class Materials {
  exterior = new THREE.MeshStandardMaterial({ color: '#c4c8cc', roughness: 0.55, metalness: 0.15 });
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
  chrome = new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.2, metalness: 0.75 });
  highlight = new THREE.MeshStandardMaterial({ color: 0x14b8a6, roughness: 0.4, emissive: 0x0d9488, emissiveIntensity: 0.35 });
  edge = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.22 });
  dimLine = new THREE.LineBasicMaterial({ color: 0xdd3333 });

  setFinish(finish: ExteriorFinish, color: string) {
    const s = FINISH_SURFACE[finish];
    this.exterior.color.set(color);
    this.exterior.roughness = s.roughness;
    this.exterior.metalness = s.metalness;
    this.roof.color.set(color);
  }

  setWireframe(on: boolean) {
    for (const m of this.meshMaterials()) m.wireframe = on;
  }

  private meshMaterials() {
    return [this.exterior, this.roof, this.interior, this.floor, this.doorLeaf, this.frame, this.threshold, this.chrome, this.highlight];
  }

  dispose() {
    for (const m of this.meshMaterials()) m.dispose();
    this.edge.dispose();
    this.dimLine.dispose();
  }
}
