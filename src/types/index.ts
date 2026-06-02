export type Asset = "BTC" | "ETH" | "HYPE" | "SOL";
export type Direction = "long" | "short";
export type TradingMode = "paper" | "live" | "backtest";
export type TradeStatus = "open" | "closed" | "liquidated" | "cancelled";
export type CloseReason = "tp" | "sl" | "manual" | "emergency" | "liquidated" | "trailing_stop";
export type IndicatorType = "RSI" | "EMA" | "SMA" | "MACD" | "BB" | "VWAP" | "VOLUME";
export type ConditionOperator = "gt" | "lt" | "gte" | "lte" | "crosses_above" | "crosses_below";
export type ConditionType = "indicator" | "price_action" | "volume" | "ai";

export interface AssetConfig {
  symbol: Asset;
  name: string;
  binancePair: string;
  coingeckoId: string;
  color: string;
  icon: string;
  decimals: number;
}

export const ASSETS: Record<Asset, AssetConfig> = {
  BTC: {
    symbol: "BTC",
    name: "Bitcoin",
    binancePair: "BTCUSDT",
    coingeckoId: "bitcoin",
    color: "#f7931a",
    icon: "₿",
    decimals: 8,
  },
  ETH: {
    symbol: "ETH",
    name: "Ethereum",
    binancePair: "ETHUSDT",
    coingeckoId: "ethereum",
    color: "#627eea",
    icon: "Ξ",
    decimals: 18,
  },
  HYPE: {
    symbol: "HYPE",
    name: "Hyperliquid",
    binancePair: "HYPEUSDT",
    coingeckoId: "hyperliquid",
    color: "#00d4aa",
    icon: "H",
    decimals: 8,
  },
  SOL: {
    symbol: "SOL",
    name: "Solana",
    binancePair: "SOLUSDT",
    coingeckoId: "solana",
    color: "#9945ff",
    icon: "◎",
    decimals: 9,
  },
};

export interface StrategyCondition {
  id: string;
  type: ConditionType;
  indicator?: IndicatorType;
  operator: ConditionOperator;
  value?: number;
  period?: number;
  description?: string;
  order: number;
}

export interface Strategy {
  id: string;
  userId: string;
  name: string;
  description?: string;
  asset: Asset;
  direction: Direction | "both";
  leverage: number;
  positionSizeType: "fixed" | "percent";
  positionSize: number;
  stopLoss: number;
  takeProfit: number;
  trailingStop: boolean;
  trailingStopPct?: number;
  maxDailyLoss: number;
  maxTradesPerDay: number;
  cooldownMinutes: number;
  isActive: boolean;
  isPaused: boolean;
  mode: TradingMode;
  conditions: StrategyCondition[];
  aiEnabled: boolean;
  timeFilter?: { from: string; to: string; timezone: string };
  newsFilter: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  userId: string;
  strategyId?: string;
  asset: Asset;
  direction: Direction;
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  leverage: number;
  pnl?: number;
  pnlPercent?: number;
  status: TradeStatus;
  closeReason?: CloseReason;
  mode: TradingMode;
  openedAt: string;
  closedAt?: string;
  txHash?: string;
  aiSignal?: AISignal;
}

export interface Position {
  id: string;
  asset: Asset;
  direction: Direction;
  size: number;
  entryPrice: number;
  currentPrice?: number;
  unrealizedPnl?: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  tradeId?: string;
  isOpen: boolean;
  openedAt: string;
}

export interface AISignal {
  asset: Asset;
  direction: Direction;
  confidence: number; // 0-100
  reasoning: string;
  indicators: {
    rsi?: number;
    trend?: string;
    support?: number;
    resistance?: number;
    volume?: string;
  };
  suggestedEntry?: number;
  suggestedSL?: number;
  suggestedTP?: number;
  suggestedLeverage?: number;
  risk: "low" | "medium" | "high";
  timestamp: string;
}

export interface MarketData {
  asset: Asset;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DashboardStats {
  totalBalance: number;
  availableBalance: number;
  totalPnl: number;
  totalPnlPercent: number;
  winRate: number;
  totalTrades: number;
  openPositions: number;
  activeStrategies: number;
  dailyPnl: number;
  weeklyPnl: number;
}

export interface RiskSettings {
  maxLeverage: number;
  maxPositionSize: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  maxOpenPositions: number;
  requireConfirm: boolean;
  emergencyStop: boolean;
  liquidationBuffer: number;
}

export interface WalletSession {
  address: string;
  chainId: number;
  isAuthenticated: boolean;
}

export interface ChartLine {
  price: number;
  color: string;
  label: string;
  lineStyle: "solid" | "dashed" | "dotted";
}
