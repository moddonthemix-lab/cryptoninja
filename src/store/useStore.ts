import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Asset, MarketData, Strategy, Trade, Position, AISignal, TradingMode, DashboardStats } from "@/types";

interface AppState {
  // Auth
  address: string | null;
  isAuthenticated: boolean;
  chainId: number | null;

  // Trading
  tradingMode: TradingMode;
  selectedAsset: Asset;
  paperBalance: number;

  // Market data
  marketData: Partial<Record<Asset, MarketData>>;
  lastUpdated: number;

  // Trading data
  openPositions: Position[];
  closedTrades: Trade[];
  strategies: Strategy[];
  activeStrategyId: string | null;

  // AI
  aiSignals: Partial<Record<Asset, AISignal>>;
  aiEnabled: boolean;

  // Chart overlay — entry/SL/TP lines to draw (from the trade ticket or a position)
  chartOverlay: { asset: Asset; entry?: number | null; sl?: number | null; tp?: number | null } | null;

  // Auto trader
  autoTradeEnabled: boolean;
  autoTradeLeverage: number;
  learningEnabled: boolean;   // feed recent trade outcomes back to the AI
  autoTradeCount: number;      // trades opened today
  autoTradeDate: string;       // YYYY-MM-DD the count belongs to
  autoTradeLastTs: number;     // ms timestamp of last auto trade (for cooldown)

  // Copy trading — mirror a target wallet's trades via the agent key
  copyTrade: {
    enabled: boolean;
    targetAddress: string;
    sizingMode: "proportional" | "multiplier" | "fixed";
    multiplier: number;       // for "multiplier": copy their notional × this
    fixedUsd: number;         // for "fixed": margin USD per copied trade
    maxMarginPerTrade: number; // hard cap on margin per copied position
    leverageCap: number;
    copyLongs: boolean;
    copyShorts: boolean;
    assetFilter: string[];     // empty = copy all their positions; else only these symbols
  };
  // Copy-trade runtime status/log (not persisted) + a nonce to force a sync
  copyStatus: { state: "off" | "watching" | "error"; lastCheck: string | null; targetEquity: number | null; targetCount: number; copiedCount: number };
  copyLog: Array<{ time: string; msg: string; type: "info" | "open" | "close" | "error" }>;
  copySyncNonce: number;

  // Wallet tracker — up to 5 watched wallets
  trackedWallets: Array<{ address: string; label: string }>;
  // In-app notifications (tracked-wallet position open/close alerts)
  notifications: Array<{
    id: string; kind: "open" | "close"; address: string; label: string;
    coin: string; sym: string; direction: "long" | "short"; leverage: number;
    entryPx: number; positionValue: number; time: number; tradable: boolean;
  }>;

  // Risk
  emergencyStop: boolean;

  // UI
  isLoading: boolean;

  // Actions
  setAuth: (address: string, chainId: number) => void;
  clearAuth: () => void;
  setTradingMode: (mode: TradingMode) => void;
  setSelectedAsset: (asset: Asset) => void;
  setChartOverlay: (o: AppState["chartOverlay"]) => void;
  updateMarketData: (data: Partial<Record<Asset, MarketData>>) => void;
  setPositions: (positions: Position[]) => void;
  openPosition: (position: Position) => void;
  updatePositionStop: (positionId: string, stopLoss: number) => void;
  closePosition: (positionId: string, exitPrice: number, reason: string) => void;
  setTrades: (trades: Trade[]) => void;
  addTrade: (trade: Trade) => void;
  setStrategies: (strategies: Strategy[]) => void;
  setActiveStrategy: (id: string | null) => void;
  setAISignal: (asset: Asset, signal: AISignal) => void;
  toggleAI: () => void;
  toggleAutoTrade: () => void;
  setAutoTradeLeverage: (n: number) => void;
  toggleLearning: () => void;
  recordAutoTrade: () => void;
  getTradesToday: () => number;
  resetAutoTradeCount: () => void;
  setCopyTrade: (patch: Partial<AppState["copyTrade"]>) => void;
  setCopyStatus: (patch: Partial<AppState["copyStatus"]>) => void;
  addCopyLog: (entry: AppState["copyLog"][number]) => void;
  requestCopySync: () => void;
  addTrackedWallet: (address: string, label?: string) => void;
  removeTrackedWallet: (address: string) => void;
  addNotification: (n: AppState["notifications"][number]) => void;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;
  triggerEmergencyStop: () => void;
  clearEmergencyStop: () => void;
  setPaperBalance: (balance: number) => void;
  setLoading: (loading: boolean) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      address: null,
      isAuthenticated: false,
      chainId: null,
      tradingMode: "paper",
      selectedAsset: "BTC",
      paperBalance: 10000,
      marketData: {},
      lastUpdated: 0,
      openPositions: [],
      closedTrades: [],
      strategies: [],
      activeStrategyId: null,
      aiSignals: {},
      chartOverlay: null,
      aiEnabled: true,
      autoTradeEnabled: false,
      autoTradeLeverage: 3,
      learningEnabled: true,
      autoTradeCount: 0,
      autoTradeDate: "",
      autoTradeLastTs: 0,
      copyTrade: {
        enabled: false,
        targetAddress: "",
        sizingMode: "proportional",
        multiplier: 1,
        fixedUsd: 10,
        maxMarginPerTrade: 25,
        leverageCap: 5,
        copyLongs: true,
        copyShorts: true,
        assetFilter: [],
      },
      copyStatus: { state: "off", lastCheck: null, targetEquity: null, targetCount: 0, copiedCount: 0 },
      copyLog: [],
      copySyncNonce: 0,
      trackedWallets: [],
      notifications: [],
      emergencyStop: false,
      isLoading: false,

      setAuth: (address, chainId) =>
        set({ address, chainId, isAuthenticated: true }),
      clearAuth: () =>
        set({ address: null, chainId: null, isAuthenticated: false }),
      setTradingMode: (mode) => set({ tradingMode: mode }),
      setSelectedAsset: (asset) => set({ selectedAsset: asset }),
      setChartOverlay: (o) => set({ chartOverlay: o }),
      updateMarketData: (data) =>
        set((s) => ({
          marketData: { ...s.marketData, ...data },
          lastUpdated: Date.now(),
        })),
      setPositions: (positions) => set({ openPositions: positions }),
      openPosition: (position) =>
        set((s) => ({
          openPositions: [...s.openPositions, position],
          paperBalance: s.paperBalance - (position.size * position.entryPrice) / position.leverage,
        })),
      updatePositionStop: (positionId, stopLoss) =>
        set((s) => ({
          openPositions: s.openPositions.map((p) =>
            p.id === positionId ? { ...p, stopLoss } : p
          ),
        })),
      closePosition: (positionId, exitPrice, reason) =>
        set((s) => {
          const pos = s.openPositions.find((p) => p.id === positionId);
          if (!pos) return {};
          const priceDiff = pos.direction === "long"
            ? exitPrice - pos.entryPrice
            : pos.entryPrice - exitPrice;
          const pnl = priceDiff * pos.size * pos.leverage;
          const margin = (pos.size * pos.entryPrice) / pos.leverage;
          const closedTrade: Trade = {
            id: pos.id,
            userId: "paper",
            asset: pos.asset,
            direction: pos.direction,
            entryPrice: pos.entryPrice,
            exitPrice,
            stopLoss: pos.stopLoss,
            takeProfit: pos.takeProfit,
            size: pos.size,
            leverage: pos.leverage,
            pnl,
            pnlPercent: (priceDiff / pos.entryPrice) * 100 * pos.leverage,
            status: "closed",
            mode: "paper",
            openedAt: pos.openedAt,
            closedAt: new Date().toISOString(),
            closeReason: reason as any,
            note: pos.note,
            confidence: pos.confidence,
          };
          return {
            openPositions: s.openPositions.filter((p) => p.id !== positionId),
            closedTrades: [closedTrade, ...s.closedTrades].slice(0, 100),
            paperBalance: s.paperBalance + margin + pnl,
          };
        }),
      setTrades: (trades) => set({ closedTrades: trades }),
      addTrade: (trade) =>
        set((s) => ({
          closedTrades: [trade, ...s.closedTrades].slice(0, 100),
        })),
      setStrategies: (strategies) => set({ strategies }),
      setActiveStrategy: (id) => set({ activeStrategyId: id }),
      setAISignal: (asset, signal) =>
        set((s) => ({ aiSignals: { ...s.aiSignals, [asset]: signal } })),
      toggleAI: () => set((s) => ({ aiEnabled: !s.aiEnabled })),
      toggleAutoTrade: () => set((s) => ({ autoTradeEnabled: !s.autoTradeEnabled })),
      setAutoTradeLeverage: (n) => set({ autoTradeLeverage: n }),
      toggleLearning: () => set((s) => ({ learningEnabled: !s.learningEnabled })),
      // Use LOCAL calendar date (en-CA → YYYY-MM-DD) so the daily cap resets at
      // the user's local midnight, not UTC midnight.
      recordAutoTrade: () => set((s) => {
        const today = new Date().toLocaleDateString("en-CA");
        const count = s.autoTradeDate === today ? s.autoTradeCount + 1 : 1;
        return { autoTradeCount: count, autoTradeDate: today, autoTradeLastTs: Date.now() };
      }),
      getTradesToday: () => {
        const s = get();
        const today = new Date().toLocaleDateString("en-CA");
        return s.autoTradeDate === today ? s.autoTradeCount : 0;
      },
      resetAutoTradeCount: () => set({
        autoTradeCount: 0,
        autoTradeDate: new Date().toLocaleDateString("en-CA"),
        autoTradeLastTs: 0,
      }),
      setCopyTrade: (patch) => set((s) => ({ copyTrade: { ...s.copyTrade, ...patch } })),
      setCopyStatus: (patch) => set((s) => ({ copyStatus: { ...s.copyStatus, ...patch } })),
      addCopyLog: (entry) => set((s) => ({ copyLog: [entry, ...s.copyLog].slice(0, 50) })),
      requestCopySync: () => set((s) => ({ copySyncNonce: s.copySyncNonce + 1 })),
      addTrackedWallet: (address, label = "") => set((s) => {
        const addr = address.trim();
        if (s.trackedWallets.length >= 5) return {};
        if (s.trackedWallets.some((w) => w.address.toLowerCase() === addr.toLowerCase())) return {};
        return { trackedWallets: [...s.trackedWallets, { address: addr, label: label.trim() }] };
      }),
      removeTrackedWallet: (address) => set((s) => ({
        trackedWallets: s.trackedWallets.filter((w) => w.address.toLowerCase() !== address.toLowerCase()),
      })),
      addNotification: (n) => set((s) => ({ notifications: [n, ...s.notifications].slice(0, 40) })),
      dismissNotification: (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
      clearNotifications: () => set({ notifications: [] }),
      triggerEmergencyStop: () => set({ emergencyStop: true, autoTradeEnabled: false, activeStrategyId: null }),
      clearEmergencyStop: () => set({ emergencyStop: false }),
      setPaperBalance: (balance) => set({ paperBalance: balance }),
      setLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: "cryptoninja-store",
      partialize: (state) => ({
        tradingMode: state.tradingMode,
        selectedAsset: state.selectedAsset,
        aiEnabled: state.aiEnabled,
        paperBalance: state.paperBalance,
        autoTradeLeverage: state.autoTradeLeverage,
        autoTradeEnabled: state.autoTradeEnabled,
        learningEnabled: state.learningEnabled,
        autoTradeCount: state.autoTradeCount,
        autoTradeDate: state.autoTradeDate,
        autoTradeLastTs: state.autoTradeLastTs,
        copyTrade: state.copyTrade,
        trackedWallets: state.trackedWallets,
        // Persist trading data so refreshes don't wipe history (no DB needed)
        openPositions: state.openPositions,
        closedTrades: state.closedTrades,
        strategies: state.strategies,
      }),
    }
  )
);
