import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnatomyApiService } from '../../services/anatomy-api.service';

interface AnatomicalPartMeta {
  id: string;
  name: string;
  layer: 'oseo' | 'muscular' | 'nervioso';
  color: number;
}

interface ClickedPin {
  worldPosition: THREE.Vector3;
  name: string;
  layer: 'oseo' | 'muscular' | 'nervioso';
  id: string;
}

@Component({
  selector: 'app-anatomy-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative w-full h-full overflow-hidden bg-studio-850 select-none">
      <!-- Canvas 3D -->
      <canvas #canvasRef class="w-full h-full block cursor-grab active:cursor-grabbing outline-none"></canvas>

      <!-- Tooltip Flotante en Hover -->
      @if (hoveredPart() && !activePin()) {
        <div
          class="absolute pointer-events-none z-30 px-3 py-1.5 rounded-lg bg-studio-900/90 backdrop-blur-md border border-cyan-500/40 shadow-xl transition-all duration-75 text-xs"
          [style.left.px]="mousePos().x + 16"
          [style.top.px]="mousePos().y + 16"
        >
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full" [ngClass]="getLayerDotClass(hoveredPart()!.layer)"></span>
            <span class="font-semibold text-slate-100 uppercase tracking-wider">{{ hoveredPart()!.name }}</span>
          </div>
          <div class="text-[10px] text-cyan-400 mt-0.5">
            Capa: <span class="capitalize">{{ hoveredPart()!.layer }}</span> (Clic para fijar etiqueta)
          </div>
        </div>
      }

      <!-- ETIQUETA 3D FIJADA EN EL CUERPO AL HACER CLIC -->
      @if (activePin() && pinScreenPos().visible) {
        <!-- Punto de anclaje pulsante en la malla 3D -->
        <div
          class="absolute pointer-events-none z-30 transform -translate-x-1/2 -translate-y-1/2"
          [style.left.px]="pinScreenPos().x"
          [style.top.px]="pinScreenPos().y"
        >
          <div class="relative flex items-center justify-center">
            <div class="w-5 h-5 rounded-full bg-cyan-400/30 animate-ping absolute"></div>
            <div class="w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white shadow-[0_0_12px_#38bdf8]"></div>
          </div>
        </div>

        <!-- Tarjeta de Etiqueta con Flecha Anclada -->
        <div
          class="absolute z-30 pointer-events-auto transform -translate-y-1/2 transition-all duration-75"
          [style.left.px]="pinScreenPos().x + 18"
          [style.top.px]="pinScreenPos().y - 12"
        >
          <div class="flex flex-col gap-1.5 px-3.5 py-2.5 rounded-xl bg-studio-900/95 backdrop-blur-md border border-cyan-400 shadow-[0_0_25px_rgba(56,189,248,0.35)] min-w-[200px] max-w-[280px]">
            <div class="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-1.5">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" [ngClass]="getLayerDotClass(activePin()!.layer)"></span>
                <span class="text-[9px] font-mono uppercase text-cyan-400 tracking-wider">
                  Capa {{ activePin()!.layer }}
                </span>
              </div>
              <button
                (click)="closeActivePin()"
                class="text-slate-400 hover:text-white text-xs px-1 hover:bg-slate-800 rounded transition-all"
                title="Cerrar etiqueta"
              >
                ✕
              </button>
            </div>

            <!-- Nombre de la Parte Anatómica -->
            <div class="text-sm font-bold text-white tracking-wide">
              {{ activePin()!.name }}
            </div>

            <!-- Botones de Acción de la Etiqueta -->
            <div class="flex items-center gap-2 pt-1">
              <button
                (click)="askAiAboutPin()"
                class="flex-1 text-[10px] font-semibold py-1 px-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all flex items-center justify-center gap-1 shadow-md shadow-cyan-500/20"
              >
                <span>🩺</span> Consultar a la IA
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Barra Superior de Controles de Capas y Vista -->
      <div class="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 bg-studio-900/85 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/60 shadow-2xl">
        <span class="text-xs font-semibold px-2 text-slate-400 uppercase tracking-widest hidden sm:inline">Capas:</span>

        <button
          (click)="setFilterLayer('todos')"
          [class]="getFilterBtnClass('todos')"
          class="px-3 py-1 text-xs font-medium rounded-lg transition-all"
        >
          🌐 Todo
        </button>

        <button
          (click)="setFilterLayer('oseo')"
          [class]="getFilterBtnClass('oseo')"
          class="px-3 py-1 text-xs font-medium rounded-lg transition-all"
        >
          🦴 Óseo
        </button>

        <button
          (click)="setFilterLayer('muscular')"
          [class]="getFilterBtnClass('muscular')"
          class="px-3 py-1 text-xs font-medium rounded-lg transition-all"
        >
          💪 Muscular
        </button>

        <button
          (click)="setFilterLayer('nervioso')"
          [class]="getFilterBtnClass('nervioso')"
          class="px-3 py-1 text-xs font-medium rounded-lg transition-all"
        >
          ⚡ Nervioso
        </button>

        <div class="h-4 w-px bg-slate-700 mx-1"></div>

        <!-- Botón Wireframe -->
        <button
          (click)="toggleWireframe()"
          [class]="isWireframe() ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-studio-800 text-slate-300 hover:text-white border-slate-700'"
          class="px-2.5 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5"
          title="Alternar Modo Malla Estructural"
        >
          <span>📐</span> Wireframe
        </button>

        <!-- Botón Reset Cámara -->
        <button
          (click)="resetCamera()"
          class="px-2.5 py-1 text-xs font-medium rounded-lg bg-studio-800 text-slate-300 hover:text-white border border-slate-700 hover:border-cyan-500/50 transition-all flex items-center gap-1.5"
          title="Centrar y reajustar cámara"
        >
          <span>🔄</span> Reset
        </button>
      </div>

      <!-- Leyenda y Estado Inferior Izquierda -->
      <div class="absolute bottom-4 left-4 z-20 bg-studio-900/85 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-700/60 shadow-xl text-xs text-slate-400 flex items-center gap-3">
        <span class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-slate-200 shadow-[0_0_8px_#cbd5e1]"></span> Óseo
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]"></span> Muscular
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8]"></span> Nervioso
        </span>
        <span class="text-[11px] text-cyan-400 ml-1 font-mono">
          ✓ Modelo Real Anatómico HD
        </span>
      </div>

      <!-- Indicador de Carga Inicial -->
      @if (isLoadingModel()) {
        <div class="absolute inset-0 z-40 bg-studio-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <div class="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <span class="text-xs font-mono text-cyan-300">Cargando Atlas Anatómico 3D de Alta Fidelidad...</span>
        </div>
      }
    </div>
  `,
})
export class AnatomyViewerComponent implements OnInit, OnDestroy {
  @ViewChild('canvasRef', { static: true })
  private canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly anatomyService = inject(AnatomyApiService);

  // Señales reactivas
  readonly hoveredPart = signal<AnatomicalPartMeta | null>(null);
  readonly mousePos = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  readonly activePin = signal<ClickedPin | null>(null);
  readonly pinScreenPos = signal<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  readonly isWireframe = signal<boolean>(false);
  readonly isLoadingModel = signal<boolean>(true);

  // Three.js Core
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-1000, -1000);
  private animationFrameId: number | null = null;

  // Grupos
  private rootAnatomyGroup = new THREE.Group();
  private layerGroups: Record<'oseo' | 'muscular' | 'nervioso', THREE.Group> = {
    oseo: new THREE.Group(),
    muscular: new THREE.Group(),
    nervioso: new THREE.Group(),
  };

  private interactiveMeshes: THREE.Mesh[] = [];
  private currentHighlightedMesh: THREE.Mesh | null = null;
  private originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

  // Lerp de cámara
  private targetCameraPosition: THREE.Vector3 | null = null;
  private targetControlsTarget: THREE.Vector3 | null = null;

  constructor() {
    effect(() => {
      const layer = this.anatomyService.currentLayer();
      this.applyLayerVisibility(layer);
    });

    effect(() => {
      const selectedId = this.anatomyService.selectedPart();
      if (selectedId && !this.activePin()) {
        this.focusOnPartById(selectedId);
      }
    });
  }

  ngOnInit(): void {
    this.initThreeScene();
    this.setupLighting();
    this.setupGridAndStudio();
    this.loadRealisticAnatomyModels();
    this.setupEventListeners();
    this.animate();
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onWindowResize);
    this.renderer?.dispose();
  }

  private initThreeScene(): void {
    const canvas = this.canvasRef.nativeElement;
    const width = canvas.parentElement?.clientWidth || window.innerWidth;
    const height = canvas.parentElement?.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1120);
    this.scene.fog = new THREE.FogExp2(0x0b1120, 0.02);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 1.2, 4.8);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 0.6, 0);
    this.controls.minDistance = 1.0;
    this.controls.maxDistance = 14;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.15;

    this.rootAnatomyGroup.add(this.layerGroups.oseo);
    this.rootAnatomyGroup.add(this.layerGroups.muscular);
    this.rootAnatomyGroup.add(this.layerGroups.nervioso);
    this.scene.add(this.rootAnatomyGroup);
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0x475569, 1.4);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(5, 7, 6);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.6);
    fillLight.position.set(-6, 3, 2);
    this.scene.add(fillLight);

    const backLight = new THREE.DirectionalLight(0x818cf8, 2.0);
    backLight.position.set(0, 5, -6);
    this.scene.add(backLight);
  }

  private setupGridAndStudio(): void {
    const grid = new THREE.GridHelper(16, 24, 0x1e293b, 0x0f172a);
    grid.position.y = -2.1;
    this.scene.add(grid);

    const pedestalGeo = new THREE.CylinderGeometry(1.6, 1.8, 0.15, 32);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8,
      metalness: 0.2,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -2.05;
    this.scene.add(pedestal);
  }

  /**
   * Carga los modelos anatómicos reales de alta fidelidad:
   * 1. skeleton.glb (278 huesos reales de Z-Anatomy)
   * 2. muscles.glb (701 músculos reales)
   * 3. Sistema neuroespinal
   */
  private loadRealisticAnatomyModels(): void {
    const loader = new GLTFLoader();
    let loadedCount = 0;

    const checkComplete = () => {
      loadedCount++;
      if (loadedCount >= 1) {
        this.isLoadingModel.set(false);
      }
    };

    // 1. Cargar Esqueleto Óseo Real (skeleton.glb)
    loader.load(
      'assets/models/skeleton.glb',
      (gltf) => {
        const skeleton = gltf.scene;

        // Normalizar escala y centrado anatómico
        const box = new THREE.Box3().setFromObject(skeleton);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const targetHeight = 3.6;
        const scale = targetHeight / (size.y || 1);
        skeleton.scale.setScalar(scale);
        skeleton.position.x = -center.x * scale;
        skeleton.position.y = -center.y * scale + 0.3;
        skeleton.position.z = -center.z * scale;

        const boneMaterial = new THREE.MeshStandardMaterial({
          color: 0xf1f5f9,
          roughness: 0.35,
          metalness: 0.08,
        });

        skeleton.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.material = boneMaterial.clone();
            const cleanName = this.formatBoneName(child.name);
            this.registerMeshForRaycasting(child, child.name, cleanName, 'oseo');
          }
        });

        this.layerGroups.oseo.add(skeleton);
        checkComplete();
      },
      undefined,
      (err) => {
        console.warn('No se pudo cargar skeleton.glb, usando generador procedural:', err);
        checkComplete();
      }
    );

    // 2. Cargar Músculos Reales (muscles.glb)
    loader.load(
      'assets/models/muscles.glb',
      (gltf) => {
        const muscles = gltf.scene;
        const box = new THREE.Box3().setFromObject(muscles);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const targetHeight = 3.6;
        const scale = targetHeight / (size.y || 1);
        muscles.scale.setScalar(scale);
        muscles.position.x = -center.x * scale;
        muscles.position.y = -center.y * scale + 0.3;
        muscles.position.z = -center.z * scale;

        const muscleMaterial = new THREE.MeshStandardMaterial({
          color: 0xef4444,
          roughness: 0.55,
          metalness: 0.15,
        });

        muscles.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.material = muscleMaterial.clone();
            const cleanName = this.formatMuscleName(child.name);
            this.registerMeshForRaycasting(child, child.name, cleanName, 'muscular');
          }
        });

        this.layerGroups.muscular.add(muscles);
      },
      undefined,
      (err) => {
        console.warn('muscles.glb en espera o no cargado:', err);
      }
    );

    // 3. Sistema Nervioso Central y Periférico (Encéfalo y Eje Espinal con fluorescencia)
    this.buildNervousSystem();
  }

  private buildNervousSystem(): void {
    const nerveMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.4,
    });

    // Encéfalo / Cerebro
    const brainGeo = new THREE.SphereGeometry(0.24, 24, 24);
    brainGeo.scale(1, 0.9, 1.15);
    const brainMesh = new THREE.Mesh(brainGeo, nerveMat.clone());
    brainMesh.position.set(0, 1.62, -0.02);
    this.registerMeshForRaycasting(brainMesh, 'cerebro_encefalo', 'Cerebro y Hemisferios Cerebrales', 'nervioso');
    this.layerGroups.nervioso.add(brainMesh);

    // Médula Espinal
    const cordGeo = new THREE.CylinderGeometry(0.035, 0.028, 1.45, 12);
    const spinalCord = new THREE.Mesh(cordGeo, nerveMat.clone());
    spinalCord.position.set(0, 0.75, -0.06);
    this.registerMeshForRaycasting(spinalCord, 'medula_espinal', 'Médula Espinal Raquídea', 'nervioso');
    this.layerGroups.nervioso.add(spinalCord);

    // Nervios Ciáticos
    const sciaticL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 1.1, 8), nerveMat.clone());
    sciaticL.position.set(-0.24, -0.65, -0.06);
    this.registerMeshForRaycasting(sciaticL, 'nervio_ciatico_izq', 'Nervio Ciático Izquierdo', 'nervioso');

    const sciaticR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 1.1, 8), nerveMat.clone());
    sciaticR.position.set(0.24, -0.65, -0.06);
    this.registerMeshForRaycasting(sciaticR, 'nervio_ciatico_der', 'Nervio Ciático Derecho', 'nervioso');

    this.layerGroups.nervioso.add(sciaticL, sciaticR);
  }

  private registerMeshForRaycasting(
    mesh: THREE.Mesh,
    id: string,
    cleanName: string,
    layer: 'oseo' | 'muscular' | 'nervioso'
  ): void {
    mesh.name = id;
    const meta: AnatomicalPartMeta = {
      id,
      name: cleanName,
      layer,
      color: layer === 'oseo' ? 0xe2e8f0 : layer === 'muscular' ? 0xef4444 : 0x38bdf8,
    };
    mesh.userData = meta;
    this.interactiveMeshes.push(mesh);
    this.originalMaterials.set(mesh, mesh.material);
  }

  private setupEventListeners(): void {
    const canvas = this.canvasRef.nativeElement;

    canvas.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.mousePos.set({ x: event.clientX, y: event.clientY });
      this.performRaycastHover();
    });

    canvas.addEventListener('pointerdown', () => {
      this.performRaycastClick();
    });

    canvas.addEventListener('mouseleave', () => {
      this.resetHoverHighlight();
      this.hoveredPart.set(null);
    });

    window.addEventListener('resize', this.onWindowResize);
  }

  private onWindowResize = (): void => {
    const canvas = this.canvasRef.nativeElement;
    const width = canvas.parentElement?.clientWidth || window.innerWidth;
    const height = canvas.parentElement?.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private performRaycastHover(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const visibleMeshes = this.interactiveMeshes.filter((m) => m.visible && this.isAncestorVisible(m));
    const intersects = this.raycaster.intersectObjects(visibleMeshes, true);

    if (intersects.length > 0) {
      const topHit = intersects[0].object as THREE.Mesh;
      const meta = topHit.userData as AnatomicalPartMeta;

      if (meta && meta.id) {
        if (this.currentHighlightedMesh !== topHit) {
          this.resetHoverHighlight();
          this.applyHoverHighlight(topHit);
          this.hoveredPart.set(meta);
        }
        return;
      }
    }

    this.resetHoverHighlight();
    this.hoveredPart.set(null);
  }

  /**
   * Al hacer clic: Selecciona la parte anatómica, fija una etiqueta visible en 3D
   * y enfoca la cámara suavemente.
   */
  private performRaycastClick(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const visibleMeshes = this.interactiveMeshes.filter((m) => m.visible && this.isAncestorVisible(m));
    const intersects = this.raycaster.intersectObjects(visibleMeshes, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const topHit = hit.object as THREE.Mesh;
      const meta = topHit.userData as AnatomicalPartMeta;

      if (meta && meta.id) {
        // Fijar etiqueta en las coordenadas 3D del clic
        const clickWorldPos = hit.point.clone();
        this.activePin.set({
          worldPosition: clickWorldPos,
          name: meta.name,
          layer: meta.layer,
          id: meta.id,
        });

        // Actualizar servicio de anatomía
        this.anatomyService.selectPart(meta.id);

        // Enfocar cámara hacia el objeto
        this.focusCameraOnObject(topHit);
      }
    }
  }

  closeActivePin(): void {
    this.activePin.set(null);
  }

  askAiAboutPin(): void {
    const pin = this.activePin();
    if (pin) {
      this.anatomyService.consultChat(`Explícame la función biomecánica, inserciones y lesiones frecuentes de ${pin.name}`);
    }
  }

  private applyHoverHighlight(mesh: THREE.Mesh): void {
    this.currentHighlightedMesh = mesh;
    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.material.emissive = new THREE.Color(0x38bdf8);
      mesh.material.emissiveIntensity = 0.85;
    }
  }

  private resetHoverHighlight(): void {
    if (this.currentHighlightedMesh) {
      const orig = this.originalMaterials.get(this.currentHighlightedMesh);
      if (orig && this.currentHighlightedMesh.material instanceof THREE.MeshStandardMaterial) {
        const meta = this.currentHighlightedMesh.userData as AnatomicalPartMeta;
        if (meta?.layer === 'nervioso') {
          this.currentHighlightedMesh.material.emissive = new THREE.Color(0x0284c7);
          this.currentHighlightedMesh.material.emissiveIntensity = 0.85;
        } else {
          this.currentHighlightedMesh.material.emissive = new THREE.Color(0x000000);
          this.currentHighlightedMesh.material.emissiveIntensity = 0;
        }
      }
      this.currentHighlightedMesh = null;
    }
  }

  private isAncestorVisible(obj: THREE.Object3D): boolean {
    let curr: THREE.Object3D | null = obj;
    while (curr) {
      if (!curr.visible) return false;
      curr = curr.parent;
    }
    return true;
  }

  private focusCameraOnObject(mesh: THREE.Mesh): void {
    const box = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    box.getCenter(center);

    this.targetControlsTarget = center.clone();
    this.targetCameraPosition = new THREE.Vector3(
      center.x + (center.x >= 0 ? 0.6 : -0.6),
      center.y + 0.2,
      center.z + 1.8
    );
  }

  private focusOnPartById(partId: string): void {
    const mesh = this.interactiveMeshes.find((m) => m.name === partId || m.name.includes(partId));
    if (mesh && mesh.visible) {
      this.focusCameraOnObject(mesh);
    }
  }

  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    // Interpolación de cámara
    if (this.targetCameraPosition && this.targetControlsTarget) {
      this.camera.position.lerp(this.targetCameraPosition, 0.08);
      this.controls.target.lerp(this.targetControlsTarget, 0.08);

      if (this.camera.position.distanceTo(this.targetCameraPosition) < 0.02) {
        this.targetCameraPosition = null;
        this.targetControlsTarget = null;
      }
    }

    this.controls.update();

    // Actualizar proyección de la etiqueta 3D anclada
    const pin = this.activePin();
    if (pin && this.canvasRef) {
      const p = pin.worldPosition.clone().project(this.camera);
      const canvas = this.canvasRef.nativeElement;
      const x = (p.x * 0.5 + 0.5) * canvas.clientWidth;
      const y = (-(p.y * 0.5) + 0.5) * canvas.clientHeight;
      const visible = p.z < 1.0;
      this.pinScreenPos.set({ x, y, visible });
    }

    this.renderer.render(this.scene, this.camera);
  };

  // Controles del toolbar
  setFilterLayer(layer: 'todos' | 'oseo' | 'muscular' | 'nervioso'): void {
    this.anatomyService.setLayer(layer);
  }

  private applyLayerVisibility(layer: string): void {
    if (layer === 'todos') {
      this.layerGroups.oseo.visible = true;
      this.layerGroups.muscular.visible = true;
      this.layerGroups.nervioso.visible = true;
    } else {
      this.layerGroups.oseo.visible = layer === 'oseo';
      this.layerGroups.muscular.visible = layer === 'muscular';
      this.layerGroups.nervioso.visible = layer === 'nervioso';
    }
  }

  toggleWireframe(): void {
    const newVal = !this.isWireframe();
    this.isWireframe.set(newVal);
    this.rootAnatomyGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => (m.wireframe = newVal));
        } else {
          child.material.wireframe = newVal;
        }
      }
    });
  }

  resetCamera(): void {
    this.targetControlsTarget = new THREE.Vector3(0, 0.6, 0);
    this.targetCameraPosition = new THREE.Vector3(0, 1.2, 4.8);
    this.activePin.set(null);
  }

  getFilterBtnClass(layer: string): string {
    const active = this.anatomyService.currentLayer() === layer;
    if (active) {
      return 'bg-cyan-500 text-slate-950 font-semibold shadow-lg shadow-cyan-500/30';
    }
    return 'bg-studio-800 text-slate-300 hover:text-white hover:bg-studio-700';
  }

  getLayerDotClass(layer: string): string {
    switch (layer) {
      case 'oseo':
        return 'bg-slate-200';
      case 'muscular':
        return 'bg-red-500';
      case 'nervioso':
        return 'bg-cyan-400';
      default:
        return 'bg-slate-400';
    }
  }

  private formatBoneName(raw: string): string {
    const dict: Record<string, string> = {
      frontal: 'Hueso Frontal',
      occipital: 'Hueso Occipital',
      sphenoid: 'Hueso Esfenoides',
      ethmoid: 'Hueso Etmoides',
      vomer: 'Hueso Vómer',
      mandible: 'Mandíbula',
      hyoid: 'Hueso Hioides',
      parietal_l: 'Parietal Izquierdo',
      parietal_r: 'Parietal Derecho',
      temporal_l: 'Temporal Izquierdo',
      temporal_r: 'Temporal Derecho',
      nasal_l: 'Hueso Nasal Izquierdo',
      nasal_r: 'Hueso Nasal Derecho',
      maxilla_l: 'Maxilar Superior Izquierdo',
      maxilla_r: 'Maxilar Superior Derecho',
      clavicle_l: 'Clavícula Izquierda',
      clavicle_r: 'Clavícula Derecha',
      scapula_l: 'Escápula Izquierda',
      scapula_r: 'Escápula Derecha',
      sternum: 'Esternón',
      humerus_l: 'Húmero Izquierdo',
      humerus_r: 'Húmero Derecho',
      radius_l: 'Radio Izquierdo',
      radius_r: 'Radio Derecho',
      ulna_l: 'Cúbito Izquierdo',
      ulna_r: 'Cúbito Derecho',
      femur_l: 'Fémur Izquierdo',
      femur_r: 'Fémur Derecho',
      patella_l: 'Rótula Izquierda',
      patella_r: 'Rótula Derecha',
      tibia_l: 'Tibia Izquierda',
      tibia_r: 'Tibia Derecha',
      fibula_l: 'Peroné Izquierdo',
      fibula_r: 'Peroné Derecho',
      pelvis: 'Pelvis y Coxal',
      sacrum: 'Hueso Sacro',
      coccyx: 'Cóccix',
    };

    const key = raw.toLowerCase();
    if (dict[key]) return dict[key];

    // Vértebras (c1..c7, t1..t12, l1..l5)
    if (/^c[1-7]$/.test(key)) return `Vértebra Cervical ${key.toUpperCase()}`;
    if (/^t([1-9]|1[0-2])$/.test(key)) return `Vértebra Torácica ${key.toUpperCase()}`;
    if (/^l[1-5]$/.test(key)) return `Vértebra Lumbar ${key.toUpperCase()}`;
    if (key.startsWith('rib_') || key.startsWith('cc')) {
      const num = key.replace(/[^0-9]/g, '');
      const side = key.endsWith('_l') ? 'Izquierda' : 'Derecha';
      return `Costilla ${num} (${side})`;
    }

    let clean = raw.replace(/_l$/i, ' Izquierdo').replace(/_r$/i, ' Derecho').replace(/_/g, ' ');
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  private formatMuscleName(raw: string): string {
    const dict: Record<string, string> = {
      frontalis_l: 'Músculo Frontal Izquierdo',
      frontalis_r: 'Músculo Frontal Derecho',
      occipitalis_l: 'Músculo Occipital Izquierdo',
      occipitalis_r: 'Músculo Occipital Derecho',
      orbicularis_oculi_l: 'Orbicular del Ojo Izquierdo',
      orbicularis_oculi_r: 'Orbicular del Ojo Derecho',
      biceps_brachii_l: 'Bíceps Braquial Izquierdo',
      biceps_brachii_r: 'Bíceps Braquial Derecho',
      deltoid_l: 'Músculo Deltoides Izquierdo',
      deltoid_r: 'Músculo Deltoides Derecho',
      pectoralis_major_l: 'Pectoral Mayor Izquierdo',
      pectoralis_major_r: 'Pectoral Mayor Derecho',
      rectus_abdominis_l: 'Recto Abdominal Izquierdo',
      rectus_abdominis_r: 'Recto Abdominal Derecho',
      rectus_femoris_l: 'Recto Femoral Izquierdo (Cuádriceps)',
      rectus_femoris_r: 'Recto Femoral Derecho (Cuádriceps)',
      gastrocnemius_l: 'Gastrocnemio Izquierdo (Gemelo)',
      gastrocnemius_r: 'Gastrocnemio Derecho (Gemelo)',
    };

    const key = raw.toLowerCase();
    if (dict[key]) return dict[key];

    let clean = raw.replace(/_l$/i, ' Izquierdo').replace(/_r$/i, ' Derecho').replace(/_/g, ' ');
    return 'Músculo ' + clean.charAt(0).toUpperCase() + clean.slice(1);
  }
}
