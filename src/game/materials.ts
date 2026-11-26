import * as THREE from 'three';

export interface MaterialLibrary {
  trackBed: THREE.MeshStandardMaterial;
  concreteWall: THREE.MeshStandardMaterial;
  steelRail: THREE.MeshStandardMaterial;
  woodSleeper: THREE.MeshStandardMaterial;
  gantryMetal: THREE.MeshStandardMaterial;
  trainSteel: THREE.MeshStandardMaterial;
  trainRoof: THREE.MeshStandardMaterial;
  trainGlass: THREE.MeshPhysicalMaterial;
  trainHeadlight: THREE.MeshStandardMaterial;
  trainTaillight: THREE.MeshStandardMaterial;
  trainBodies: THREE.MeshStandardMaterial[];
  rampStripe: THREE.MeshStandardMaterial;
  hazardStripe: THREE.MeshStandardMaterial;
  barrierMetal: THREE.MeshStandardMaterial;
  coinGold: THREE.MeshStandardMaterial;
  contactShadow: THREE.MeshBasicMaterial;
  buildingFacades: THREE.MeshStandardMaterial[];
  textures: THREE.Texture[];
  dispose: () => void;
}

function makeCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  maxAniso: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

export function createMaterialLibrary(renderer: THREE.WebGLRenderer, isSoftwareGl: boolean): MaterialLibrary {
  const maxAniso = isSoftwareGl ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const textures: THREE.Texture[] = [];

  // 1. Gravel & ballast railway bed texture (3 lanes)
  const trackTex = makeCanvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#2c303a';
      ctx.fillRect(0, 0, w, h);

      // Gravel speckles
      for (let i = 0; i < 4800; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const lum = 36 + Math.floor(Math.random() * 44);
        ctx.fillStyle = `rgb(${lum}, ${lum + 3}, ${lum + 8})`;
        ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
      }

      // Subtle darker ballast trenches under each of 3 lanes
      const laneCenters = [w * 0.19, w * 0.5, w * 0.81];
      for (const cx of laneCenters) {
        const grad = ctx.createLinearGradient(cx - 56, 0, cx + 56, 0);
        grad.addColorStop(0, 'rgba(15,18,24,0)');
        grad.addColorStop(0.5, 'rgba(15,18,24,0.45)');
        grad.addColorStop(1, 'rgba(15,18,24,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - 56, 0, 112, h);
      }
    },
    maxAniso,
    1,
    4,
  );
  textures.push(trackTex);

  // 2. Concrete retaining wall texture
  const concreteTex = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#475569';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1200; i++) {
        const v = 64 + Math.floor(Math.random() * 30);
        ctx.fillStyle = `rgba(${v},${v + 6},${v + 12},0.35)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      }
      ctx.strokeStyle = 'rgba(15,23,42,0.35)';
      ctx.lineWidth = 3;
      for (let y = 0; y <= h; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.strokeRect(2, 2, w - 4, h - 4);
    },
    maxAniso,
    1,
    1,
  );
  textures.push(concreteTex);

  // 3. Hazard chevron stripe texture for barriers & ramps
  const hazardTex = makeCanvasTexture(
    256,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#111827';
      const stripeW = 36;
      for (let x = -h; x < w + h; x += stripeW * 2) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + stripeW, 0);
        ctx.lineTo(x + stripeW - h, h);
        ctx.lineTo(x - h, h);
        ctx.closePath();
        ctx.fill();
      }
    },
    maxAniso,
    2,
    1,
  );
  textures.push(hazardTex);

  // 4. Ramp deck stripe texture
  const rampTex = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#f97316';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fb923c';
      for (let y = 24; y < h; y += 64) {
        ctx.beginPath();
        ctx.moveTo(w * 0.18, y + 32);
        ctx.lineTo(w * 0.5, y);
        ctx.lineTo(w * 0.82, y + 32);
        ctx.lineTo(w * 0.82, y + 48);
        ctx.lineTo(w * 0.5, y + 16);
        ctx.lineTo(w * 0.18, y + 48);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 18, h);
      ctx.fillRect(w - 18, 0, 18, h);
    },
    maxAniso,
    1,
    3,
  );
  textures.push(rampTex);

  // 5. Subway train side livery textures (4 distinct urban commuter palettes)
  const trainSchemes = [
    { body: '#dc2626', stripe: '#f8fafc', accent: '#fbbf24' }, // Classic Metro Red
    { body: '#0284c7', stripe: '#e0f2fe', accent: '#f97316' }, // Express Cyan-Blue
    { body: '#059669', stripe: '#ecfdf5', accent: '#facc15' }, // City Green Line
    { body: '#f59e0b', stripe: '#1e293b', accent: '#ef4444' }, // Gold Express
  ];

  const trainBodies = trainSchemes.map((scheme) => {
    const tex = makeCanvasTexture(
      512,
      256,
      (ctx, w, h) => {
        ctx.fillStyle = scheme.body;
        ctx.fillRect(0, 0, w, h);

        // Lower metallic skirt
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, h * 0.82, w, h * 0.18);

        // Racing stripe
        ctx.fillStyle = scheme.stripe;
        ctx.fillRect(0, h * 0.58, w, h * 0.11);
        ctx.fillStyle = scheme.accent;
        ctx.fillRect(0, h * 0.69, w, h * 0.035);

        // Passenger windows row
        for (let x = 22; x < w - 40; x += 62) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x, h * 0.22, 44, h * 0.28);
          ctx.fillStyle = '#38bdf8';
          ctx.globalAlpha = 0.22;
          ctx.fillRect(x + 4, h * 0.25, 16, h * 0.22);
          ctx.globalAlpha = 1;
        }

        // Ribbed panel seams
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, w - 4, h - 4);
      },
      maxAniso,
      2,
      1,
    );
    textures.push(tex);
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.36,
      metalness: 0.42,
    });
  });

  // 6. City building window facades (3 color variants)
  const buildingColors = [
    { wall: '#334155', lit: '#fde68a' },
    { wall: '#475569', lit: '#bae6fd' },
    { wall: '#3f3f46', lit: '#fed7aa' },
  ];
  const buildingFacades = buildingColors.map((b) => {
    const tex = makeCanvasTexture(
      256,
      512,
      (ctx, w, h) => {
        ctx.fillStyle = b.wall;
        ctx.fillRect(0, 0, w, h);
        for (let y = 18; y < h - 24; y += 36) {
          for (let x = 18; x < w - 24; x += 36) {
            const isLit = Math.random() > 0.45;
            ctx.fillStyle = isLit ? b.lit : '#1e293b';
            ctx.fillRect(x, y, 20, 22);
          }
        }
      },
      maxAniso,
      1,
      2,
    );
    textures.push(tex);
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.78,
      metalness: 0.1,
    });
  });

  // 7. Radial contact shadow texture (soft blob beneath runner)
  const shadowTex = makeCanvasTexture(
    128,
    128,
    (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(2, 6, 23, 0.72)');
      grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.32)');
      grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
    1,
    1,
    1,
  );
  textures.push(shadowTex);

  // 8. Gold coin embossed texture
  const coinTex = makeCanvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.38, 0, Math.PI * 2);
      ctx.stroke();

      // Inner star/bolt emblem
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(w * 0.55, h * 0.22);
      ctx.lineTo(w * 0.36, h * 0.54);
      ctx.lineTo(w * 0.5, h * 0.54);
      ctx.lineTo(w * 0.45, h * 0.78);
      ctx.lineTo(w * 0.65, h * 0.46);
      ctx.lineTo(w * 0.51, h * 0.46);
      ctx.closePath();
      ctx.fill();
    },
    maxAniso,
    1,
    1,
  );
  textures.push(coinTex);

  const trackBed = new THREE.MeshStandardMaterial({
    map: trackTex,
    roughness: 0.92,
    metalness: 0.05,
  });
  const concreteWall = new THREE.MeshStandardMaterial({
    map: concreteTex,
    roughness: 0.85,
    metalness: 0.05,
  });
  const steelRail = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    roughness: 0.26,
    metalness: 0.88,
  });
  const woodSleeper = new THREE.MeshStandardMaterial({
    color: 0x5c4033,
    roughness: 0.88,
    metalness: 0.04,
  });
  const gantryMetal = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.42,
    metalness: 0.72,
  });
  const trainSteel = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.32,
    metalness: 0.78,
  });
  const trainRoof = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.44,
    metalness: 0.62,
  });
  const trainGlass = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const trainHeadlight = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfef08a,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });
  const trainTaillight = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 1.8,
    roughness: 0.25,
  });
  const rampStripe = new THREE.MeshStandardMaterial({
    map: rampTex,
    roughness: 0.55,
    metalness: 0.22,
  });
  const hazardStripe = new THREE.MeshStandardMaterial({
    map: hazardTex,
    roughness: 0.5,
    metalness: 0.15,
  });
  const barrierMetal = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.45,
    metalness: 0.7,
  });
  const coinGold = new THREE.MeshStandardMaterial({
    map: coinTex,
    color: 0xfacc15,
    emissive: 0x854d0e,
    emissiveIntensity: 0.28,
    roughness: 0.22,
    metalness: 0.85,
  });
  const contactShadow = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.65,
  });

  const allMaterials: THREE.Material[] = [
    trackBed,
    concreteWall,
    steelRail,
    woodSleeper,
    gantryMetal,
    trainSteel,
    trainRoof,
    trainGlass,
    trainHeadlight,
    trainTaillight,
    rampStripe,
    hazardStripe,
    barrierMetal,
    coinGold,
    contactShadow,
    ...trainBodies,
    ...buildingFacades,
  ];

  return {
    trackBed,
    concreteWall,
    steelRail,
    woodSleeper,
    gantryMetal,
    trainSteel,
    trainRoof,
    trainGlass,
    trainHeadlight,
    trainTaillight,
    trainBodies,
    rampStripe,
    hazardStripe,
    barrierMetal,
    coinGold,
    contactShadow,
    buildingFacades,
    textures,
    dispose: () => {
      textures.forEach((t) => t.dispose());
      allMaterials.forEach((m) => m.dispose());
    },
  };
}
