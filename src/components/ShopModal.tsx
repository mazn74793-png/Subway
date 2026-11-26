import { useState } from 'react';
import { Coins, Shield, Sparkles, Magnet, Rocket, Zap, Footprints, X, Check } from 'lucide-react';
import { RUNNER_SKINS, getUpgradeCost, getUpgradeDuration } from '../game/storage';
import { SaveData, UpgradeLevels } from '../game/types';

interface ShopModalProps {
  saveData: SaveData;
  onClose: () => void;
  onSelectSkin: (skinId: string) => void;
  onBuySkin: (skinId: string, price: number) => void;
  onBuyUpgrade: (key: keyof UpgradeLevels, cost: number) => void;
  onBuyHoverboard: (cost: number) => void;
}

type ShopTab = 'runners' | 'upgrades' | 'boards';

const UPGRADE_META: {
  key: keyof UpgradeLevels;
  label: string;
  desc: string;
  Icon: typeof Magnet;
  accent: string;
}[] = [
  {
    key: 'magnet',
    label: 'Coin Magnet',
    desc: 'Pulls coins across all three tracks',
    Icon: Magnet,
    accent: 'text-rose-400',
  },
  {
    key: 'multiplier',
    label: '2x Score Boost',
    desc: 'Doubles distance and coin score rate',
    Icon: Zap,
    accent: 'text-sky-400',
  },
  {
    key: 'jetpack',
    label: 'Jetpack Flight',
    desc: 'Soars above trains on an aerial coin path',
    Icon: Rocket,
    accent: 'text-amber-400',
  },
  {
    key: 'sneakers',
    label: 'Super Sneakers',
    desc: 'Extra jump height to leap straight onto roofs',
    Icon: Footprints,
    accent: 'text-emerald-400',
  },
];

export function ShopModal({
  saveData,
  onClose,
  onSelectSkin,
  onBuySkin,
  onBuyUpgrade,
  onBuyHoverboard,
}: ShopModalProps) {
  const [tab, setTab] = useState<ShopTab>('runners');

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Runners and Upgrades"
    >
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">
              Runners & Gear
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-amber-400 font-mono-num font-bold text-base">
              <Coins className="w-5 h-5" />
              <span>{saveData.totalCoins.toLocaleString()}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer"
              aria-label="Close shop"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Segmented Filter Tabs */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setTab('runners')}
              className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'runners'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Runners
            </button>
            <button
              type="button"
              onClick={() => setTab('upgrades')}
              className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'upgrades'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Upgrades
            </button>
            <button
              type="button"
              onClick={() => setTab('boards')}
              className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'boards'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Hoverboards
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {tab === 'runners' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {RUNNER_SKINS.map((skin) => {
                const unlocked = saveData.unlockedSkins.includes(skin.id);
                const selected = saveData.selectedSkin === skin.id;
                const canAfford = saveData.totalCoins >= skin.price;

                return (
                  <div
                    key={skin.id}
                    className={`flex items-center justify-between gap-4 p-4 rounded-xl border transition-colors ${
                      selected
                        ? 'bg-slate-800 border-amber-500/80'
                        : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-12 h-12 rounded-xl shrink-0 border border-white/15 flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${skin.hoodieColor} 55%, ${skin.boardGlow} 100%)`,
                        }}
                      >
                        <Sparkles className="w-5 h-5 text-white drop-shadow" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display text-lg font-bold text-white truncate">
                          {skin.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {unlocked ? (selected ? 'Equipped' : 'Unlocked') : `${skin.price} coins`}
                        </div>
                      </div>
                    </div>

                    {unlocked ? (
                      <button
                        type="button"
                        onClick={() => onSelectSkin(skin.id)}
                        disabled={selected}
                        className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                          selected
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                            : 'bg-slate-800 text-white hover:bg-slate-700'
                        }`}
                      >
                        {selected && <Check className="w-4 h-4" />}
                        <span>{selected ? 'Active' : 'Select'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onBuySkin(skin.id, skin.price)}
                        disabled={!canAfford}
                        className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                          canAfford
                            ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        <Coins className="w-4 h-4" />
                        <span className="font-mono-num">{skin.price}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'upgrades' && (
            <div className="space-y-3">
              {UPGRADE_META.map(({ key, label, desc, Icon, accent }) => {
                const level = saveData.upgrades[key];
                const maxed = level >= 5;
                const cost = getUpgradeCost(level);
                const canAfford = !maxed && saveData.totalCoins >= cost;
                const duration = getUpgradeDuration(key, level);

                return (
                  <div
                    key={key}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                        <Icon className={`w-5 h-5 ${accent}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display text-lg font-bold text-white">{label}</span>
                          <span className="text-xs text-slate-400 font-mono-num">
                            · {duration.toFixed(1)}s
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          {[0, 1, 2, 3, 4].map((pip) => (
                            <span
                              key={pip}
                              className={`h-2 w-7 rounded-sm ${
                                pip < level ? 'bg-amber-400' : 'bg-slate-800'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onBuyUpgrade(key, cost)}
                      disabled={maxed || !canAfford}
                      className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 cursor-pointer ${
                        maxed
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                          : canAfford
                            ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {maxed ? (
                        <span>Max Level</span>
                      ) : (
                        <>
                          <Coins className="w-4 h-4" />
                          <span className="font-mono-num">{cost}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'boards' && (
            <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center shrink-0">
                  <Shield className="w-6 h-6 text-sky-400" />
                </div>
                <div>
                  <div className="font-display text-lg font-bold text-white">
                    Hoverboard Charge
                  </div>
                  <p className="text-sm text-slate-300 mt-0.5">
                    Double-tap the screen (or press Space) while running to ride a Hoverboard for 30s and absorb one crash.
                  </p>
                  <div className="text-xs text-sky-300 mt-2 font-mono-num">
                    In Stock: {saveData.hoverboards}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onBuyHoverboard(50)}
                disabled={saveData.totalCoins < 50}
                className={`min-h-[48px] px-5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 cursor-pointer ${
                  saveData.totalCoins >= 50
                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Coins className="w-4 h-4" />
                <span className="font-mono-num">50</span>
                <span>Buy +1</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
