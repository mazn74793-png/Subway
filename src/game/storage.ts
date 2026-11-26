import { RunnerSkin, SaveData, UpgradeLevels } from './types';

const STORAGE_KEY = 'metro_dash_save_v1';

export const RUNNER_SKINS: RunnerSkin[] = [
  {
    id: 'street-amber',
    name: 'Blaze',
    price: 0,
    hoodieColor: '#f97316',
    pantsColor: '#1e293b',
    shoeColor: '#ef4444',
    capColor: '#0f172a',
    boardColor: '#f97316',
    boardGlow: '#38bdf8',
  },
  {
    id: 'cobalt-spark',
    name: 'Volt',
    price: 150,
    hoodieColor: '#0284c7',
    pantsColor: '#0f172a',
    shoeColor: '#38bdf8',
    capColor: '#eab308',
    boardColor: '#0284c7',
    boardGlow: '#facc15',
  },
  {
    id: 'crimson-ace',
    name: 'Viper',
    price: 350,
    hoodieColor: '#dc2626',
    pantsColor: '#18181b',
    shoeColor: '#f8fafc',
    capColor: '#dc2626',
    boardColor: '#e11d48',
    boardGlow: '#fb7185',
  },
  {
    id: 'emerald-mint',
    name: 'Pulse',
    price: 600,
    hoodieColor: '#059669',
    pantsColor: '#1e293b',
    shoeColor: '#34d399',
    capColor: '#064e3b',
    boardColor: '#10b981',
    boardGlow: '#a7f3d0',
  },
  {
    id: 'gold-apex',
    name: 'Apex Gold',
    price: 1200,
    hoodieColor: '#eab308',
    pantsColor: '#0f172a',
    shoeColor: '#f59e0b',
    capColor: '#1e293b',
    boardColor: '#fbbf24',
    boardGlow: '#fef08a',
  },
];

export const DEFAULT_SAVE: SaveData = {
  highScore: 0,
  totalCoins: 100, // Starter coins so players can try buying a hoverboard or upgrade right away
  hoverboards: 3,
  selectedSkin: 'street-amber',
  unlockedSkins: ['street-amber'],
  upgrades: {
    magnet: 0,
    multiplier: 0,
    jetpack: 0,
    sneakers: 0,
  },
  muted: false,
  runsCompleted: 0,
  bestDistance: 0,
};

export function loadSaveData(): SaveData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SAVE, upgrades: { ...DEFAULT_SAVE.upgrades } };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...DEFAULT_SAVE,
      ...parsed,
      upgrades: {
        ...DEFAULT_SAVE.upgrades,
        ...(parsed.upgrades ?? {}),
      },
      unlockedSkins: Array.isArray(parsed.unlockedSkins) && parsed.unlockedSkins.length > 0
        ? parsed.unlockedSkins
        : [...DEFAULT_SAVE.unlockedSkins],
    };
  } catch {
    return { ...DEFAULT_SAVE, upgrades: { ...DEFAULT_SAVE.upgrades } };
  }
}

export function saveGameData(data: SaveData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors in restricted contexts
  }
}

export function getUpgradeDuration(kind: keyof UpgradeLevels, level: number): number {
  const base: Record<keyof UpgradeLevels, number> = {
    magnet: 9,
    multiplier: 10,
    jetpack: 7,
    sneakers: 10,
  };
  const step: Record<keyof UpgradeLevels, number> = {
    magnet: 2.5,
    multiplier: 2.5,
    jetpack: 1.5,
    sneakers: 2.5,
  };
  return base[kind] + Math.max(0, Math.min(5, level)) * step[kind];
}

export function getUpgradeCost(level: number): number {
  const costs = [80, 160, 300, 500, 800];
  return costs[level] ?? 9999;
}

export function getSkinById(id: string): RunnerSkin {
  return RUNNER_SKINS.find((s) => s.id === id) ?? RUNNER_SKINS[0];
}
