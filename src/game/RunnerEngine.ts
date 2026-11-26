import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createMaterialLibrary, MaterialLibrary } from './materials';
import {
  BarrierKind,
  buildBarrier,
  buildCoinMesh,
  buildInspectorRig,
  buildPowerupGroup,
  buildRunnerRig,
  buildTrainCar,
  InspectorRig,
  RAMP_LENGTH,
  RunnerRig,
  TRAIN_HEIGHT,
  TRAIN_LENGTH,
  TRAIN_WIDTH,
} from './models';
import { sound } from './sound';
import { getSkinById, getUpgradeDuration } from './storage';
import {
  ActivePowerups,
  GamePhase,
  HudSnapshot,
  PowerupDurations,
  PowerupKind,
  SaveData,
} from './types';

const LANE_WIDTH = 3.2;
const CHUNK_LENGTH = 28;
const CHUNK_COUNT = 8;
const PARTICLE_COUNT = 140;

const BASE_SPEED = 23;
const MAX_SPEED = 50;
const GRAVITY = -48;
const JUMP_VELOCITY = 17.6;
const SUPER_JUMP_VELOCITY = 24.5;
const ROLL_DURATION = 0.72;
const JETPACK_HEIGHT = 7.8;

// Pre-allocated scratch math objects (zero GC in render loop)
const _vec3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

interface SpawnedObstacle {
  id: number;
  kind: 'train' | 'barrier';
  barrierKind?: BarrierKind;
  lane: number;
  z: number;
  length: number;
  hasRamp: boolean;
  extraSpeed: number; // > 0 for oncoming moving trains
  mesh: THREE.Group;
}

interface SpawnedCoin {
  lane: number;
  x: number;
  y: number;
  z: number;
  collected: boolean;
  aerial: boolean;
  mesh: THREE.Mesh;
}

interface SpawnedPowerup {
  kind: PowerupKind;
  lane: number;
  y: number;
  z: number;
  collected: boolean;
  mesh: THREE.Group;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  colorHex: number;
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onRunFinished: (result: { score: number; coins: number; distance: number }) => void;
  onBoardConsumed: () => void;
  onContextLost: (lost: boolean) => void;
}

export class RunnerEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private saveData: SaveData;

  private isSoftwareGl = false;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private mats!: MaterialLibrary;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private dirLight!: THREE.DirectionalLight;

  private runner!: RunnerRig;
  private inspector!: InspectorRig;
  private contactShadow!: THREE.Mesh;
  private chunks: THREE.Group[] = [];

  private obstacles: SpawnedObstacle[] = [];
  private coins: SpawnedCoin[] = [];
  private powerups: SpawnedPowerup[] = [];
  private nextObstacleId = 1;

  private particleMesh!: THREE.InstancedMesh;
  private particles: Particle[] = [];

  private phase: GamePhase = 'menu';
  private frameId = 0;
  private disposed = false;
  private lastTime = 0;
  private elapsed = 0;

  // Player kinematics
  private targetLane = 0;
  private prevLane = 0;
  private playerX = 0;
  private playerY = 0;
  private playerVy = 0;
  private grounded = true;
  private rollTimer = 0;
  private fastFall = false;
  private jumpBufferTimer = 0;
  private coyoteTimer = 0;
  private laneTilt = 0;

  // Run state
  private speed = BASE_SPEED;
  private distance = 0;
  private score = 0;
  private runCoins = 0;
  private stumbleTimer = 0;
  private invulnTimer = 0;
  private nextSpawnZ = -48;
  private aerialSpawnTimer = 0;
  private eventBannerTimer = 0;
  private lastEventText: string | null = null;
  private cameraShake = 0;
  private hudEmitAccum = 0;

  private powerupTimers: ActivePowerups = {
    magnet: 0,
    multiplier: 0,
    jetpack: 0,
    sneakers: 0,
    hoverboard: 0,
  };

  // Input swipe tracking
  private pointerActive = false;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private swipeConsumed = false;
  private lastTapTime = 0;

  private skyGradTex: THREE.CanvasTexture | null = null;

  constructor(container: HTMLElement, saveData: SaveData, callbacks: EngineCallbacks) {
    this.container = container;
    this.saveData = saveData;
    this.callbacks = callbacks;

    this.initRendererAndScene();
    this.initEnvironment();
    this.initActorsAndParticles();
    this.bindEvents();
    this.emitHud();

    this.lastTime = performance.now();
    this.scheduleNextFrame();
  }

  public updateSaveData(next: SaveData): void {
    const prevSkin = this.saveData.selectedSkin;
    this.saveData = next;
    if (prevSkin !== next.selectedSkin) {
      this.runner.applySkin(getSkinById(next.selectedSkin));
    }
    sound.setMuted(next.muted);
    this.emitHud();
  }

  public startRun(): void {
    sound.unlock();
    this.clearDynamicEntities();

    this.phase = 'playing';
    this.targetLane = 0;
    this.prevLane = 0;
    this.playerX = 0;
    this.playerY = 0;
    this.playerVy = 0;
    this.grounded = true;
    this.rollTimer = 0;
    this.fastFall = false;
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.laneTilt = 0;

    this.speed = BASE_SPEED;
    this.distance = 0;
    this.score = 0;
    this.runCoins = 0;
    this.stumbleTimer = 6.5; // Inspector chases behind at start for 6.5s!
    this.invulnTimer = 0;
    this.nextSpawnZ = -44;
    this.aerialSpawnTimer = 0;
    this.cameraShake = 0;
    this.lastEventText = null;
    this.eventBannerTimer = 0;

    this.powerupTimers = {
      magnet: 0,
      multiplier: 0,
      jetpack: 0,
      sneakers: 0,
      hoverboard: 0,
    };

    this.runner.hoverboard.visible = false;
    this.runner.jetpackUnit.visible = false;
    this.runner.bodyPivot.rotation.set(0, 0, 0);
    this.runner.bodyPivot.scale.set(1, 1, 1);

    // Pre-populate ahead
    while (this.nextSpawnZ > -180) {
      this.spawnNextPattern();
    }

    sound.playSwipe();
    this.emitHud();
  }

  public pause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.emitHud();
    }
  }

  public resume(): void {
    if (this.phase === 'paused') {
      this.phase = 'playing';
      this.lastTime = performance.now();
      this.emitHud();
    }
  }

  public returnToMenu(): void {
    this.clearDynamicEntities();
    this.phase = 'menu';
    this.targetLane = 0;
    this.playerX = 0;
    this.playerY = 0;
    this.playerVy = 0;
    this.rollTimer = 0;
    this.powerupTimers = {
      magnet: 0,
      multiplier: 0,
      jetpack: 0,
      sneakers: 0,
      hoverboard: 0,
    };
    this.runner.hoverboard.visible = false;
    this.runner.jetpackUnit.visible = false;
    this.emitHud();
  }

  public triggerLaneChange(dir: -1 | 1): void {
    if (this.phase !== 'playing') return;
    const next = THREE.MathUtils.clamp(this.targetLane + dir, -1, 1);
    if (next !== this.targetLane) {
      this.prevLane = this.targetLane;
      this.targetLane = next;
      this.laneTilt = -dir * 0.34;
      sound.playSwipe();
    }
  }

  public triggerJump(): void {
    if (this.phase !== 'playing') return;
    if (this.powerupTimers.jetpack > 0) return;
    this.jumpBufferTimer = 0.14;
  }

  public triggerRoll(): void {
    if (this.phase !== 'playing') return;
    if (this.powerupTimers.jetpack > 0) return;
    if (!this.grounded && this.playerY > 0.2) {
      this.fastFall = true;
      this.playerVy = Math.min(this.playerVy, -28);
    }
    this.rollTimer = ROLL_DURATION;
    sound.playRoll();
  }

  public activateHoverboard(): void {
    if (this.phase !== 'playing') return;
    if (this.powerupTimers.hoverboard > 0) return;
    if (this.saveData.hoverboards <= 0) {
      this.showEvent('No hoverboards left');
      return;
    }
    this.powerupTimers.hoverboard = 30;
    this.runner.hoverboard.visible = true;
    this.callbacks.onBoardConsumed();
    sound.playBoardActivate();
    this.spawnBurst(this.playerX, this.playerY + 0.4, 0, 0x38bdf8, 18);
    this.showEvent('Hoverboard Active');
    this.emitHud();
  }

  private showEvent(text: string): void {
    this.lastEventText = text;
    this.eventBannerTimer = 2.0;
  }

  private getDurations(): PowerupDurations {
    return {
      magnet: getUpgradeDuration('magnet', this.saveData.upgrades.magnet),
      multiplier: getUpgradeDuration('multiplier', this.saveData.upgrades.multiplier),
      jetpack: getUpgradeDuration('jetpack', this.saveData.upgrades.jetpack),
      sneakers: getUpgradeDuration('sneakers', this.saveData.upgrades.sneakers),
      hoverboard: 30,
    };
  }

  private initRendererAndScene(): void {
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.2, 260);
    this.camera.position.set(0, 5.2, 8.6);
    this.camera.lookAt(0, 1.8, -10);

    // Sky gradient background + matching horizon fog
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4;
    skyCanvas.height = 256;
    const sctx = skyCanvas.getContext('2d')!;
    const grad = sctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0ea5e9');
    grad.addColorStop(0.55, '#7dd3fc');
    grad.addColorStop(1, '#e0f2fe');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 4, 256);
    this.skyGradTex = new THREE.CanvasTexture(skyCanvas);
    this.skyGradTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyGradTex;
    this.scene.fog = new THREE.FogExp2(0xcbe8f8, 0.0095);

    // Studio IBL reflections via RoomEnvironment
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRenderTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    pmrem.dispose();

    // 3-point warm/cool lighting rig
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x334155, 0.85);
    this.scene.add(hemi);

    this.dirLight = new THREE.DirectionalLight(0xfffbeb, 1.9);
    this.dirLight.position.set(16, 28, 18);
    this.dirLight.castShadow = !this.isSoftwareGl;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 90;
    const d = 22;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    this.dirLight.shadow.normalBias = 0.02;
    this.scene.add(this.dirLight);

    const rimLight = new THREE.DirectionalLight(0xbae6fd, 0.65);
    rimLight.position.set(-14, 12, -24);
    this.scene.add(rimLight);

    this.mats = createMaterialLibrary(this.renderer, this.isSoftwareGl);
  }

  private initEnvironment(): void {
    const sleeperGeo = new THREE.BoxGeometry(1.75, 0.08, 0.28);
    const railGeo = new THREE.BoxGeometry(0.11, 0.14, CHUNK_LENGTH);
    const wallGeo = new THREE.BoxGeometry(1.1, 1.35, CHUNK_LENGTH);
    const stripGeo = new THREE.BoxGeometry(0.18, 0.06, CHUNK_LENGTH);
    const pillarGeo = new THREE.BoxGeometry(0.32, 6.8, 0.32);
    const beamGeo = new THREE.BoxGeometry(12.8, 0.35, 0.42);
    const lampBulbMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xfde68a,
      emissiveIntensity: 1.6,
    });
    const safetyMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.45,
    });

    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk = new THREE.Group();
      chunk.position.z = 14 - i * CHUNK_LENGTH;

      // Ground ballast bed
      const bed = new THREE.Mesh(
        new THREE.PlaneGeometry(11.4, CHUNK_LENGTH),
        this.mats.trackBed,
      );
      bed.rotation.x = -Math.PI / 2;
      bed.receiveShadow = true;
      chunk.add(bed);

      // Extended outer city ground aprons so no void edges show
      const apronL = new THREE.Mesh(
        new THREE.PlaneGeometry(36, CHUNK_LENGTH),
        this.mats.concreteWall,
      );
      apronL.rotation.x = -Math.PI / 2;
      apronL.position.set(-24, -0.04, 0);
      chunk.add(apronL);

      const apronR = apronL.clone();
      apronR.position.set(24, -0.04, 0);
      chunk.add(apronR);

      // 3 Lanes of steel rails & instanced sleepers
      const sleeperCount = 3 * 16;
      const sleepers = new THREE.InstancedMesh(sleeperGeo, this.mats.woodSleeper, sleeperCount);
      sleepers.receiveShadow = true;
      let idx = 0;
      for (const lane of [-1, 0, 1]) {
        const lx = lane * LANE_WIDTH;
        const railL = new THREE.Mesh(railGeo, this.mats.steelRail);
        railL.position.set(lx - 0.66, 0.08, 0);
        chunk.add(railL);

        const railR = new THREE.Mesh(railGeo, this.mats.steelRail);
        railR.position.set(lx + 0.66, 0.08, 0);
        chunk.add(railR);

        for (let s = 0; s < 16; s++) {
          const sz = -CHUNK_LENGTH / 2 + (s + 0.5) * (CHUNK_LENGTH / 16);
          _mat4.makeTranslation(lx, 0.04, sz);
          sleepers.setMatrixAt(idx++, _mat4);
        }
      }
      sleepers.instanceMatrix.needsUpdate = true;
      sleepers.computeBoundingSphere();
      chunk.add(sleepers);

      // Left & right platform retaining walls + yellow safety line
      [-6.1, 6.1].forEach((wx) => {
        const wall = new THREE.Mesh(wallGeo, this.mats.concreteWall);
        wall.position.set(wx, 0.66, 0);
        wall.receiveShadow = true;
        chunk.add(wall);

        const strip = new THREE.Mesh(stripGeo, safetyMat);
        strip.position.set(wx > 0 ? wx - 0.48 : wx + 0.48, 1.35, 0);
        chunk.add(strip);
      });

      // Overhead catenary gantry arch
      const pL = new THREE.Mesh(pillarGeo, this.mats.gantryMetal);
      pL.position.set(-6.05, 3.4, 0);
      pL.castShadow = true;
      chunk.add(pL);

      const pR = new THREE.Mesh(pillarGeo, this.mats.gantryMetal);
      pR.position.set(6.05, 3.4, 0);
      pR.castShadow = true;
      chunk.add(pR);

      const beam = new THREE.Mesh(beamGeo, this.mats.gantryMetal);
      beam.position.set(0, 6.75, 0);
      chunk.add(beam);

      [-3.2, 3.2].forEach((lx) => {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.14, 0.35), lampBulbMat);
        lamp.position.set(lx, 6.52, 0);
        chunk.add(lamp);
      });

      // Flanking urban skyline buildings (offset outside platforms)
      [-1, 1].forEach((side) => {
        for (let b = 0; b < 2; b++) {
          const bw = 6 + ((i * 3 + b) % 4) * 1.4;
          const bh = 12 + ((i * 5 + b * 3 + (side > 0 ? 2 : 0)) % 14);
          const bd = 11.5;
          const facade = this.mats.buildingFacades[(i + b + (side > 0 ? 1 : 0)) % this.mats.buildingFacades.length];
          const bldg = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), facade);
          bldg.position.set(side * (10.5 + bw / 2), bh / 2 - 0.1, -CHUNK_LENGTH / 4 + b * (CHUNK_LENGTH / 2));
          chunk.add(bldg);
        }
      });

      this.scene.add(chunk);
      this.chunks.push(chunk);
    }
  }

  private initActorsAndParticles(): void {
    this.runner = buildRunnerRig(getSkinById(this.saveData.selectedSkin));
    this.runner.root.position.set(0, 0, 0);
    this.scene.add(this.runner.root);

    this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.45), this.mats.contactShadow);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.set(0, 0.03, 0);
    this.scene.add(this.contactShadow);

    this.inspector = buildInspectorRig();
    this.inspector.root.position.set(0, 0, 3.8);
    this.scene.add(this.inspector.root);

    // Pre-allocated InstancedMesh particle pool
    const pGeo = new THREE.OctahedronGeometry(0.16, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_COUNT);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        size: 1,
        colorHex: 0xfacc15,
      });
      _mat4.makeScale(0, 0, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(0xfacc15));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.particleMesh);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private spawnBurst(x: number, y: number, z: number, colorHex: number, count: number): void {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x + (Math.random() - 0.5) * 0.4;
        p.y = y + (Math.random() - 0.5) * 0.4;
        p.z = z + (Math.random() - 0.5) * 0.4;
        p.vx = (Math.random() - 0.5) * 7.5;
        p.vy = 2.0 + Math.random() * 6.5;
        p.vz = (Math.random() - 0.5) * 6.0;
        p.maxLife = 0.35 + Math.random() * 0.35;
        p.life = p.maxLife;
        p.size = 0.7 + Math.random() * 0.9;
        p.colorHex = colorHex;
        spawned++;
      }
    }
  }

  private clearDynamicEntities(): void {
    for (const o of this.obstacles) this.scene.remove(o.mesh);
    for (const c of this.coins) this.scene.remove(c.mesh);
    for (const p of this.powerups) this.scene.remove(p.mesh);
    this.obstacles = [];
    this.coins = [];
    this.powerups = [];
  }

  private spawnCoinLine(lane: number, zStart: number, count: number, spacing: number, yBase = 0.95, arcHeight = 0): void {
    for (let i = 0; i < count; i++) {
      const z = zStart - i * spacing;
      const frac = count > 1 ? i / (count - 1) : 0.5;
      const y = yBase + Math.sin(frac * Math.PI) * arcHeight;
      const mesh = buildCoinMesh(this.mats);
      mesh.position.set(lane * LANE_WIDTH, y, z);
      this.scene.add(mesh);
      this.coins.push({
        lane,
        x: lane * LANE_WIDTH,
        y,
        z,
        collected: false,
        aerial: yBase > 5,
        mesh,
      });
    }
  }

  private spawnRampCoins(lane: number, trainCenterZ: number): void {
    // Coins climbing the ramp + running across train roof
    const rampBottomZ = trainCenterZ + TRAIN_LENGTH / 2 + RAMP_LENGTH;
    for (let i = 0; i < 4; i++) {
      const frac = (i + 0.5) / 4;
      const z = rampBottomZ - frac * RAMP_LENGTH;
      const y = frac * TRAIN_HEIGHT + 0.95;
      const mesh = buildCoinMesh(this.mats);
      mesh.position.set(lane * LANE_WIDTH, y, z);
      this.scene.add(mesh);
      this.coins.push({ lane, x: lane * LANE_WIDTH, y, z, collected: false, aerial: false, mesh });
    }
    this.spawnCoinLine(lane, trainCenterZ + TRAIN_LENGTH / 2 - 1.5, 5, 2.7, TRAIN_HEIGHT + 0.95, 0);
  }

  private maybeSpawnPowerup(lane: number, z: number, y = 1.15): void {
    const kinds: PowerupKind[] = ['magnet', 'multiplier', 'jetpack', 'sneakers'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const mesh = buildPowerupGroup(kind);
    mesh.position.set(lane * LANE_WIDTH, y, z);
    this.scene.add(mesh);
    this.powerups.push({ kind, lane, y, z, collected: false, mesh });
  }

  private spawnNextPattern(): void {
    const zBase = this.nextSpawnZ;
    const roll = Math.random();
    const lanes = [-1, 0, 1];
    // Shuffle lanes helper
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }

    if (roll < 0.28) {
      // Pattern 1: Parked train with front ramp (climb onto roof!) + barrier on open lane
      const trainLane = lanes[0];
      const trainMesh = buildTrainCar(this.mats, Math.floor(Math.random() * 4), true);
      const centerZ = zBase - 14;
      trainMesh.position.set(trainLane * LANE_WIDTH, 0, centerZ);
      this.scene.add(trainMesh);
      this.obstacles.push({
        id: this.nextObstacleId++,
        kind: 'train',
        lane: trainLane,
        z: centerZ,
        length: TRAIN_LENGTH,
        hasRamp: true,
        extraSpeed: 0,
        mesh: trainMesh,
      });
      this.spawnRampCoins(trainLane, centerZ);

      // Add a barrier in another lane
      const bLane = lanes[1];
      const bKind: BarrierKind = Math.random() < 0.5 ? 'low' : 'high';
      const bMesh = buildBarrier(this.mats, bKind);
      bMesh.position.set(bLane * LANE_WIDTH, 0, centerZ + 4);
      this.scene.add(bMesh);
      this.obstacles.push({
        id: this.nextObstacleId++,
        kind: 'barrier',
        barrierKind: bKind,
        lane: bLane,
        z: centerZ + 4,
        length: 1.0,
        hasRamp: false,
        extraSpeed: 0,
        mesh: bMesh,
      });
      this.spawnCoinLine(lanes[2], zBase - 4, 6, 3.0);

      if (Math.random() < 0.34) {
        this.maybeSpawnPowerup(trainLane, centerZ - TRAIN_LENGTH / 2 + 1.5, TRAIN_HEIGHT + 1.25);
      }
      this.nextSpawnZ -= 36;
    } else if (roll < 0.52) {
      // Pattern 2: Moving oncoming express train + safe coin lanes!
      const movingLane = lanes[0];
      const trainMesh = buildTrainCar(this.mats, Math.floor(Math.random() * 4), false);
      const centerZ = zBase - 24;
      trainMesh.position.set(movingLane * LANE_WIDTH, 0, centerZ);
      this.scene.add(trainMesh);
      this.obstacles.push({
        id: this.nextObstacleId++,
        kind: 'train',
        lane: movingLane,
        z: centerZ,
        length: TRAIN_LENGTH,
        hasRamp: false,
        extraSpeed: 13 + Math.min(10, this.distance * 0.004),
        mesh: trainMesh,
      });

      const coinLane = lanes[1];
      this.spawnCoinLine(coinLane, zBase - 4, 6, 2.8);

      const thirdLane = lanes[2];
      const bKind: BarrierKind = Math.random() < 0.55 ? 'low' : 'high';
      const bMesh = buildBarrier(this.mats, bKind);
      bMesh.position.set(thirdLane * LANE_WIDTH, 0, zBase - 14);
      this.scene.add(bMesh);
      this.obstacles.push({
        id: this.nextObstacleId++,
        kind: 'barrier',
        barrierKind: bKind,
        lane: thirdLane,
        z: zBase - 14,
        length: 1.0,
        hasRamp: false,
        extraSpeed: 0,
        mesh: bMesh,
      });
      if (Math.random() < 0.28) {
        this.maybeSpawnPowerup(coinLane, zBase - 23, 1.15);
      }
      this.nextSpawnZ -= 38;
    } else if (roll < 0.76) {
      // Pattern 3: Two trains side-by-side (one with ramp!) + open slalom lane
      const rampLane = lanes[0];
      const blockLane = lanes[1];
      const openLane = lanes[2];
      const centerZ = zBase - 15;

      const t1 = buildTrainCar(this.mats, 0, true);
      t1.position.set(rampLane * LANE_WIDTH, 0, centerZ);
      this.scene.add(t1);
      this.obstacles.push({
        id: this.nextObstacleId++,
        kind: 'train',
        lane: rampLane,
        z: centerZ,
        length: TRAIN_LENGTH,
        hasRamp: true,
        extraSpeed: 0,
        mesh: t1,
      });
      this.spawnRampCoins(rampLane, centerZ);

      const t2 = buildTrainCar(this.mats, 1, false);
      t2.position.set(blockLane * LANE_WIDTH, 0, centerZ - 2);
      this.scene.add(t2);
      this.obstacles.push({
        id: this.nextObstacleId++,
        kind: 'train',
        lane: blockLane,
        z: centerZ - 2,
        length: TRAIN_LENGTH,
        hasRamp: false,
        extraSpeed: 0,
        mesh: t2,
      });

      this.spawnCoinLine(openLane, zBase - 3, 7, 3.0);
      if (Math.random() < 0.3) {
        this.maybeSpawnPowerup(openLane, centerZ - 10, 1.15);
      }
      this.nextSpawnZ -= 38;
    } else {
      // Pattern 4: Jump & Roll hurdle gauntlet across lanes
      const b1Lane = lanes[0];
      const b2Lane = lanes[1];
      const b3Lane = lanes[2];

      const k1: BarrierKind = 'low';
      const k2: BarrierKind = 'high';
      const k3: BarrierKind = Math.random() < 0.5 ? 'tall' : 'low';

      const m1 = buildBarrier(this.mats, k1);
      m1.position.set(b1Lane * LANE_WIDTH, 0, zBase - 8);
      this.scene.add(m1);
      this.obstacles.push({
        id: this.nextObstacleId++,
        kind: 'barrier',
        barrierKind: k1,
        lane: b1Lane,
        z: zBase - 8,
        length: 1.0,
        hasRamp: false,
        extraSpeed: 0,
        mesh: m1,
      });
      this.spawnCoinLine(b1Lane, zBase - 4, 5, 2.0, 1.1, 1.6); // Coin arc over low barrier!

      const m2 = buildBarrier(this.mats, k2);
      m2.position.set(b2Lane * LANE_WIDTH, 0, zBase - 14);
      this.scene.add(m2);
      this.obstacles.push({
        id: this.nextObstacleId++,
        kind: 'barrier',
        barrierKind: k2,
        lane: b2Lane,
        z: zBase - 14,
        length: 1.0,
        hasRamp: false,
        extraSpeed: 0,
        mesh: m2,
      });
      this.spawnCoinLine(b2Lane, zBase - 9, 5, 2.2, 0.75, 0);

      const m3 = buildBarrier(this.mats, k3);
      m3.position.set(b3Lane * LANE_WIDTH, 0, zBase - 20);
      this.scene.add(m3);
      this.obstacles.push({
        id: this.nextObstacleId++,
        kind: 'barrier',
        barrierKind: k3,
        lane: b3Lane,
        z: zBase - 20,
        length: 1.0,
        hasRamp: false,
        extraSpeed: 0,
        mesh: m3,
      });

      if (Math.random() < 0.25) {
        this.maybeSpawnPowerup(b2Lane, zBase - 24, 1.15);
      }
      this.nextSpawnZ -= 32;
    }
  }

  private getSurfaceHeightAtPlayer(): number {
    let highest = 0;
    for (const obs of this.obstacles) {
      if (obs.kind !== 'train') continue;
      if (Math.abs(this.playerX - obs.lane * LANE_WIDTH) > TRAIN_WIDTH * 0.52) continue;

      const halfL = obs.length / 2;
      const frontZ = obs.z + halfL;
      const backZ = obs.z - halfL;

      if (0 >= backZ - 0.35 && 0 <= frontZ + 0.35) {
        if (this.playerY >= TRAIN_HEIGHT - 0.78) {
          highest = Math.max(highest, TRAIN_HEIGHT);
        }
      } else if (obs.hasRamp) {
        const rampEndZ = frontZ + RAMP_LENGTH;
        if (0 >= frontZ && 0 <= rampEndZ) {
          const t = THREE.MathUtils.clamp((rampEndZ - 0) / RAMP_LENGTH, 0, 1);
          const rampY = t * TRAIN_HEIGHT;
          if (this.playerY >= rampY - 0.85) {
            highest = Math.max(highest, rampY);
          }
        }
      }
    }
    return highest;
  }

  private handleCrashOrShield(sideGraze: boolean): void {
    if (this.invulnTimer > 0) return;

    if (this.powerupTimers.hoverboard > 0) {
      // Hoverboard absorbs crash!
      this.powerupTimers.hoverboard = 0;
      this.runner.hoverboard.visible = false;
      this.invulnTimer = 1.6;
      this.cameraShake = 0.55;
      sound.playShieldBreak();
      this.spawnBurst(this.playerX, this.playerY + 0.8, 0, 0x38bdf8, 28);
      this.showEvent('Hoverboard Saved You!');

      // Clear nearby obstacles so player doesn't immediately re-collide
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const o = this.obstacles[i];
        if (o.z > -22 && o.z < 14) {
          this.scene.remove(o.mesh);
          this.obstacles.splice(i, 1);
        }
      }
      return;
    }

    if (sideGraze && this.stumbleTimer <= 0) {
      // First side graze = stumble & push back to previous lane!
      this.targetLane = this.prevLane;
      this.stumbleTimer = 5.5;
      this.invulnTimer = 0.75;
      this.cameraShake = 0.32;
      sound.playStumble();
      this.showEvent('Close Call!');
      return;
    }

    // Full Game Over
    this.phase = 'gameover';
    this.cameraShake = 0.75;
    sound.playCrash();
    this.spawnBurst(this.playerX, this.playerY + 1.0, 0, 0xf97316, 30);
    this.callbacks.onRunFinished({
      score: Math.floor(this.score),
      coins: this.runCoins,
      distance: Math.floor(this.distance),
    });
    this.emitHud();
  }

  private updatePlaying(dt: number): void {
    // Speed ramp with distance
    const targetSpeed = Math.min(MAX_SPEED, BASE_SPEED + this.distance * 0.011);
    const activeSpeed = this.powerupTimers.jetpack > 0 ? targetSpeed * 1.4 : targetSpeed;
    this.speed = THREE.MathUtils.damp(this.speed, activeSpeed, 3.5, dt);

    const dz = this.speed * dt;
    this.distance += dz;

    const mult = this.powerupTimers.multiplier > 0 ? 2 : 1;
    this.score += dz * 1.2 * mult;

    // Powerup timers
    (Object.keys(this.powerupTimers) as (keyof ActivePowerups)[]).forEach((k) => {
      if (this.powerupTimers[k] > 0) {
        this.powerupTimers[k] = Math.max(0, this.powerupTimers[k] - dt);
        if (k === 'hoverboard' && this.powerupTimers[k] === 0) {
          this.runner.hoverboard.visible = false;
        }
        if (k === 'jetpack' && this.powerupTimers[k] === 0) {
          this.runner.jetpackUnit.visible = false;
          this.invulnTimer = Math.max(this.invulnTimer, 1.8);
        }
      }
    });

    if (this.stumbleTimer > 0) this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.eventBannerTimer > 0) {
      this.eventBannerTimer = Math.max(0, this.eventBannerTimer - dt);
      if (this.eventBannerTimer === 0) this.lastEventText = null;
    }

    // Lane movement & tilt
    const targetX = this.targetLane * LANE_WIDTH;
    this.playerX = THREE.MathUtils.damp(this.playerX, targetX, 16, dt);
    this.laneTilt = THREE.MathUtils.damp(this.laneTilt, 0, 12, dt);

    // Roll timer
    if (this.rollTimer > 0) {
      this.rollTimer = Math.max(0, this.rollTimer - dt);
    }

    // Vertical physics (Jetpack vs normal jump/gravity)
    if (this.powerupTimers.jetpack > 0) {
      this.playerY = THREE.MathUtils.damp(this.playerY, JETPACK_HEIGHT, 6, dt);
      this.playerVy = 0;
      this.grounded = false;
      this.rollTimer = 0;
      this.runner.jetpackUnit.visible = true;

      // Exhaust particles
      if (Math.random() < 0.7) {
        this.spawnBurst(this.playerX, this.playerY + 0.6, 0.35, 0xf97316, 2);
      }

      // Spawn aerial coin waves while flying
      this.aerialSpawnTimer -= dt;
      if (this.aerialSpawnTimer <= 0) {
        this.aerialSpawnTimer = 0.55;
        const flyLane = [-1, 0, 1][Math.floor(Math.random() * 3)];
        this.spawnCoinLine(flyLane, -95, 5, 3.0, JETPACK_HEIGHT + 0.85, 0);
      }
    } else {
      const surfaceY = this.getSurfaceHeightAtPlayer();
      if (this.grounded) {
        this.coyoteTimer = 0.09;
      } else {
        this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
      }

      if (this.jumpBufferTimer > 0) {
        this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
        if (this.grounded || this.coyoteTimer > 0) {
          const hasSneakers = this.powerupTimers.sneakers > 0;
          this.playerVy = hasSneakers ? SUPER_JUMP_VELOCITY : JUMP_VELOCITY;
          this.grounded = false;
          this.coyoteTimer = 0;
          this.jumpBufferTimer = 0;
          this.rollTimer = 0;
          this.fastFall = false;
          sound.playJump(hasSneakers);
        }
      }

      this.playerVy += (this.fastFall ? GRAVITY * 1.9 : GRAVITY) * dt;
      this.playerY += this.playerVy * dt;

      if (this.playerY <= surfaceY) {
        this.playerY = surfaceY;
        this.playerVy = 0;
        this.grounded = true;
        this.fastFall = false;
      } else {
        this.grounded = false;
      }
    }

    // Hoverboard hover sparks
    if (this.powerupTimers.hoverboard > 0 && Math.random() < 0.45) {
      this.spawnBurst(this.playerX, this.playerY + 0.12, 0.7, 0x38bdf8, 1);
    }

    // Scroll track chunks infinitely
    for (const chunk of this.chunks) {
      chunk.position.z += dz;
      if (chunk.position.z > 28) {
        chunk.position.z -= CHUNK_COUNT * CHUNK_LENGTH;
      }
    }

    // Scroll & check obstacles
    this.nextSpawnZ += dz;
    while (this.nextSpawnZ > -185) {
      this.spawnNextPattern();
    }

    const playerBottom = this.playerY;
    const playerTop = this.playerY + (this.rollTimer > 0 ? 0.92 : 1.92);

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.z += dz + obs.extraSpeed * dt;
      obs.mesh.position.z = obs.z;

      if (obs.z > 26) {
        this.scene.remove(obs.mesh);
        this.obstacles.splice(i, 1);
        continue;
      }

      if (this.powerupTimers.jetpack > 0) continue;

      const obsX = obs.lane * LANE_WIDTH;
      const dx = Math.abs(this.playerX - obsX);

      if (obs.kind === 'train') {
        const halfL = obs.length / 2;
        const frontZ = obs.z + halfL;
        const backZ = obs.z - halfL;
        if (dx < 1.15 && 0 > backZ - 0.3 && 0 < frontZ + 0.3) {
          if (playerBottom < TRAIN_HEIGHT - 0.72) {
            // Check if player hit front face vs side wall
            const wasInSameLane = Math.abs(this.targetLane * LANE_WIDTH - obsX) < 0.5 && Math.abs(this.prevLane - obs.lane) > 0 && dx > 0.72;
            const hitHeadOn = frontZ < 2.2 && !obs.hasRamp;
            this.handleCrashOrShield(!hitHeadOn && wasInSameLane);
            if (this.phase !== 'playing') return;
          }
        }
      } else if (obs.kind === 'barrier') {
        if (dx < 1.05 && Math.abs(obs.z) < 0.65) {
          if (obs.barrierKind === 'low') {
            if (playerBottom < 1.02) {
              this.handleCrashOrShield(false);
              if (this.phase !== 'playing') return;
            }
          } else if (obs.barrierKind === 'high') {
            // Clearance under overhead gate is 1.25m
            if (playerTop > 1.28) {
              this.handleCrashOrShield(false);
              if (this.phase !== 'playing') return;
            }
          } else {
            // 'tall' barrier blocks full height
            if (playerBottom < 2.65) {
              this.handleCrashOrShield(false);
              if (this.phase !== 'playing') return;
            }
          }
        }
      }
    }

    // Update & collect coins (with magnet pull!)
    const magnetOn = this.powerupTimers.magnet > 0;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.z += dz;

      if (c.z > 22 || c.collected) {
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
        continue;
      }

      if (magnetOn && c.z > -22 && c.z < 4) {
        c.x = THREE.MathUtils.damp(c.x, this.playerX, 11, dt);
        c.y = THREE.MathUtils.damp(c.y, this.playerY + 1.05, 11, dt);
        c.z = THREE.MathUtils.damp(c.z, 0, 11, dt);
      }

      c.mesh.position.set(c.x, c.y + Math.sin(this.elapsed * 5 + c.z * 0.4) * 0.08, c.z);
      c.mesh.rotation.y += dt * 3.8;

      const distSq =
        (c.x - this.playerX) * (c.x - this.playerX) +
        (c.y - (this.playerY + 1.0)) * (c.y - (this.playerY + 1.0)) +
        c.z * c.z;
      if (distSq < 1.85) {
        c.collected = true;
        this.runCoins += 1;
        this.score += 10 * mult;
        sound.playCoin();
        this.spawnBurst(c.x, c.y, c.z, 0xfacc15, 7);
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
      }
    }

    // Update & collect powerups
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.z += dz;
      p.mesh.position.set(p.lane * LANE_WIDTH, p.y + Math.sin(this.elapsed * 4) * 0.16, p.z);
      p.mesh.rotation.y += dt * 2.5;

      if (p.z > 20 || p.collected) {
        this.scene.remove(p.mesh);
        this.powerups.splice(i, 1);
        continue;
      }

      const px = p.lane * LANE_WIDTH;
      const distSq =
        (px - this.playerX) * (px - this.playerX) +
        (p.y - (this.playerY + 1.05)) * (p.y - (this.playerY + 1.05)) +
        p.z * p.z;
      if (distSq < 2.2) {
        p.collected = true;
        const durations = this.getDurations();
        this.powerupTimers[p.kind] = durations[p.kind];
        sound.playPowerup();
        const burstColor =
          p.kind === 'magnet'
            ? 0xef4444
            : p.kind === 'multiplier'
              ? 0x3b82f6
              : p.kind === 'jetpack'
                ? 0xf97316
                : 0x10b981;
        this.spawnBurst(px, p.y, p.z, burstColor, 20);
        const labels: Record<PowerupKind, string> = {
          magnet: 'Coin Magnet!',
          multiplier: '2x Score Multiplier!',
          jetpack: 'Jetpack Boost!',
          sneakers: 'Super Sneakers!',
        };
        this.showEvent(labels[p.kind]);
        this.scene.remove(p.mesh);
        this.powerups.splice(i, 1);
      }
    }
  }

  private updateRunnerVisuals(dt: number): void {
    this.runner.root.position.set(this.playerX, this.playerY, 0);

    // Contact shadow tracks surface beneath runner
    const shadowY = this.powerupTimers.jetpack > 0 ? 0.03 : this.getSurfaceHeightAtPlayer() + 0.03;
    this.contactShadow.position.set(this.playerX, shadowY, 0);
    const heightGap = Math.max(0, this.playerY - shadowY);
    const shadowScale = THREE.MathUtils.clamp(1 - heightGap * 0.12, 0.35, 1);
    this.contactShadow.scale.set(shadowScale, shadowScale, 1);

    // Runner limb animation
    const onBoard = this.powerupTimers.hoverboard > 0;
    const isRolling = this.rollTimer > 0;
    const isFlying = this.powerupTimers.jetpack > 0;

    if (this.phase === 'menu') {
      const idle = Math.sin(this.elapsed * 3.2);
      this.runner.bodyPivot.position.y = Math.abs(idle) * 0.04;
      this.runner.bodyPivot.rotation.set(0, 0.35, 0);
      this.runner.leftArm.rotation.x = idle * 0.2;
      this.runner.rightArm.rotation.x = -idle * 0.2;
      this.runner.leftLeg.rotation.x = 0;
      this.runner.rightLeg.rotation.x = 0;
    } else if (isRolling) {
      this.runner.bodyPivot.position.y = -0.36;
      this.runner.bodyPivot.rotation.set(-0.95, 0, this.laneTilt);
      this.runner.leftLeg.rotation.x = -0.4;
      this.runner.rightLeg.rotation.x = -0.4;
      this.runner.leftArm.rotation.x = 0.6;
      this.runner.rightArm.rotation.x = 0.6;
    } else if (onBoard) {
      this.runner.bodyPivot.position.y = 0.14 + Math.sin(this.elapsed * 7) * 0.03;
      this.runner.bodyPivot.rotation.set(0.08, -0.55, this.laneTilt * 1.3);
      this.runner.hoverboard.rotation.z = this.laneTilt * 1.4;
      this.runner.leftLeg.rotation.x = 0.18;
      this.runner.rightLeg.rotation.x = -0.18;
      this.runner.leftArm.rotation.x = 0.2;
      this.runner.rightArm.rotation.x = -0.3;
    } else if (isFlying || !this.grounded) {
      this.runner.bodyPivot.position.y = 0;
      this.runner.bodyPivot.rotation.set(isFlying ? 0.38 : 0.12, 0, this.laneTilt);
      this.runner.leftLeg.rotation.x = -0.45;
      this.runner.rightLeg.rotation.x = 0.35;
      this.runner.leftArm.rotation.x = -0.9;
      this.runner.rightArm.rotation.x = -0.9;
    } else {
      const strideFreq = 12 + (this.speed - BASE_SPEED) * 0.22;
      const swing = Math.sin(this.elapsed * strideFreq);
      this.runner.bodyPivot.position.y = Math.abs(Math.cos(this.elapsed * strideFreq)) * 0.09;
      this.runner.bodyPivot.rotation.set(0.14, 0, this.laneTilt);
      this.runner.leftLeg.rotation.x = swing * 0.95;
      this.runner.rightLeg.rotation.x = -swing * 0.95;
      this.runner.leftArm.rotation.x = -swing * 0.85;
      this.runner.rightArm.rotation.x = swing * 0.85;
    }

    // Invulnerability blink feedback
    this.runner.root.visible = this.invulnTimer > 0 ? Math.floor(this.elapsed * 18) % 2 === 0 : true;

    // Pursuer Inspector visibility & chase distance
    const showInspector = this.phase === 'playing' && this.stumbleTimer > 0;
    this.inspector.root.visible = showInspector || this.phase === 'gameover';
    if (this.inspector.root.visible) {
      const chaseZ = this.phase === 'gameover' ? 1.4 : 2.3 + (6.5 - this.stumbleTimer) * 0.7;
      this.inspector.root.position.x = THREE.MathUtils.damp(this.inspector.root.position.x, this.playerX, 8, dt);
      this.inspector.root.position.z = THREE.MathUtils.damp(this.inspector.root.position.z, chaseZ, 8, dt);
      const iswing = Math.sin(this.elapsed * 13);
      this.inspector.leftLeg.rotation.x = iswing * 0.85;
      this.inspector.rightLeg.rotation.x = -iswing * 0.85;
      this.inspector.leftArm.rotation.x = -iswing * 0.8;
      this.inspector.rightArm.rotation.x = iswing * 0.8;
    }

    // Camera choreography (smooth follow + dynamic FOV + screen shake)
    if (this.cameraShake > 0) this.cameraShake = Math.max(0, this.cameraShake - dt * 1.8);
    const shakeX = this.cameraShake > 0 ? (Math.random() - 0.5) * this.cameraShake * 0.65 : 0;
    const shakeY = this.cameraShake > 0 ? (Math.random() - 0.5) * this.cameraShake * 0.5 : 0;

    if (this.phase === 'menu') {
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, 1.9, 4, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, 2.5, 4, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, 5.2, 4, dt);
      this.camera.lookAt(0, 1.35, -1.5);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 56, 4, dt);
      this.camera.updateProjectionMatrix();
    } else {
      const targetCamX = this.playerX * 0.68 + shakeX;
      const targetCamY = this.playerY + 4.85 + shakeY;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 10, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 8, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, 8.2, 8, dt);
      this.camera.lookAt(this.playerX * 0.48, this.playerY + 1.65, -12);

      const speedFrac = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
      const targetFov = 61 + speedFrac * 11 + (this.powerupTimers.jetpack > 0 ? 6 : 0);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private updateParticles(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= 14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const s = p.size * (p.life / p.maxLife);
      _vec3.set(p.x, p.y, p.z);
      _scale.set(s, s, s);
      _quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.life * 6);
      _mat4.compose(_vec3, _quat, _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(p.colorHex));
    }
    if (anyChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private emitHud(): void {
    const mult = this.powerupTimers.multiplier > 0 ? 2 : 1;
    this.callbacks.onHudUpdate({
      phase: this.phase,
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      runCoins: this.runCoins,
      multiplierValue: mult,
      speedKmh: Math.round(this.speed * 2.2),
      powerups: { ...this.powerupTimers },
      durations: this.getDurations(),
      stumbleWarning: this.stumbleTimer > 0 && this.stumbleTimer < 5.5,
      hoverboardsLeft: this.saveData.hoverboards,
      lastEventText: this.lastEventText,
    });
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(rawDt, 0.05);

    if (this.phase === 'playing') {
      this.elapsed += dt;
      this.updatePlaying(dt);
      this.updateRunnerVisuals(dt);
      this.updateParticles(dt);
      this.hudEmitAccum += dt;
      if (this.hudEmitAccum >= 0.05) {
        this.hudEmitAccum = 0;
        this.emitHud();
      }
    } else if (this.phase === 'menu') {
      this.elapsed += dt;
      this.updateRunnerVisuals(dt);
    } else if (this.phase === 'gameover') {
      this.elapsed += dt;
      this.updateRunnerVisuals(dt);
      this.updateParticles(dt);
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  };

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private onResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      this.triggerLaneChange(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      this.triggerLaneChange(1);
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      this.triggerJump();
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      this.triggerRoll();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (this.phase === 'playing') this.activateHoverboard();
    } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (this.phase === 'playing') this.pause();
      else if (this.phase === 'paused') this.resume();
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.phase !== 'playing') return;
    sound.unlock();
    this.pointerActive = true;
    this.pointerStartX = e.clientX;
    this.pointerStartY = e.clientY;
    this.swipeConsumed = false;

    // Double-tap triggers hoverboard!
    const now = performance.now();
    if (now - this.lastTapTime < 280) {
      this.activateHoverboard();
      this.lastTapTime = 0;
    } else {
      this.lastTapTime = now;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pointerActive || this.swipeConsumed || this.phase !== 'playing') return;
    const dx = e.clientX - this.pointerStartX;
    const dy = e.clientY - this.pointerStartY;
    const threshold = 26;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    this.swipeConsumed = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.triggerLaneChange(dx > 0 ? 1 : -1);
    } else {
      if (dy < 0) this.triggerJump();
      else this.triggerRoll();
    }
  };

  private onPointerUp = (): void => {
    this.pointerActive = false;
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private onContextRestored = (): void => {
    this.callbacks.onContextLost(false);
  };

  private bindEvents(): void {
    const canvas = this.renderer.domElement;
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    const canvas = this.renderer.domElement;
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.clearDynamicEntities();
    this.mats.dispose();
    if (this.skyGradTex) this.skyGradTex.dispose();
    if (this.envRenderTarget) this.envRenderTarget.dispose();

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
