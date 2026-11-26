import * as THREE from 'three';
import { MaterialLibrary } from './materials';
import { PowerupKind, RunnerSkin } from './types';

export interface RunnerRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  torso: THREE.Mesh;
  backpack: THREE.Mesh;
  head: THREE.Group;
  capDome: THREE.Mesh;
  capBrim: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftShoe: THREE.Mesh;
  rightShoe: THREE.Mesh;
  hoverboard: THREE.Group;
  boardDeck: THREE.Mesh;
  boardGlowMat: THREE.MeshStandardMaterial;
  jetpackUnit: THREE.Group;
  hoodieMat: THREE.MeshStandardMaterial;
  pantsMat: THREE.MeshStandardMaterial;
  shoeMat: THREE.MeshStandardMaterial;
  capMat: THREE.MeshStandardMaterial;
  boardMat: THREE.MeshStandardMaterial;
  applySkin: (skin: RunnerSkin) => void;
}

export function buildRunnerRig(skin: RunnerSkin): RunnerRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const hoodieMat = new THREE.MeshStandardMaterial({
    color: skin.hoodieColor,
    roughness: 0.72,
    metalness: 0.05,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: skin.pantsColor,
    roughness: 0.82,
    metalness: 0.04,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: skin.shoeColor,
    roughness: 0.42,
    metalness: 0.12,
  });
  const soleMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.55,
    metalness: 0.05,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xf1c27d,
    roughness: 0.65,
    metalness: 0.02,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: skin.capColor,
    roughness: 0.58,
    metalness: 0.1,
  });
  const packMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.68,
    metalness: 0.25,
  });

  // Torso (primary silhouette)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.76, 0.36), hoodieMat);
  torso.position.set(0, 1.18, 0);
  torso.castShadow = true;
  bodyPivot.add(torso);

  // Backpack (secondary read)
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.22), packMat);
  backpack.position.set(0, 1.2, 0.24);
  backpack.castShadow = true;
  bodyPivot.add(backpack);

  // Jetpack attachment (visible only when jetpack powerup is active)
  const jetpackUnit = new THREE.Group();
  jetpackUnit.position.set(0, 1.22, 0.28);
  const tankMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    roughness: 0.28,
    metalness: 0.75,
  });
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.3,
    metalness: 0.85,
  });
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xfde047,
    emissive: 0xf97316,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });
  [-0.14, 0.14].forEach((tx) => {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.52, 12), tankMat);
    tank.position.set(tx, 0, 0);
    jetpackUnit.add(tank);

    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.14, 10), nozzleMat);
    nozzle.position.set(tx, -0.31, 0);
    jetpackUnit.add(nozzle);

    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 10), flameMat);
    flame.rotation.x = Math.PI;
    flame.position.set(tx, -0.54, 0);
    jetpackUnit.add(flame);
  });
  jetpackUnit.visible = false;
  bodyPivot.add(jetpackUnit);

  // Head + Cap + Headphones (accent detail)
  const head = new THREE.Group();
  head.position.set(0, 1.78, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), skinMat);
  skull.castShadow = true;
  head.add(skull);

  const capDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.255, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
    capMat,
  );
  capDome.position.y = 0.04;
  head.add(capDome);

  const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.22), capMat);
  capBrim.position.set(0, 0.06, 0.22); // backwards cap facing +Z (toward camera) for cool runner style!
  head.add(capBrim);

  const bandMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.6 });
  const earL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), bandMat);
  earL.rotation.z = Math.PI / 2;
  earL.position.set(-0.25, 0, 0);
  head.add(earL);

  const earR = earL.clone();
  earR.position.set(0.25, 0, 0);
  head.add(earR);
  bodyPivot.add(head);

  // Arms (pivoted at shoulders)
  const makeArm = (side: -1 | 1): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.41, 1.48, 0);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.44, 0.18), hoodieMat);
    sleeve.position.y = -0.2;
    sleeve.castShadow = true;
    pivot.add(sleeve);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), skinMat);
    hand.position.y = -0.46;
    pivot.add(hand);
    return pivot;
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  bodyPivot.add(leftArm, rightArm);

  // Legs + Sneakers (pivoted at hips)
  const makeLeg = (side: -1 | 1): { pivot: THREE.Group; shoe: THREE.Mesh } => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.17, 0.82, 0);

    const trouser = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.56, 0.24), pantsMat);
    trouser.position.y = -0.28;
    trouser.castShadow = true;
    pivot.add(trouser);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.38), shoeMat);
    shoe.position.set(0, -0.62, -0.05);
    shoe.castShadow = true;
    pivot.add(shoe);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, 0.39), soleMat);
    sole.position.set(0, -0.7, -0.05);
    pivot.add(sole);

    return { pivot, shoe };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  bodyPivot.add(legL.pivot, legR.pivot);

  // Hoverboard (5-part composite deck)
  const hoverboard = new THREE.Group();
  hoverboard.position.set(0, 0.14, 0);
  const boardMat = new THREE.MeshStandardMaterial({
    color: skin.boardColor,
    roughness: 0.28,
    metalness: 0.45,
  });
  const boardGlowMat = new THREE.MeshStandardMaterial({
    color: skin.boardGlow,
    emissive: skin.boardGlow,
    emissiveIntensity: 1.9,
    roughness: 0.2,
  });

  const boardDeck = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.08, 1.85), boardMat);
  boardDeck.castShadow = true;
  hoverboard.add(boardDeck);

  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.08, 14), boardMat);
  nose.scale.set(1, 1, 0.7);
  nose.position.set(0, 0, -0.92);
  hoverboard.add(nose);

  const tail = nose.clone();
  tail.position.set(0, 0, 0.92);
  hoverboard.add(tail);

  [-0.38, 0.38].forEach((rx) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.72), boardGlowMat);
    rail.position.set(rx, -0.01, 0);
    hoverboard.add(rail);
  });

  const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.09, 12), boardGlowMat);
  thruster.position.set(0, -0.06, 0.45);
  hoverboard.add(thruster);

  hoverboard.visible = false;
  root.add(hoverboard);

  const applySkin = (newSkin: RunnerSkin) => {
    hoodieMat.color.set(newSkin.hoodieColor);
    pantsMat.color.set(newSkin.pantsColor);
    shoeMat.color.set(newSkin.shoeColor);
    capMat.color.set(newSkin.capColor);
    boardMat.color.set(newSkin.boardColor);
    boardGlowMat.color.set(newSkin.boardGlow);
    boardGlowMat.emissive.set(newSkin.boardGlow);
  };

  return {
    root,
    bodyPivot,
    torso,
    backpack,
    head,
    capDome,
    capBrim,
    leftArm,
    rightArm,
    leftLeg: legL.pivot,
    rightLeg: legR.pivot,
    leftShoe: legL.shoe,
    rightShoe: legR.shoe,
    hoverboard,
    boardDeck,
    boardGlowMat,
    jetpackUnit,
    hoodieMat,
    pantsMat,
    shoeMat,
    capMat,
    boardMat,
    applySkin,
  };
}

export interface InspectorRig {
  root: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

export function buildInspectorRig(): InspectorRig {
  const root = new THREE.Group();
  const coatMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.72, metalness: 0.1 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe6b88a, roughness: 0.65 });
  const badgeMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.85 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.84, 0.42), coatMat);
  torso.position.y = 1.24;
  torso.castShadow = true;
  root.add(torso);

  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8), badgeMat);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0.18, 1.4, -0.22);
  root.add(badge);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 12), skinMat);
  head.position.y = 1.88;
  root.add(head);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.25, 0.16, 14), coatMat);
  cap.position.y = 2.06;
  root.add(cap);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.2), pantsMat);
  visor.position.set(0, 1.98, -0.24);
  root.add(visor);

  const makeArm = (sx: number) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.46, 1.54, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.56, 0.2), coatMat);
    m.position.y = -0.24;
    g.add(m);
    root.add(g);
    return g;
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  const makeLeg = (sx: number) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.19, 0.84, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.78, 0.26), pantsMat);
    m.position.y = -0.39;
    g.add(m);
    root.add(g);
    return g;
  };
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  return { root, leftArm, rightArm, leftLeg, rightLeg };
}

export const TRAIN_WIDTH = 2.58;
export const TRAIN_HEIGHT = 3.55;
export const TRAIN_LENGTH = 14.5;
export const RAMP_LENGTH = 6.2;

export function buildTrainCar(
  mats: MaterialLibrary,
  variantIndex: number,
  withFrontRamp: boolean,
): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = mats.trainBodies[variantIndex % mats.trainBodies.length];

  // 1. Main passenger car hull
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_WIDTH, TRAIN_HEIGHT - 0.55, TRAIN_LENGTH),
    bodyMat,
  );
  hull.position.set(0, 0.45 + (TRAIN_HEIGHT - 0.55) / 2, 0);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // 2. Curved metallic roof cap + HVAC units (secondary read)
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_WIDTH - 0.16, 0.26, TRAIN_LENGTH - 0.1),
    mats.trainRoof,
  );
  roof.position.set(0, TRAIN_HEIGHT - 0.04, 0);
  roof.receiveShadow = true;
  group.add(roof);

  [-4.2, 0, 4.2].forEach((rz) => {
    const hvac = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 2.2), mats.trainSteel);
    hvac.position.set(0, TRAIN_HEIGHT + 0.14, rz);
    roof.receiveShadow = true;
    group.add(hvac);
  });

  // 3. Undercarriage bogies / wheel trucks
  [-4.6, 4.6].forEach((bz) => {
    const bogie = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.48, 2.6), mats.gantryMetal);
    bogie.position.set(0, 0.26, bz);
    group.add(bogie);
  });

  // 4. Front cab windshield & headlights (+Z faces oncoming player)
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.96, 1.05, 0.12), mats.trainGlass);
  windshield.position.set(0, 2.38, TRAIN_LENGTH / 2 + 0.02);
  group.add(windshield);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(TRAIN_WIDTH + 0.06, 0.35, 0.28), mats.hazardStripe);
  bumper.position.set(0, 0.62, TRAIN_LENGTH / 2 + 0.05);
  group.add(bumper);

  [-0.86, 0.86].forEach((hx) => {
    const headlight = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 14), mats.trainHeadlight);
    headlight.rotation.x = Math.PI / 2;
    headlight.position.set(hx, 1.18, TRAIN_LENGTH / 2 + 0.05);
    group.add(headlight);
  });

  // 5. Rear tail lights (-Z)
  [-0.86, 0.86].forEach((tx) => {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.08), mats.trainTaillight);
    tail.position.set(tx, 1.25, -TRAIN_LENGTH / 2 - 0.02);
    group.add(tail);
  });

  // 6. Optional climbable front ramp leading from ground (z = +TRAIN_LENGTH/2 + RAMP_LENGTH) up onto train roof!
  if (withFrontRamp) {
    const rampAngle = Math.atan2(TRAIN_HEIGHT, RAMP_LENGTH);
    const rampHyp = Math.hypot(TRAIN_HEIGHT, RAMP_LENGTH);
    const rampDeck = new THREE.Mesh(
      new THREE.BoxGeometry(TRAIN_WIDTH - 0.12, 0.24, rampHyp),
      mats.rampStripe,
    );
    rampDeck.position.set(0, TRAIN_HEIGHT / 2 - 0.05, TRAIN_LENGTH / 2 + RAMP_LENGTH / 2);
    rampDeck.rotation.x = rampAngle;
    rampDeck.castShadow = true;
    rampDeck.receiveShadow = true;
    group.add(rampDeck);

    // Support struts beneath the ramp
    const strut = new THREE.Mesh(
      new THREE.BoxGeometry(TRAIN_WIDTH - 0.5, TRAIN_HEIGHT * 0.55, 0.35),
      mats.gantryMetal,
    );
    strut.position.set(0, TRAIN_HEIGHT * 0.275, TRAIN_LENGTH / 2 + 1.2);
    group.add(strut);
  }

  return group;
}

export type BarrierKind = 'low' | 'high' | 'tall';

export function buildBarrier(mats: MaterialLibrary, kind: BarrierKind): THREE.Group {
  const group = new THREE.Group();

  if (kind === 'low') {
    // Jumpable hurdle barrier (~1.15m tall)
    [-1.08, 1.08].forEach((px) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.12, 0.36), mats.barrierMetal);
      leg.position.set(px, 0.56, 0);
      leg.castShadow = true;
      group.add(leg);
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.52, 0.24), mats.hazardStripe);
    beam.position.set(0, 0.88, 0);
    beam.castShadow = true;
    group.add(beam);
  } else if (kind === 'high') {
    // Overhead sign gate (must slide/roll under! Clearance bottom ~1.25m, top ~2.9m)
    [-1.18, 1.18].forEach((px) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.95, 0.22), mats.barrierMetal);
      post.position.set(px, 1.475, 0);
      post.castShadow = true;
      group.add(post);
    });
    const signPanel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.45, 0.26), mats.hazardStripe);
    signPanel.position.set(0, 2.15, 0);
    signPanel.castShadow = true;
    group.add(signPanel);

    const arrowBar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.22, 0.3), mats.trainHeadlight);
    arrowBar.position.set(0, 1.52, 0);
    group.add(arrowBar);
  } else {
    // Tall double barricade (must dodge lane!)
    [-1.15, 1.15].forEach((px) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.65, 0.28), mats.barrierMetal);
      post.position.set(px, 1.325, 0);
      post.castShadow = true;
      group.add(post);
    });
    const lower = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.72, 0.26), mats.hazardStripe);
    lower.position.set(0, 0.68, 0);
    lower.castShadow = true;
    group.add(lower);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.85, 0.26), mats.hazardStripe);
    upper.position.set(0, 1.88, 0);
    upper.castShadow = true;
    group.add(upper);
  }

  return group;
}

export function buildCoinMesh(mats: MaterialLibrary): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 18);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mats.coinGold);
  mesh.castShadow = false;
  return mesh;
}

export function buildPowerupGroup(kind: PowerupKind): THREE.Group {
  const group = new THREE.Group();

  const haloMat = new THREE.MeshStandardMaterial({
    color: kind === 'magnet' ? 0xef4444 : kind === 'multiplier' ? 0x3b82f6 : kind === 'jetpack' ? 0xf97316 : 0x10b981,
    emissive: kind === 'magnet' ? 0xdc2626 : kind === 'multiplier' ? 0x2563eb : kind === 'jetpack' ? 0xea580c : 0x059669,
    emissiveIntensity: 1.4,
    roughness: 0.25,
    metalness: 0.4,
  });

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.055, 10, 24), haloMat);
  group.add(ring);

  if (kind === 'magnet') {
    const uGeo = new THREE.TorusGeometry(0.32, 0.11, 10, 18, Math.PI);
    const uMesh = new THREE.Mesh(uGeo, haloMat);
    uMesh.rotation.z = Math.PI;
    uMesh.position.y = 0.08;
    group.add(uMesh);

    const tipMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });
    [-0.32, 0.32].forEach((tx) => {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), tipMat);
      tip.position.set(tx, 0.16, 0);
      group.add(tip);
    });
  } else if (kind === 'multiplier') {
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), haloMat);
    group.add(star);
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.14, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 1.5 }),
    );
    group.add(core);
  } else if (kind === 'jetpack') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.56, 12), haloMat);
    group.add(body);
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.24, 12),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.3, metalness: 0.6 }),
    );
    cap.position.y = 0.4;
    group.add(cap);
  } else {
    // Super Sneakers
    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.16, 0.56),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }),
    );
    sole.position.y = -0.12;
    group.add(sole);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.46), haloMat);
    upper.position.set(0, 0.1, 0.04);
    group.add(upper);
  }

  return group;
}
