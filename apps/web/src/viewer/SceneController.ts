/**
 * Owns the WebGL renderer, camera, lights and the current walk-in model.
 * React drives it through update()/set*() and never touches Three.js directly.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { type ComponentTree, type Compartment, type ExteriorFinish, offsetPolygon } from '@wic/core';
import { activeBrand } from '../theme/brands';
import { Materials, Skin } from './materials';
import { withDpi } from './png';
import { badgeTexture, checkerTexture, wireShelfTexture, decalTexture, loadImage, svgDataUrl, tc1000Face, transparentLogoTexture, tsc2000Face, whiteLogo } from './textures';
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
  private camera = new THREE.PerspectiveCamera(40, 1, 0.02, 200);
  private controls: OrbitControls;
  private key = new THREE.DirectionalLight(0xffffff, 2.2);
  private mats = new Materials();
  private model = new THREE.Group();
  private envMap: THREE.Texture;
  /** One built group per compartment, keyed by compartment id. */
  private built = new Map<string, Built & { group: THREE.Group }>();
  private skins = new Map<string, Skin>();
  private showDims = true;
  private center = new THREE.Vector3();
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
    // A soft studio room for reflections, so polished stainless and chrome read as metal.
    // Kept low so painted and powder-coated surfaces look as before.
    const pmrem = new THREE.PMREMGenerator(r);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.35;
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
    this.mats.checker.map = checkerTexture();
    this.mats.wireShelf.map = wireShelfTexture();
    this.paintScreens(null);
    this.scene.add(this.model);

    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.3; // close enough to inspect small accessories
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

  /**
   * Rebuild every compartment. Each entry is drawn at its site position with
   * its own outside finish; flagged parts get the red overlay.
   */
  update(entries: { tree: ComponentTree; comp: Compartment; flags: Map<string, string[]> }[], activeId?: string) {
    this.clearHover();
    const keep = this.keepSet();
    for (const [id, b] of this.built) {
      this.model.remove(b.group);
      disposeTree(b.group, keep);
      this.built.delete(id);
    }
    for (const [id, skin] of this.skins) {
      if (!entries.some((e) => e.comp.id === id)) {
        skin.dispose();
        this.skins.delete(id);
      }
    }
    const many = entries.length > 1;
    const box = new THREE.Box3();
    for (const { tree, comp, flags } of entries) {
      let skin = this.skins.get(comp.id);
      if (!skin) {
        skin = new Skin();
        this.skins.set(comp.id, skin);
      }
      this.applyDecal(comp, skin);
      const built = buildMeshes(tree, this.mats, skin, flags);
      built.dims.visible = this.showDims;
      const group = new THREE.Group();
      group.position.set(comp.position.x, 0, comp.position.z);
      group.add(built.root);
      if (many && comp.id === activeId) group.add(this.floorGlow(tree));
      if (many) {
        group.traverse((o) => {
          if (o.userData.label) o.userData.label = `${comp.name} · ${o.userData.label}`;
        });
      }
      this.model.add(group);
      this.built.set(comp.id, { ...built, group });
      const { width, depth, height } = tree.overall;
      box.expandByPoint(new THREE.Vector3((comp.position.x - width / 2) * MM, 0, (comp.position.z - depth / 2) * MM));
      box.expandByPoint(new THREE.Vector3((comp.position.x + width / 2) * MM, height * MM, (comp.position.z + depth / 2) * MM));
    }
    if (!box.isEmpty()) {
      box.getSize(this.size);
      box.getCenter(this.center);
    }
    this.mats.setWireframe(this.wireframe);
    for (const sk of this.skins.values()) for (const m of sk.materials()) (m as THREE.MeshStandardMaterial).wireframe = this.wireframe;
    this.placeKeyLight();
  }

  /**
   * Flat glow on the floor around the compartment being edited: a bright band
   * just outside the walls and a soft wider one. Two flat meshes, no shaders.
   */
  private floorGlow(tree: ComponentTree): THREE.Group {
    const g = new THREE.Group();
    const ring = (inner: number, outer: number, mat: THREE.Material, y: number) => {
      const o = offsetPolygon(tree.footprint, outer);
      const i = offsetPolygon(tree.footprint, inner);
      const shape = new THREE.Shape(o.map(([x, z]) => new THREE.Vector2(x, -z)));
      shape.holes.push(new THREE.Path(i.map(([x, z]) => new THREE.Vector2(x, -z))));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.renderOrder = 1;
      g.add(m);
    };
    ring(140, 420, this.mats.glowSoft, 1);
    ring(20, 140, this.mats.glow, 2);
    g.userData.glow = true;
    return g;
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
          this.paintScreens(img);
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

  /** Draw the controller faces, with the white logo once it has loaded. */
  private paintScreens(logo: HTMLImageElement | null) {
    for (const [mat, face] of [
      [this.mats.screenTSC, tsc2000Face],
      [this.mats.screenTC, tc1000Face],
    ] as const) {
      mat.map?.dispose();
      mat.map = face(logo);
      mat.needsUpdate = true;
    }
  }

  /** Default decal image when the configuration has no upload. */
  defaultDecal: string | null = null;
  private wireframe = false;

  private applyDecal(c: Compartment, skin: Skin) {
    const d = c.finishes.decal;
    const useDecal = c.finishes.exterior === 'decal';
    const raw = d.image ?? this.defaultDecal;
    const src = raw && raw.trim().startsWith('<') ? svgDataUrl(raw) : raw;
    const key = useDecal && src ? `${src.length}:${src.slice(-64)}|${d.background}` : null;
    const finish = c.finishes.exterior as ExteriorFinish;
    const color = c.finishes.exteriorColor;
    const place = (tex: THREE.Texture | null) => {
      if (tex) {
        // Wall UVs are millimetres along the wall, so one repeat = one tile.
        tex.repeat.set(1 / d.tile, 1 / d.tile);
        tex.rotation = (d.angle * Math.PI) / 180;
      }
      skin.setFinish(finish, color, tex);
    };
    if (key === skin.decalKey) return place(skin.decalTex);
    skin.decalKey = key;
    if (!key || !src) {
      skin.decalTex?.dispose();
      skin.decalTex = null;
      return place(null);
    }
    place(skin.decalTex); // keep the old tiles until the new ones load
    loadImage(src)
      .then((img) => {
        if (skin.decalKey !== key) return;
        skin.decalTex?.dispose();
        skin.decalTex = decalTexture(img, d.background);
        place(skin.decalTex);
      })
      .catch(() => place(null));
  }

  setDims(on: boolean) {
    this.showDims = on;
    for (const b of this.built.values()) b.dims.visible = on;
  }
  setWireframe(on: boolean) {
    this.wireframe = on;
    this.mats.setWireframe(on);
    for (const sk of this.skins.values()) for (const m of sk.materials()) (m as THREE.MeshStandardMaterial).wireframe = on;
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
    // Pull back on tall, narrow viewports (phones) so the whole site still fits.
    const narrow = Math.max(1, 1.15 / Math.max(this.camera.aspect, 0.3));
    const dist = (span * 2.4 + 2.5) * narrow;
    const target = new THREE.Vector3(this.center.x, this.size.y * 0.42, this.center.z);
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

  /**
   * Save the view as a PNG. `scale` multiplies the on-screen size in CSS
   * pixels (1 = as shown on this screen); the image is capped at what the
   * graphics card can render. `dpi` is written into the file for printing.
   */
  async screenshot(scale: number, dpi: number) {
    const r = this.renderer;
    const prev = r.getPixelRatio();
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const maxSide = Math.min(r.capabilities.maxTextureSize, 8192);
    const ratio = scale <= 1 ? prev : Math.min(scale, maxSide / Math.max(w, h));
    r.setPixelRatio(ratio);
    r.render(this.scene, this.camera);
    const blob = await new Promise<Blob | null>((res) => r.domElement.toBlob(res, 'image/png'));
    r.setPixelRatio(prev);
    r.render(this.scene, this.camera);
    if (!blob) return;
    const file = await withDpi(blob, dpi);
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = `walk-in-${new Date().toISOString().slice(0, 10)}-${Math.round(w * ratio)}x${Math.round(h * ratio)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointer);
    this.renderer.domElement.removeEventListener('pointerleave', this.clearHover);
    this.controls.dispose();
    for (const b of this.built.values()) disposeTree(b.group, this.keepSet());
    for (const sk of this.skins.values()) sk.dispose();
    this.mats.badgeFace.map?.dispose();
    this.mats.logoWhite.map?.dispose();
    this.mats.checker.map?.dispose();
    this.mats.wireShelf.map?.dispose();
    this.mats.screenTSC.map?.dispose();
    this.mats.screenTC.map?.dispose();
    this.mats.dispose();
    this.envMap.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── internals ──

  private keepSet() {
    return new Set<THREE.Material>(this.mats.shared());
  }

  private placeKeyLight() {
    const r = Math.max(this.size.x, this.size.z) * 1.4 + 4;
    this.key.position.set(this.center.x + Math.cos(this.lightAngle) * r, r * 1.1, this.center.z + Math.sin(this.lightAngle) * r);
    this.key.target.position.set(this.center.x, 0, this.center.z);
    const half = Math.max(15, Math.max(this.size.x, this.size.z));
    Object.assign(this.key.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
    this.key.shadow.camera.updateProjectionMatrix();
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
    if (e.buttons || !this.built.size) return this.clearHover();
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const pickable = [...this.built.values()].flatMap((b) => b.pickable);
    const hit = this.raycaster.intersectObjects(pickable, false)[0];
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
