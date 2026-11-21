import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
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

@Component({
  selector: 'app-anatomy-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative w-full h-full overflow-hidden bg-studio-850 select-none">
      <!-- Canvas 3D -->
      <canvas #canvasRef class="w-full h-full block cursor-grab active:cursor-grabbing outline-none"></canvas>

      <!-- Tooltip Flotante de Raycasting -->
      @if (hoveredPart()) {
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
            Capa: <span class="capitalize">{{ hoveredPart()!.layer }}</span> (Clic para explorar)
          </div>
        </div>
      }

      <!-- Barra Superior de Controles de Capas y Vista -->
      <div class="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 bg-studio-900/80 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/60 shadow-2xl">
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

      <!-- Leyenda Inferior Izquierda del Modelo -->
      <div class="absolute bottom-4 left-4 z-20 bg-studio-900/80 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-700/60 shadow-xl text-xs text-slate-400 flex items-center gap-3">
        <span class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-slate-200 shadow-[0_0_8px_#cbd5e1]"></span> Óseo
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]"></span> Muscular
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8]"></span> Nervioso
        </span>
        <span class="text-[11px] text-slate-500 ml-1 font-mono">
          {{ modelMode() === 'gltf' ? 'GLTF HD' : 'Maniquí Articulado Procedural' }}
        </span>
      </div>

      <!-- Indicador de Selección Activa Flotante en la Escena -->
      @if (anatomyService.selectedDetail(); as current) {
        <div class="absolute bottom-4 right-4 z-20 bg-studio-900/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-cyan-500/50 shadow-2xl flex items-center gap-3 max-w-sm">
          <div class="w-3 h-3 rounded-full bg-cyan-400 animate-ping"></div>
          <div>
            <div class="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">Estructura Activa</div>
            <div class="text-sm font-bold text-white">{{ current.name }}</div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AnatomyViewerComponent implements OnInit, OnDestroy {
  @ViewChild('canvasRef', { static: true })
  private canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly anatomyService = inject(AnatomyApiService);

  // Estados locales reactivos
  readonly hoveredPart = signal<AnatomicalPartMeta | null>(null);
  readonly mousePos = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  readonly isWireframe = signal<boolean>(false);
  readonly modelMode = signal<'gltf' | 'procedural'>('procedural');

  // Three.js Core
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-1000, -1000);
  private animationFrameId: number | null = null;

  // Grupos y contenedores de objetos 3D
  private rootAnatomyGroup = new THREE.Group();
  private layerGroups: Record<'oseo' | 'muscular' | 'nervioso', THREE.Group> = {
    oseo: new THREE.Group(),
    muscular: new THREE.Group(),
    nervioso: new THREE.Group(),
  };

  private interactiveMeshes: THREE.Mesh[] = [];
  private currentHighlightedMesh: THREE.Mesh | null = null;
  private originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

  // Cámara objetivo para interpolación suave (Lerp)
  private targetCameraPosition: THREE.Vector3 | null = null;
  private targetControlsTarget: THREE.Vector3 | null = null;

  constructor() {
    // Escuchar cambios de capa reactivamente desde el servicio
    effect(() => {
      const layer = this.anatomyService.currentLayer();
      this.applyLayerVisibility(layer);
    });

    // Escuchar selección de parte para enfocar cámara
    effect(() => {
      const selectedId = this.anatomyService.selectedPart();
      if (selectedId) {
        this.focusOnPartById(selectedId);
      }
    });
  }

  ngOnInit(): void {
    this.initThreeScene();
    this.setupLighting();
    this.setupGridAndStudio();
    this.loadDualAnatomyModel();
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

    // Escena
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1120);
    this.scene.fog = new THREE.FogExp2(0x0b1120, 0.025);

    // Cámara Perspectiva
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 1.2, 5.2);

    // Renderizador WebGL
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
    this.renderer.toneMappingExposure = 1.1;

    // OrbitControls con Damping suave
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 0.8, 0);
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 14;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.15; // Evita rotar completamente bajo el suelo

    // Añadir grupos a la escena
    this.rootAnatomyGroup.add(this.layerGroups.oseo);
    this.rootAnatomyGroup.add(this.layerGroups.muscular);
    this.rootAnatomyGroup.add(this.layerGroups.nervioso);
    this.scene.add(this.rootAnatomyGroup);
  }

  private setupLighting(): void {
    // 1. Luz Ambiental sutil estilo hospital/estudio
    const ambientLight = new THREE.AmbientLight(0x334155, 1.2);
    this.scene.add(ambientLight);

    // 2. Key Light (Frontal superior blanco puro)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 6, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    this.scene.add(keyLight);

    // 3. Fill Light (Lateral fría cian médico)
    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    fillLight.position.set(-5, 3, 2);
    this.scene.add(fillLight);

    // 4. Rim / Back Light (Contra-luz posterior para silueta)
    const backLight = new THREE.DirectionalLight(0x818cf8, 1.8);
    backLight.position.set(0, 4, -5);
    this.scene.add(backLight);
  }

  private setupGridAndStudio(): void {
    // Grilla médica sutil en el suelo
    const grid = new THREE.GridHelper(16, 24, 0x1e293b, 0x0f172a);
    grid.position.y = -2.2;
    this.scene.add(grid);

    // Pedestal cilíndrico de estudio
    const pedestalGeo = new THREE.CylinderGeometry(1.6, 1.8, 0.15, 32);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8,
      metalness: 0.2,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -2.15;
    pedestal.receiveShadow = true;
    this.scene.add(pedestal);
  }

  private loadDualAnatomyModel(): void {
    const gltfPath = '/assets/models/human_anatomy.glb';
    const loader = new GLTFLoader();

    loader.load(
      gltfPath,
      (gltf) => {
        this.modelMode.set('gltf');
        const model = gltf.scene;
        model.scale.set(1.5, 1.5, 1.5);
        model.position.set(0, -1.8, 0);

        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            this.registerMeshForRaycasting(child, child.name || 'parte_anatomica', 'oseo');
          }
        });

        this.rootAnatomyGroup.add(model);
      },
      undefined,
      () => {
        // Fallback automático inmediato: Construcción del maniquí anatómico procedural articulado
        this.modelMode.set('procedural');
        this.buildProceduralAnatomicalMannequin();
      }
    );
  }

  /**
   * Construye un maniquí anatómico 3D de alta fidelidad agrupado en capas ósea, muscular y nerviosa.
   */
  private buildProceduralAnatomicalMannequin(): void {
    // ============================================
    // 1. CAPA ÓSEA (BONE LAYER)
    // ============================================
    const boneMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.35,
      metalness: 0.1,
    });

    // Cráneo
    const skullGroup = new THREE.Group();
    skullGroup.position.set(0, 1.7, 0);
    const craniumGeo = new THREE.SphereGeometry(0.32, 24, 24);
    craniumGeo.scale(1, 1.15, 1.1);
    const skullMesh = new THREE.Mesh(craniumGeo, boneMaterial.clone());
    skullMesh.castShadow = true;
    this.registerMeshForRaycasting(skullMesh, 'craneo', 'oseo');
    skullGroup.add(skullMesh);

    // Mandíbula
    const jawGeo = new THREE.BoxGeometry(0.24, 0.15, 0.22);
    const jawMesh = new THREE.Mesh(jawGeo, boneMaterial.clone());
    jawMesh.position.set(0, -0.22, 0.08);
    skullGroup.add(jawMesh);
    this.layerGroups.oseo.add(skullGroup);

    // Columna Vertebral (12 vértebras articuladas cilíndricas)
    const spineGroup = new THREE.Group();
    spineGroup.position.set(0, 0.8, -0.05);
    for (let i = 0; i < 10; i++) {
      const vGeo = new THREE.CylinderGeometry(0.09 - i * 0.003, 0.1 - i * 0.003, 0.08, 12);
      const vMesh = new THREE.Mesh(vGeo, boneMaterial.clone());
      vMesh.position.set(0, 0.45 - i * 0.11, -Math.sin(i * 0.3) * 0.04);
      spineGroup.add(vMesh);
    }
    const spineHitBox = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 1.1, 12),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
    );
    spineHitBox.position.set(0, 0, 0);
    spineGroup.add(spineHitBox);
    this.registerMeshForRaycasting(spineHitBox, 'columna_vertebral', 'oseo');
    this.layerGroups.oseo.add(spineGroup);

    // Tórax y Costillas (Arcos costales elípticos y esternón)
    const ribGroup = new THREE.Group();
    ribGroup.position.set(0, 0.85, 0);
    const sternumGeo = new THREE.BoxGeometry(0.08, 0.6, 0.05);
    const sternum = new THREE.Mesh(sternumGeo, boneMaterial.clone());
    sternum.position.set(0, 0.05, 0.28);
    ribGroup.add(sternum);

    for (let r = 0; r < 5; r++) {
      const ribGeo = new THREE.TorusGeometry(0.32 + r * 0.02, 0.022, 8, 24, Math.PI * 1.55);
      ribGeo.rotateX(Math.PI / 2);
      ribGeo.scale(1.15, 0.85, 1);
      const ribMesh = new THREE.Mesh(ribGeo, boneMaterial.clone());
      ribMesh.position.set(0, 0.25 - r * 0.11, 0.02);
      ribGroup.add(ribMesh);
    }
    const ribHitBox = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.38, 0.7, 16),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
    );
    ribGroup.add(ribHitBox);
    this.registerMeshForRaycasting(ribHitBox, 'torax_costillas', 'oseo');
    this.layerGroups.oseo.add(ribGroup);

    // Húmeros (Brazos Izquierdo y Derecho)
    const humerusGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.65, 12);
    
    // Húmero Izquierdo
    const humeroIzq = new THREE.Mesh(humerusGeo, boneMaterial.clone());
    humeroIzq.position.set(-0.72, 0.75, 0);
    humeroIzq.rotation.z = 0.15;
    this.registerMeshForRaycasting(humeroIzq, 'humero_izq', 'oseo');
    this.layerGroups.oseo.add(humeroIzq);

    // Húmero Derecho
    const humeroDer = new THREE.Mesh(humerusGeo, boneMaterial.clone());
    humeroDer.position.set(0.72, 0.75, 0);
    humeroDer.rotation.z = -0.15;
    this.registerMeshForRaycasting(humeroDer, 'humero_der', 'oseo');
    this.layerGroups.oseo.add(humeroDer);

    // Pelvis base
    const pelvisGeo = new THREE.TorusGeometry(0.35, 0.07, 12, 16);
    pelvisGeo.rotateX(Math.PI / 2.3);
    const pelvis = new THREE.Mesh(pelvisGeo, boneMaterial.clone());
    pelvis.position.set(0, 0.05, -0.02);
    this.layerGroups.oseo.add(pelvis);

    // Fémures (Piernas Izquierda y Derecha)
    const femurGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.88, 12);

    // Fémur Izquierdo
    const femurIzq = new THREE.Mesh(femurGeo, boneMaterial.clone());
    femurIzq.position.set(-0.28, -0.65, 0);
    femurIzq.rotation.z = -0.06;
    this.registerMeshForRaycasting(femurIzq, 'femur_izq', 'oseo');
    this.layerGroups.oseo.add(femurIzq);

    // Fémur Derecho
    const femurDer = new THREE.Mesh(femurGeo, boneMaterial.clone());
    femurDer.position.set(0.28, -0.65, 0);
    femurDer.rotation.z = 0.06;
    this.registerMeshForRaycasting(femurDer, 'femur_der', 'oseo');
    this.layerGroups.oseo.add(femurDer);

    // Tibias de apoyo estético
    const tibiaGeo = new THREE.CylinderGeometry(0.045, 0.035, 0.85, 12);
    const tibiaIzq = new THREE.Mesh(tibiaGeo, boneMaterial.clone());
    tibiaIzq.position.set(-0.31, -1.6, 0);
    const tibiaDer = new THREE.Mesh(tibiaGeo, boneMaterial.clone());
    tibiaDer.position.set(0.31, -1.6, 0);
    this.layerGroups.oseo.add(tibiaIzq, tibiaDer);


    // ============================================
    // 2. CAPA MUSCULAR (MUSCLE LAYER)
    // ============================================
    const muscleMaterial = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.6,
      metalness: 0.15,
    });

    // Deltoides (Hombros)
    const deltoidGeo = new THREE.SphereGeometry(0.16, 16, 16);
    deltoidGeo.scale(1, 1.4, 0.9);

    const deltoidesIzq = new THREE.Mesh(deltoidGeo, muscleMaterial.clone());
    deltoidesIzq.position.set(-0.65, 1.15, 0);
    deltoidesIzq.rotation.z = 0.35;
    this.registerMeshForRaycasting(deltoidesIzq, 'deltoides_izq', 'muscular');
    this.layerGroups.muscular.add(deltoidesIzq);

    const deltoidesDer = new THREE.Mesh(deltoidGeo, muscleMaterial.clone());
    deltoidesDer.position.set(0.65, 1.15, 0);
    deltoidesDer.rotation.z = -0.35;
    this.registerMeshForRaycasting(deltoidesDer, 'deltoides_der', 'muscular');
    this.layerGroups.muscular.add(deltoidesDer);

    // Pectoral Mayor (Tórax anterior)
    const pectoralGroup = new THREE.Group();
    pectoralGroup.position.set(0, 1.0, 0.2);
    const pecGeo = new THREE.BoxGeometry(0.24, 0.22, 0.08);
    
    const pecIzq = new THREE.Mesh(pecGeo, muscleMaterial.clone());
    pecIzq.position.set(-0.16, 0, 0);
    pecIzq.rotation.y = -0.15;
    pectoralGroup.add(pecIzq);

    const pecDer = new THREE.Mesh(pecGeo, muscleMaterial.clone());
    pecDer.position.set(0.16, 0, 0);
    pecDer.rotation.y = 0.15;
    pectoralGroup.add(pecDer);

    const pecHitBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.3, 0.2),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
    );
    pectoralGroup.add(pecHitBox);
    this.registerMeshForRaycasting(pecHitBox, 'pectoral_mayor', 'muscular');
    this.layerGroups.muscular.add(pectoralGroup);

    // Bíceps Braquial (Brazos)
    const bicepsGeo = new THREE.CapsuleGeometry(0.075, 0.28, 8, 16);

    const bicepsIzq = new THREE.Mesh(bicepsGeo, muscleMaterial.clone());
    bicepsIzq.position.set(-0.73, 0.74, 0.06);
    this.registerMeshForRaycasting(bicepsIzq, 'biceps_braquial_izq', 'muscular');
    this.layerGroups.muscular.add(bicepsIzq);

    const bicepsDer = new THREE.Mesh(bicepsGeo, muscleMaterial.clone());
    bicepsDer.position.set(0.73, 0.74, 0.06);
    this.registerMeshForRaycasting(bicepsDer, 'biceps_braquial_der', 'muscular');
    this.layerGroups.muscular.add(bicepsDer);

    // Abdominales Rectos (Pared abdominal)
    const absGroup = new THREE.Group();
    absGroup.position.set(0, 0.45, 0.16);
    for (let row = 0; row < 3; row++) {
      const abGeo = new THREE.BoxGeometry(0.11, 0.08, 0.04);
      const abL = new THREE.Mesh(abGeo, muscleMaterial.clone());
      abL.position.set(-0.07, 0.12 - row * 0.11, 0);
      const abR = new THREE.Mesh(abGeo, muscleMaterial.clone());
      abR.position.set(0.07, 0.12 - row * 0.11, 0);
      absGroup.add(abL, abR);
    }
    const absHitBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.45, 0.15),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
    );
    absGroup.add(absHitBox);
    this.registerMeshForRaycasting(absHitBox, 'abdominales_recto', 'muscular');
    this.layerGroups.muscular.add(absGroup);

    // Cuádriceps Femorales (Muslos)
    const quadGeo = new THREE.CapsuleGeometry(0.11, 0.48, 8, 16);

    const quadIzq = new THREE.Mesh(quadGeo, muscleMaterial.clone());
    quadIzq.position.set(-0.28, -0.62, 0.06);
    this.registerMeshForRaycasting(quadIzq, 'cuadriceps_izq', 'muscular');
    this.layerGroups.muscular.add(quadIzq);

    const quadDer = new THREE.Mesh(quadGeo, muscleMaterial.clone());
    quadDer.position.set(0.28, -0.62, 0.06);
    this.registerMeshForRaycasting(quadDer, 'cuadriceps_der', 'muscular');
    this.layerGroups.muscular.add(quadDer);


    // ============================================
    // 3. CAPA NERVIOSA (NERVE LAYER)
    // ============================================
    const nerveMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.3,
    });

    // Cerebro / Encéfalo (Interior translúcido)
    const brainGeo = new THREE.SphereGeometry(0.24, 20, 20);
    brainGeo.scale(1, 0.85, 1.1);
    const brainMesh = new THREE.Mesh(brainGeo, nerveMaterial.clone());
    brainMesh.position.set(0, 1.74, 0);
    this.registerMeshForRaycasting(brainMesh, 'cerebro_encefalo', 'nervioso');
    this.layerGroups.nervioso.add(brainMesh);

    // Médula Espinal (Eje neuroespinal central)
    const spineCordGeo = new THREE.CylinderGeometry(0.035, 0.03, 1.35, 12);
    const spinalCord = new THREE.Mesh(spineCordGeo, nerveMaterial.clone());
    spinalCord.position.set(0, 0.82, -0.04);
    this.registerMeshForRaycasting(spinalCord, 'medula_espinal', 'nervioso');
    this.layerGroups.nervioso.add(spinalCord);

    // Plexo Braquial (Red axilar emergente hacia brazos)
    const brachialGroup = new THREE.Group();
    brachialGroup.position.set(0, 1.25, 0);
    const plexusCurveL = new THREE.CylinderGeometry(0.02, 0.015, 0.45, 8);
    plexusCurveL.rotateZ(Math.PI / 3.2);
    const plxL = new THREE.Mesh(plexusCurveL, nerveMaterial.clone());
    plxL.position.set(-0.35, -0.05, 0);
    brachialGroup.add(plxL);

    const plexusCurveR = new THREE.CylinderGeometry(0.02, 0.015, 0.45, 8);
    plexusCurveR.rotateZ(-Math.PI / 3.2);
    const plxR = new THREE.Mesh(plexusCurveR, nerveMaterial.clone());
    plxR.position.set(0.35, -0.05, 0);
    brachialGroup.add(plxR);

    const brachialHitBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.25, 0.25),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
    );
    brachialGroup.add(brachialHitBox);
    this.registerMeshForRaycasting(brachialHitBox, 'plexo_braquial', 'nervioso');
    this.layerGroups.nervioso.add(brachialGroup);

    // Nervio Ciático (Troncos descendentes posteriores)
    const sciaticGroup = new THREE.Group();
    sciaticGroup.position.set(0, -0.3, -0.06);

    const sciaticL = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.95, 8), nerveMaterial.clone());
    sciaticL.position.set(-0.25, -0.35, 0);
    sciaticGroup.add(sciaticL);

    const sciaticR = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.95, 8), nerveMaterial.clone());
    sciaticR.position.set(0.25, -0.35, 0);
    sciaticGroup.add(sciaticR);

    const sciaticHitBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.95, 0.25),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
    );
    sciaticHitBox.position.set(0, -0.35, 0);
    sciaticGroup.add(sciaticHitBox);
    this.registerMeshForRaycasting(sciaticHitBox, 'nervio_ciatico', 'nervioso');
    this.layerGroups.nervioso.add(sciaticGroup);
  }

  private registerMeshForRaycasting(mesh: THREE.Mesh, id: string, layer: 'oseo' | 'muscular' | 'nervioso'): void {
    mesh.name = id;
    const cleanName = id.replace(/_/g, ' ').toUpperCase();
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

  private performRaycastClick(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const visibleMeshes = this.interactiveMeshes.filter((m) => m.visible && this.isAncestorVisible(m));
    const intersects = this.raycaster.intersectObjects(visibleMeshes, true);

    if (intersects.length > 0) {
      const topHit = intersects[0].object as THREE.Mesh;
      const meta = topHit.userData as AnatomicalPartMeta;

      if (meta && meta.id) {
        this.anatomyService.selectPart(meta.id);
        this.focusCameraOnObject(topHit);
      }
    }
  }

  private applyHoverHighlight(mesh: THREE.Mesh): void {
    this.currentHighlightedMesh = mesh;
    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.material.emissive = new THREE.Color(0x38bdf8);
      mesh.material.emissiveIntensity = 0.75;
    }
  }

  private resetHoverHighlight(): void {
    if (this.currentHighlightedMesh) {
      const orig = this.originalMaterials.get(this.currentHighlightedMesh);
      if (orig && this.currentHighlightedMesh.material instanceof THREE.MeshStandardMaterial) {
        const meta = this.currentHighlightedMesh.userData as AnatomicalPartMeta;
        if (meta?.layer === 'nervioso') {
          this.currentHighlightedMesh.material.emissive = new THREE.Color(0x0284c7);
          this.currentHighlightedMesh.material.emissiveIntensity = 0.8;
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

    // Calcular posición óptima con offset frontal y superior
    this.targetControlsTarget = center.clone();
    this.targetCameraPosition = new THREE.Vector3(
      center.x + (center.x > 0 ? 0.8 : -0.8),
      center.y + 0.3,
      center.z + 2.2
    );
  }

  private focusOnPartById(partId: string): void {
    const mesh = this.interactiveMeshes.find((m) => m.name === partId);
    if (mesh && mesh.visible) {
      this.focusCameraOnObject(mesh);
    }
  }

  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    // Interpolación suave (lerp) de la cámara hacia el objetivo seleccionado
    if (this.targetCameraPosition && this.targetControlsTarget) {
      this.camera.position.lerp(this.targetCameraPosition, 0.08);
      this.controls.target.lerp(this.targetControlsTarget, 0.08);

      if (this.camera.position.distanceTo(this.targetCameraPosition) < 0.02) {
        this.targetCameraPosition = null;
        this.targetControlsTarget = null;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  // ============================================
  // Controles Públicos del Toolbar
  // ============================================

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
    this.targetControlsTarget = new THREE.Vector3(0, 0.8, 0);
    this.targetCameraPosition = new THREE.Vector3(0, 1.2, 5.2);
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
}
