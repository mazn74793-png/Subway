export type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover';

export type PowerupKind = 'magnet' | 'multiplier' | 'jetpack' | 'sneakers';

export interface ActivePowerups {
  magnet: number;      // remaining seconds
  multiplier: number;  // remaining seconds
  jetpack: number;     // remaining seconds
  sneakers: number;    // remaining seconds
  hoverboard: number;  // remaining seconds
}

export interface PowerupDurations {
  magnet: number;
  multiplier: number;
  jetpack: number;
  sneakers: number;
  hoverboard: number;
}

export interface RunnerSkin {
  id: string;
  name: string;
  price: number;
  hoodieColor: string;
  pantsColor: string;
  shoeColor: string;
  capColor: string;
  boardColor: string;
  boardGlow: string;
}

export interface UpgradeLevels {
  magnet: number;     // 0..5
  multiplier: number; // 0..5
  jetpack: number;    // 0..5
  sneakers: number;   // 0..5
}

export interface SaveData {
  highScore: number;
  totalCoins: number;
  hoverboards: number;
  selectedSkin: string;
  unlockedSkins: string[];
  upgrades: UpgradeLevels;
  muted: boolean;
  runsCompleted: number;
  bestDistance: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  score: number;
  distance: number;
  runCoins: number;
  multiplierValue: number;
  speedKmh: number;
  powerups: ActivePowerups;
  durations: PowerupDurations;
  stumbleWarning: boolean;
  hoverboardsLeft: number;
  lastEventText: string | null;
}
