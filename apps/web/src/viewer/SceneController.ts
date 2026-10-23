/**
 * Owns the WebGL renderer, camera, lights and the current walk-in model.
 * React drives it through update()/set*() and never touches Three.js directly.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ComponentTree, Compartment, ExteriorFinish } from '@wic/core';
import { activeBrand } from '../theme/brands';
import { Materials } from './materials';
import { badgeTexture, decalTexture, loadImage, svgDataUrl, transparentLogoTexture, whiteLogo } from './textures';
import { type Built, buildMeshes, disposeTree } from './buildMeshes';

const MM = 0.001;

export interface Hover {
  label: string | null;
  problems: string[];
}
const DEFAULT_DIR = new THREE.Vector3(28, 22, 36).normalize();

export class SceneController {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
  private controls: OrbitControls;
  private key = new THREE.DirectionalLight(0xffffff, 2.2);
  private mats = new Materials();
  private model = new THREE.Group();
  private built: Built | null = null;
  private size = new THREE.Vector3(3.8, 2.5, 3.8);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hovered: THREE.Mesh | null = null;
  private hoveredMat: THREE.Mesh['material'] | null = null;
  private lightOrbit = false;
  private lightAngle = 0.9;
  private raf = 0;
  private resizeObs: ResizeObserver;
  private onHover: (hover: Hover | null, x: number, y: number) => void;
  private badgeKey: string | null = null;
  private decalKey: string | null = null;
  private decalTex: THREE.Texture | null = null;
  private finish: { finish: ExteriorFinish; color: string } = { finish: 'white', color: '#f0f0f0' };
  private axisCtx: CanvasRenderingContext2D | null;

  constructor(
    private host: HTMLElement,
    axisCanvas: HTMLCanvasElement | null,
    onHover: (hover: Hover | null, x: number, y: number) => void,
  ) {
    this.onHover = onHover;
    this.axisCtx = axisCanvas?.getContext('2d') ?? null;
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.renderer = r;
    host.prepend(r.domElement);

    const brand = activeBrand.scene;
    this.scene.background = new THREE.Color(brand.background);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb0b8c4, 1.1));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const k = this.key;
    k.castShadow = true;
    k.shadow.mapSize.set(2048, 2048);
    Object.assign(k.shadow.camera, { near: 0.5, far: 60, left: -15, right: 15, top: 15, bottom: -15 });
    k.shadow.bias = -0.0005;
    this.scene.add(k, k.target);
    const fill = new THREE.DirectionalLight(0xadd8e6, 0.5);
    fill.position.set(-8, 6, -6);
    this.scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: brand.ground, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(60, 60 / 0.3048 | 0, brand.grid, brand.grid);
    grid.position.y = 0.002;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    this.scene.add(grid);

    this.model.scale.setScalar(MM);
    this.scene.add(this.model);

    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.autoRotateSpeed = 1.2;

    r.domElement.addEventListener('pointermove', this.handlePointer);
    r.domElement.addEventListener('pointerleave', this.clearHover);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.placeKeyLight();
    this.resetView();
    this.loop();
  }

  update(tree: ComponentTree, c: Compartment, flags: Map<string, string[]>) {
    this.finish = { finish: c.finishes.exterior, color: c.finishes.exteriorColor };
    this.applyDecal(c);
    this.clearHover();
    const showDims = this.built?.dims.visible ?? true;
    if (this.built) {
      this.model.remove(this.built.root);
      disposeTree(this.built.root, this.keepSet());
    }
    this.built = buildMeshes(tree, this.mats, flags);
    this.built.dims.visible = showDims;
    this.model.add(this.built.root);
    this.size.set(tree.overall.width * MM, tree.overall.height * MM, tree.overall.depth * MM);
    this.placeKeyLight();
  }

  /** Brand logo for door badges (SVG markup or image URL); null shows a plain badge. */
  setLogo(logo: string | null) {
    if (logo === this.badgeKey) return;
    this.badgeKey = logo;
    if (!logo) {
      this.mats.setGlassLogo(null);
      return this.mats.setBadge(null);
    }
    const isSvg = logo.trim().startsWith('<');
    const src = isSvg ? svgDataUrl(logo) : logo;
    if (isSvg) {
      loadImage(svgDataUrl(whiteLogo(logo)))
        .then((img) => {
          if (this.badgeKey !== logo) return;
          this.mats.logoWhite.map?.dispose();
          this.mats.setGlassLogo(transparentLogoTexture(img));
        })
        .catch(() => this.mats.setGlassLogo(null));
    }
    loadImage(src)
      .then((img) => {
        if (this.badgeKey !== logo) return;
        this.mats.badgeFace.map?.dispose();
        this.mats.setBadge(badgeTexture(img));
      })
      .catch(() => this.mats.setBadge(null));
  }

  /** Default decal image when the configuration has no upload. */
  defaultDecal: string | null = null;

  private applyDecal(c: Compartment) {
    const d = c.finishes.decal;
    const useDecal = c.finishes.exterior === 'decal';
    const raw = d.image ?? this.defaultDecal;
    const src = raw && raw.trim().startsWith('<') ? svgDataUrl(raw) : raw;
    const key = useDecal && src ? `${src.length}:${src.slice(-64)}|${d.background}` : null;
    const place = (tex: THREE.Texture | null) => {
      if (tex) {
        // Wall UVs are millimetres along the wall, so one repeat = one tile.
        tex.repeat.set(1 / d.tile, 1 / d.tile);
        tex.rotation = (d.angle * Math.PI) / 180;
      }
      this.mats.setFinish(this.finish.finish, this.finish.color, tex);
    };
    if (key === this.decalKey) return place(this.decalTex);
    this.decalKey = key;
    if (!key || !src) {
      this.decalTex?.dispose();
      this.decalTex = null;
      return place(null);
    }
    place(this.decalTex); // keep the old tiles until the new ones load
    loadImage(src)
      .then((img) => {
        if (this.decalKey !== key) return;
        this.decalTex?.dispose();
        this.decalTex = decalTexture(img, d.background);
        place(this.decalTex);
      })
      .catch(() => place(null));
  }

  setDims(on: boolean) {
    if (this.built) this.built.dims.visible = on;
  }
  setWireframe(on: boolean) {
    this.mats.setWireframe(on);
  }
  setAutoRotate(on: boolean) {
    this.controls.autoRotate = on;
  }
  setLightOrbit(on: boolean) {
    this.lightOrbit = on;
    if (!on) this.placeKeyLight();
  }

  /** Frame the whole walk-in from the original three-quarter angle. */
  resetView() {
    const span = Math.max(this.size.x, this.size.z, this.size.y);
    const dist = span * 2.4 + 2.5;
    const target = new THREE.Vector3(0, this.size.y * 0.42, 0);
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(DEFAULT_DIR, dist);
    this.controls.update();
  }

  /** Point the camera at a world point (metres) from a direction. Used by ?debug renders. */
  look(target: [number, number, number], from: [number, number, number]) {
    this.controls.target.set(...target);
    this.camera.position.set(...from);
    this.controls.update();
  }

  screenshot() {
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `walk-in-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointer);
    this.renderer.domElement.removeEventListener('pointerleave', this.clearHover);
    this.controls.dispose();
    if (this.built) disposeTree(this.built.root, this.keepSet());
    this.decalTex?.dispose();
    this.mats.badgeFace.map?.dispose();
    this.mats.logoWhite.map?.dispose();
    this.mats.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── internals ──

  private keepSet() {
    return new Set<THREE.Material>(this.mats.shared());
  }

  private placeKeyLight() {
    const r = Math.max(this.size.x, this.size.z) * 1.4 + 4;
    this.key.position.set(Math.cos(this.lightAngle) * r, r * 1.1, Math.sin(this.lightAngle) * r);
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private handlePointer = (e: PointerEvent) => {
    if (e.buttons || !this.built) return this.clearHover();
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.built.pickable, false)[0];
    const mesh = (hit?.object as THREE.Mesh | undefined) ?? null;
    if (mesh !== this.hovered) {
      this.restoreHovered();
      if (mesh) {
        this.hovered = mesh;
        this.hoveredMat = mesh.material;
        mesh.material = this.mats.highlight;
      }
    }
    this.onHover(
      mesh ? { label: (mesh.userData.label as string | undefined) ?? null, problems: (mesh.userData.problems as string[] | undefined) ?? [] } : null,
      e.clientX - rect.left,
      e.clientY - rect.top,
    );
  };

  private clearHover = () => {
    this.restoreHovered();
    this.onHover(null, 0, 0);
  };

  private restoreHovered() {
    if (this.hovered && this.hoveredMat) this.hovered.material = this.hoveredMat;
    this.hovered = null;
    this.hoveredMat = null;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (this.lightOrbit) {
      this.lightAngle += 0.01;
      this.placeKeyLight();
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.drawAxes();
  };

  private drawAxes() {
    const ctx = this.axisCtx;
    if (!ctx) return;
    const s = ctx.canvas.width;
    const c = s / 2;
    ctx.clearRect(0, 0, s, s);
    const q = this.camera.quaternion.clone().invert();
    const axes: [THREE.Vector3, string, string][] = [
      [new THREE.Vector3(1, 0, 0), '#ef4444', 'X'],
      [new THREE.Vector3(0, 1, 0), '#22c55e', 'Y'],
      [new THREE.Vector3(0, 0, 1), '#3b82f6', 'Z'],
    ];
    const projected = axes
      .map(([v, col, l]) => ({ v: v.applyQuaternion(q), col, l }))
      .sort((a, b) => a.v.z - b.v.z);
    ctx.lineWidth = 3;
    ctx.font = '600 13px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const { v, col, l } of projected) {
      const x = c + v.x * s * 0.32;
      const y = c - v.y * s * 0.32;
      ctx.strokeStyle = col;
      ctx.globalAlpha = v.z < -0.2 ? 0.45 : 1;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(l, x, y + 1);
    }
    ctx.globalAlpha = 1;
  }
}
