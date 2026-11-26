import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Coins,
  Footprints,
  Gamepad2,
  Magnet,
  Pause,
  Play,
  Rocket,
  RotateCcw,
  Shield,
  ShoppingBag,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { ShopModal } from './components/ShopModal';
import { RunnerEngine } from './game/RunnerEngine';
import { sound } from './game/sound';
import { loadSaveData, saveGameData } from './game/storage';
import { HudSnapshot, SaveData, UpgradeLevels } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  phase: 'menu',
  score: 0,
  distance: 0,
  runCoins: 0,
  multiplierValue: 1,
  speedKmh: 50,
  powerups: {
    magnet: 0,
    multiplier: 0,
    jetpack: 0,
    sneakers: 0,
    hoverboard: 0,
  },
  durations: {
    magnet: 9,
    multiplier: 10,
    jetpack: 7,
    sneakers: 10,
    hoverboard: 30,
  },
  stumbleWarning: false,
  hoverboardsLeft: 3,
  lastEventText: null,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RunnerEngine | null>(null);

  const [saveData, setSaveData] = useState<SaveData>(() => loadSaveData());
  const saveRef = useRef<SaveData>(saveData);
  saveRef.current = saveData;

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [shopOpen, setShopOpen] = useState(false);
  const [touchPadOn, setTouchPadOn] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [lastRunSummary, setLastRunSummary] = useState<{
    score: number;
    coins: number;
    distance: number;
    isNewBest: boolean;
  } | null>(null);

  const commitSave = useCallback((updater: (prev: SaveData) => SaveData) => {
    setSaveData((prev) => {
      const next = updater(prev);
      saveGameData(next);
      engineRef.current?.updateSaveData(next);
      return next;
    });
  }, []);

  useEffect(() => {
    sound.setMuted(saveData.muted);
  }, [saveData.muted]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new RunnerEngine(container, saveRef.current, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onRunFinished: (result) => {
        const prevBest = saveRef.current.highScore;
        const isNewBest = result.score > prevBest;
        setLastRunSummary({ ...result, isNewBest });
        commitSave((prev) => ({
          ...prev,
          highScore: Math.max(prev.highScore, result.score),
          totalCoins: prev.totalCoins + result.coins,
          runsCompleted: prev.runsCompleted + 1,
          bestDistance: Math.max(prev.bestDistance, result.distance),
        }));
      },
      onBoardConsumed: () => {
        commitSave((prev) => ({
          ...prev,
          hoverboards: Math.max(0, prev.hoverboards - 1),
        }));
      },
      onContextLost: (lost) => {
        setContextLost(lost);
      },
    });

    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [commitSave]);

  const handleStartRun = () => {
    setLastRunSummary(null);
    setShopOpen(false);
    engineRef.current?.startRun();
  };

  const handleToggleMute = () => {
    commitSave((prev) => ({ ...prev, muted: !prev.muted }));
  };

  const handleSelectSkin = (skinId: string) => {
    commitSave((prev) => ({ ...prev, selectedSkin: skinId }));
  };

  const handleBuySkin = (skinId: string, price: number) => {
    commitSave((prev) => {
      if (prev.totalCoins < price || prev.unlockedSkins.includes(skinId)) return prev;
      return {
        ...prev,
        totalCoins: prev.totalCoins - price,
        unlockedSkins: [...prev.unlockedSkins, skinId],
        selectedSkin: skinId,
      };
    });
  };

  const handleBuyUpgrade = (key: keyof UpgradeLevels, cost: number) => {
    commitSave((prev) => {
      if (prev.totalCoins < cost || prev.upgrades[key] >= 5) return prev;
      return {
        ...prev,
        totalCoins: prev.totalCoins - cost,
        upgrades: {
          ...prev.upgrades,
          [key]: prev.upgrades[key] + 1,
        },
      };
    });
  };

  const handleBuyHoverboard = (cost: number) => {
    commitSave((prev) => {
      if (prev.totalCoins < cost) return prev;
      return {
        ...prev,
        totalCoins: prev.totalCoins - cost,
        hoverboards: prev.hoverboards + 1,
      };
    });
  };

  const activePowerupList = [
    {
      key: 'hoverboard' as const,
      label: 'Hoverboard',
      time: hud.powerups.hoverboard,
      max: hud.durations.hoverboard,
      barColor: 'bg-sky-400',
      Icon: Shield,
    },
    {
      key: 'jetpack' as const,
      label: 'Jetpack',
      time: hud.powerups.jetpack,
      max: hud.durations.jetpack,
      barColor: 'bg-amber-400',
      Icon: Rocket,
    },
    {
      key: 'magnet' as const,
      label: 'Magnet',
      time: hud.powerups.magnet,
      max: hud.durations.magnet,
      barColor: 'bg-rose-400',
      Icon: Magnet,
    },
    {
      key: 'multiplier' as const,
      label: '2x Score',
      time: hud.powerups.multiplier,
      max: hud.durations.multiplier,
      barColor: 'bg-blue-400',
      Icon: Zap,
    },
    {
      key: 'sneakers' as const,
      label: 'Sneakers',
      time: hud.powerups.sneakers,
      max: hud.durations.sneakers,
      barColor: 'bg-emerald-400',
      Icon: Footprints,
    },
  ].filter((p) => p.time > 0);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Dedicated WebGL Mount Container */}
      <div
        ref={mountRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* WebGL Context Lost Fallback */}
      {contextLost && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-6 text-center">
          <div className="max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6">
            <h2 className="font-display text-xl font-bold text-white">Graphics Context Paused</h2>
            <p className="text-sm text-slate-300 mt-2">
              Your tablet paused 3D rendering to save memory. Tap below to reload the track.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 min-h-[48px] px-6 rounded-xl bg-amber-500 text-slate-950 font-semibold cursor-pointer"
            >
              Reload Game
            </button>
          </div>
        </div>
      )}

      {/* MENU / HOME OVERLAY */}
      {hud.phase === 'menu' && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-5 sm:p-8">
          {/* Top Bar */}
          <div className="flex items-start justify-between gap-4">
            <div className="pointer-events-auto rounded-2xl bg-slate-950/85 border border-white/15 px-5 py-3 shadow-lg">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Metro Dash
              </h1>
              <div className="flex items-center gap-3 text-xs sm:text-sm text-slate-300 mt-0.5 font-mono-num">
                <span>Best {saveData.highScore.toLocaleString()}</span>
                <span aria-hidden="true">·</span>
                <span>{saveData.bestDistance.toLocaleString()} m</span>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-2.5">
              <div className="min-h-[48px] px-4 rounded-xl bg-slate-950/85 border border-white/15 flex items-center gap-2 text-amber-400 font-mono-num font-bold shadow-lg">
                <Coins className="w-5 h-5" />
                <span>{saveData.totalCoins.toLocaleString()}</span>
              </div>

              <button
                type="button"
                onClick={handleToggleMute}
                className="min-w-[48px] min-h-[48px] rounded-xl bg-slate-950/85 border border-white/15 flex items-center justify-center text-white hover:bg-slate-900 transition-colors shadow-lg cursor-pointer"
                aria-label={saveData.muted ? 'Unmute audio' : 'Mute audio'}
              >
                {saveData.muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Bottom Dock */}
          <div className="pointer-events-auto mx-auto w-full max-w-xl rounded-2xl bg-slate-950/90 border border-white/15 p-4 sm:p-5 shadow-2xl">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={handleStartRun}
                className="flex-1 min-h-[54px] px-6 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 active:scale-[0.99] transition-all font-display text-xl font-bold flex items-center justify-center gap-2.5 shadow-lg cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Tap to Run</span>
              </button>

              <button
                type="button"
                onClick={() => setShopOpen(true)}
                className="min-h-[54px] px-5 rounded-xl bg-slate-800 text-white hover:bg-slate-700 transition-colors font-semibold flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <ShoppingBag className="w-5 h-5 text-amber-400" />
                <span>Runners & Gear</span>
              </button>

              <button
                type="button"
                onClick={() => setTouchPadOn((v) => !v)}
                className={`min-h-[54px] px-4 rounded-xl border transition-colors font-semibold flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
                  touchPadOn
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                }`}
                aria-pressed={touchPadOn}
              >
                <Gamepad2 className="w-5 h-5" />
                <span className="text-sm">{touchPadOn ? 'Pad On' : 'Swipe'}</span>
              </button>
            </div>

            <div className="mt-3 text-center text-xs sm:text-sm text-slate-300">
              Swipe left, right, up, or down anywhere to dodge trains · Double-tap for Hoverboard
            </div>
          </div>
        </div>
      )}

      {/* IN-GAME HUD */}
      {(hud.phase === 'playing' || hud.phase === 'paused') && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 sm:p-6">
          {/* Top HUD */}
          <div className="flex items-start justify-between gap-4">
            <div className="rounded-xl bg-slate-950/85 border border-white/15 px-4 py-2.5 shadow-lg">
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-3xl sm:text-4xl font-bold text-white font-mono-num">
                  {hud.score.toLocaleString()}
                </span>
                {hud.multiplierValue > 1 && (
                  <span className="font-display text-base font-bold text-sky-400">
                    {hud.multiplierValue}x
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300 font-mono-num">
                <span>{hud.distance.toLocaleString()} m</span>
                <span aria-hidden="true">·</span>
                <span>{hud.speedKmh} km/h</span>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              <div className="min-h-[48px] px-3.5 rounded-xl bg-slate-950/85 border border-white/15 flex items-center gap-1.5 text-amber-400 font-mono-num font-bold shadow-lg">
                <Coins className="w-5 h-5" />
                <span>{hud.runCoins.toLocaleString()}</span>
              </div>

              <button
                type="button"
                onClick={handleToggleMute}
                className="min-w-[48px] min-h-[48px] rounded-xl bg-slate-950/85 border border-white/15 flex items-center justify-center text-white hover:bg-slate-900 transition-colors shadow-lg cursor-pointer"
                aria-label={saveData.muted ? 'Unmute audio' : 'Mute audio'}
              >
                {saveData.muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              <button
                type="button"
                onClick={() =>
                  hud.phase === 'paused' ? engineRef.current?.resume() : engineRef.current?.pause()
                }
                className="min-w-[48px] min-h-[48px] rounded-xl bg-slate-950/85 border border-white/15 flex items-center justify-center text-white hover:bg-slate-900 transition-colors shadow-lg cursor-pointer"
                aria-label="Pause game"
              >
                <Pause className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Non-blocking Event Banner (Top-Center) */}
          {(hud.lastEventText || hud.stumbleWarning) && (
            <div className="mx-auto -mt-12 rounded-xl bg-slate-950/90 border border-amber-400/50 px-4 py-2 text-sm font-display font-bold text-amber-300 shadow-lg">
              {hud.lastEventText ?? 'Inspector Right Behind You!'}
            </div>
          )}

          {/* Bottom HUD */}
          <div className="flex items-end justify-between gap-4">
            {/* Active Powerup Timers + Hoverboard Trigger */}
            <div className="pointer-events-auto flex flex-col gap-2">
              {activePowerupList.map((item) => {
                const Icon = item.Icon;
                const pct = Math.max(0, Math.min(100, (item.time / item.max) * 100));
                return (
                  <div
                    key={item.key}
                    className="w-44 rounded-xl bg-slate-950/88 border border-white/15 px-3 py-2 shadow-md"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-white">
                      <span className="flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5 text-amber-400" />
                        <span>{item.label}</span>
                      </span>
                      <span className="font-mono-num text-slate-300">{item.time.toFixed(1)}s</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full ${item.barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => engineRef.current?.activateHoverboard()}
                disabled={hud.powerups.hoverboard > 0 || hud.hoverboardsLeft <= 0}
                className={`min-h-[52px] px-4 rounded-xl border font-semibold flex items-center gap-2.5 shadow-lg transition-colors cursor-pointer ${
                  hud.powerups.hoverboard > 0
                    ? 'bg-sky-500/30 border-sky-400 text-sky-100 cursor-default'
                    : hud.hoverboardsLeft > 0
                      ? 'bg-slate-950/90 border-sky-400/60 text-white hover:bg-slate-900'
                      : 'bg-slate-950/70 border-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Shield className="w-5 h-5 text-sky-400" />
                <span className="text-sm">Hoverboard</span>
                <span className="font-mono-num text-xs text-sky-300">({hud.hoverboardsLeft})</span>
              </button>
            </div>

            {/* Optional Tablet On-Screen Thumb Pad */}
            {touchPadOn && hud.phase === 'playing' && (
              <div className="pointer-events-auto grid grid-cols-3 gap-2">
                <div />
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    engineRef.current?.triggerJump();
                  }}
                  className="w-14 h-14 rounded-xl bg-slate-950/88 border border-white/20 flex items-center justify-center text-white active:bg-amber-500 active:text-slate-950 cursor-pointer"
                  aria-label="Jump"
                >
                  <ChevronUp className="w-7 h-7" />
                </button>
                <div />
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    engineRef.current?.triggerLaneChange(-1);
                  }}
                  className="w-14 h-14 rounded-xl bg-slate-950/88 border border-white/20 flex items-center justify-center text-white active:bg-amber-500 active:text-slate-950 cursor-pointer"
                  aria-label="Move left"
                >
                  <ChevronLeft className="w-7 h-7" />
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    engineRef.current?.triggerRoll();
                  }}
                  className="w-14 h-14 rounded-xl bg-slate-950/88 border border-white/20 flex items-center justify-center text-white active:bg-amber-500 active:text-slate-950 cursor-pointer"
                  aria-label="Roll"
                >
                  <ChevronDown className="w-7 h-7" />
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    engineRef.current?.triggerLaneChange(1);
                  }}
                  className="w-14 h-14 rounded-xl bg-slate-950/88 border border-white/20 flex items-center justify-center text-white active:bg-amber-500 active:text-slate-950 cursor-pointer"
                  aria-label="Move right"
                >
                  <ChevronRight className="w-7 h-7" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PAUSE OVERLAY */}
      {hud.phase === 'paused' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-center">
            <h2 className="font-display text-2xl font-bold text-white">Paused</h2>
            <p className="text-sm text-slate-300 mt-1 font-mono-num">
              Score {hud.score.toLocaleString()} · {hud.distance.toLocaleString()} m
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => engineRef.current?.resume()}
                className="min-h-[50px] rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 font-display text-lg font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Resume</span>
              </button>

              <button
                type="button"
                onClick={() => setTouchPadOn((v) => !v)}
                className="min-h-[48px] rounded-xl bg-slate-800 text-white hover:bg-slate-700 font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Gamepad2 className="w-5 h-5 text-sky-400" />
                <span>{touchPadOn ? 'Hide On-Screen Pad' : 'Show On-Screen Pad'}</span>
              </button>

              <button
                type="button"
                onClick={() => engineRef.current?.returnToMenu()}
                className="min-h-[48px] rounded-xl bg-slate-950 border border-slate-700 text-slate-200 hover:bg-slate-800 font-semibold cursor-pointer"
              >
                Quit to Home
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER OVERLAY */}
      {hud.phase === 'gameover' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 sm:p-7 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                {lastRunSummary?.isNewBest ? 'New Best Run!' : 'Run Complete'}
              </h2>
              {lastRunSummary?.isNewBest && (
                <Trophy className="w-7 h-7 text-amber-400 shrink-0" />
              )}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5">
                <div className="text-xs text-slate-400">Score</div>
                <div className="font-display text-xl font-bold text-white font-mono-num mt-0.5">
                  {(lastRunSummary?.score ?? hud.score).toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5">
                <div className="text-xs text-slate-400">Distance</div>
                <div className="font-display text-xl font-bold text-white font-mono-num mt-0.5">
                  {(lastRunSummary?.distance ?? hud.distance).toLocaleString()} m
                </div>
              </div>
              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5">
                <div className="text-xs text-slate-400">Coins</div>
                <div className="font-display text-xl font-bold text-amber-400 font-mono-num mt-0.5">
                  +{(lastRunSummary?.coins ?? hud.runCoins).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-400 font-mono-num flex items-center justify-between">
              <span>All-Time Best: {saveData.highScore.toLocaleString()}</span>
              <span>Bank: {saveData.totalCoins.toLocaleString()} coins</span>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleStartRun}
                className="flex-1 min-h-[52px] px-5 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 font-display text-lg font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-5 h-5" />
                <span>Run Again</span>
              </button>

              <button
                type="button"
                onClick={() => setShopOpen(true)}
                className="min-h-[52px] px-5 rounded-xl bg-slate-800 text-white hover:bg-slate-700 font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShoppingBag className="w-5 h-5 text-amber-400" />
                <span>Gear</span>
              </button>

              <button
                type="button"
                onClick={() => engineRef.current?.returnToMenu()}
                className="min-h-[52px] px-4 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 hover:bg-slate-800 font-semibold cursor-pointer"
              >
                Home
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RUNNERS & UPGRADES MODAL */}
      {shopOpen && (
        <ShopModal
          saveData={saveData}
          onClose={() => setShopOpen(false)}
          onSelectSkin={handleSelectSkin}
          onBuySkin={handleBuySkin}
          onBuyUpgrade={handleBuyUpgrade}
          onBuyHoverboard={handleBuyHoverboard}
        />
      )}
    </div>
  );
}
