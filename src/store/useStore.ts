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

  // Auto trader
  autoTradeEnabled: boolean;
  autoTradeLeverage: number;

  // Risk
  emergencyStop: boolean;

  // UI
  isLoading: boolean;

  // Actions
  setAuth: (address: string, chainId: number) => void;
  clearAuth: () => void;
  setTradingMode: (mode: TradingMode) => void;
  setSelectedAsset: (asset: Asset) => void;
  updateMarketData: (data: Partial<Record<Asset, MarketData>>) => void;
  setPositions: (positions: Position[]) => void;
  openPosition: (position: Position) => void;
  closePosition: (positionId: string, exitPrice: number, reason: string) => void;
  setTrades: (trades: Trade[]) => void;
  addTrade: (trade: Trade) => void;
  setStrategies: (strategies: Strategy[]) => void;
  setActiveStrategy: (id: string | null) => void;
  setAISignal: (asset: Asset, signal: AISignal) => void;
  toggleAI: () => void;
  toggleAutoTrade: () => void;
  setAutoTradeLeverage: (n: number) => void;
  triggerEmergencyStop: () => void;
  clearEmergencyStop: () => void;
  setPaperBalance: (balance: number) => void;
  setLoading: (loading: boolean) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
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
      aiEnabled: true,
      autoTradeEnabled: false,
      autoTradeLeverage: 3,
      emergencyStop: false,
      isLoading: false,

      setAuth: (address, chainId) =>
        set({ address, chainId, isAuthenticated: true }),
      clearAuth: () =>
        set({ address: null, chainId: null, isAuthenticated: false }),
      setTradingMode: (mode) => set({ tradingMode: mode }),
      setSelectedAsset: (asset) => set({ selectedAsset: asset }),
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
        // Persist trading data so refreshes don't wipe history (no DB needed)
        openPositions: state.openPositions,
        closedTrades: state.closedTrades,
        strategies: state.strategies,
      }),
    }
  )
);
