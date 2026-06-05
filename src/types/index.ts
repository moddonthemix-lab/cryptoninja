// Asset is now an open string (a ticker symbol) so we can support any
// Hyperliquid market across the crypto perps dex and the "xyz" equities dex.
export type Asset = string;
export type AssetCategory = "crypto" | "stock" | "commodity";
export type Direction = "long" | "short";
export type TradingMode = "paper" | "live" | "backtest";
export type TradeStatus = "open" | "closed" | "liquidated" | "cancelled";
export type CloseReason = "tp" | "sl" | "manual" | "emergency" | "liquidated" | "trailing_stop";
export type IndicatorType = "RSI" | "EMA" | "SMA" | "MACD" | "BB" | "VWAP" | "VOLUME";
export type ConditionOperator = "gt" | "lt" | "gte" | "lte" | "crosses_above" | "crosses_below";
export type ConditionType = "indicator" | "price_action" | "volume" | "ai";

export interface AssetConfig {
  symbol: Asset;          // our display ticker, e.g. "TSLA"
  name: string;           // full name
  color: string;
  icon: string;
  category: AssetCategory;
  // Hyperliquid routing
  dex: "" | "xyz";        // "" = main crypto perps dex, "xyz" = equities/commodities
  hlCoin: string;         // coin name in HL API ("BTC" or "xyz:TSLA")
  // TradingView chart symbol
  tvSymbol: string;
  // legacy fields kept for compatibility
  binancePair?: string;
  coingeckoId?: string;
  decimals?: number;
}

// Compact factory to keep the registry readable
function mk(
  symbol: string, name: string, color: string, icon: string,
  category: AssetCategory, dex: "" | "xyz", tvSymbol: string
): AssetConfig {
  return {
    symbol, name, color, icon, category, dex,
    hlCoin: dex === "xyz" ? `xyz:${symbol}` : symbol,
    tvSymbol,
    decimals: 8,
  };
}

export const ASSETS: Record<string, AssetConfig> = {
  // ── Core crypto (main dex) ──
  BTC:  mk("BTC", "Bitcoin", "#f7931a", "₿", "crypto", "", "BINANCE:BTCUSDT"),
  ETH:  mk("ETH", "Ethereum", "#627eea", "Ξ", "crypto", "", "BINANCE:ETHUSDT"),
  HYPE: mk("HYPE", "Hyperliquid", "#00d4aa", "H", "crypto", "", "BYBIT:HYPEUSDT"),
  SOL:  mk("SOL", "Solana", "#9945ff", "◎", "crypto", "", "BINANCE:SOLUSDT"),
  // ── More crypto perps (main dex) ──
  DOGE: mk("DOGE", "Dogecoin", "#c2a633", "Ð", "crypto", "", "BINANCE:DOGEUSDT"),
  XRP:  mk("XRP", "Ripple", "#23292f", "X", "crypto", "", "BINANCE:XRPUSDT"),
  LINK: mk("LINK", "Chainlink", "#2a5ada", "L", "crypto", "", "BINANCE:LINKUSDT"),
  AVAX: mk("AVAX", "Avalanche", "#e84142", "A", "crypto", "", "BINANCE:AVAXUSDT"),
  SUI:  mk("SUI", "Sui", "#4da2ff", "S", "crypto", "", "BINANCE:SUIUSDT"),
  ONDO: mk("ONDO", "Ondo", "#3b82f6", "O", "crypto", "", "BINANCE:ONDOUSDT"),
  INJ:  mk("INJ", "Injective", "#00d2ff", "I", "crypto", "", "BINANCE:INJUSDT"),
  PENDLE: mk("PENDLE", "Pendle", "#3b9c8f", "P", "crypto", "", "BINANCE:PENDLEUSDT"),
  TRUMP: mk("TRUMP", "Trump", "#d4af37", "T", "crypto", "", "BINANCE:TRUMPUSDT"),
  // ── Tokenized stocks (xyz dex) ──
  TSLA:  mk("TSLA", "Tesla", "#e82127", "T", "stock", "xyz", "NASDAQ:TSLA"),
  NVDA:  mk("NVDA", "NVIDIA", "#76b900", "N", "stock", "xyz", "NASDAQ:NVDA"),
  AAPL:  mk("AAPL", "Apple", "#a2aaad", "", "stock", "xyz", "NASDAQ:AAPL"),
  MSFT:  mk("MSFT", "Microsoft", "#00a4ef", "M", "stock", "xyz", "NASDAQ:MSFT"),
  GOOGL: mk("GOOGL", "Alphabet", "#4285f4", "G", "stock", "xyz", "NASDAQ:GOOGL"),
  AMZN:  mk("AMZN", "Amazon", "#ff9900", "a", "stock", "xyz", "NASDAQ:AMZN"),
  META:  mk("META", "Meta", "#0668e1", "M", "stock", "xyz", "NASDAQ:META"),
  AMD:   mk("AMD", "AMD", "#ed1c24", "A", "stock", "xyz", "NASDAQ:AMD"),
  MSTR:  mk("MSTR", "MicroStrategy", "#f7931a", "M", "stock", "xyz", "NASDAQ:MSTR"),
  COIN:  mk("COIN", "Coinbase", "#0052ff", "C", "stock", "xyz", "NASDAQ:COIN"),
  PLTR:  mk("PLTR", "Palantir", "#101113", "P", "stock", "xyz", "NASDAQ:PLTR"),
  ORCL:  mk("ORCL", "Oracle", "#f80000", "O", "stock", "xyz", "NYSE:ORCL"),
  SPCX:  mk("SPCX", "SpaceX (pre-IPO)", "#005288", "S", "stock", "xyz", "AMEX:SPY"),
  INTC:  mk("INTC", "Intel", "#0071c5", "i", "stock", "xyz", "NASDAQ:INTC"),
  MU:    mk("MU", "Micron", "#0066b3", "M", "stock", "xyz", "NASDAQ:MU"),
  CRCL:  mk("CRCL", "Circle", "#4ade80", "C", "stock", "xyz", "NYSE:CRCL"),
  HOOD:  mk("HOOD", "Robinhood", "#00c805", "H", "stock", "xyz", "NASDAQ:HOOD"),
  NFLX:  mk("NFLX", "Netflix", "#e50914", "N", "stock", "xyz", "NASDAQ:NFLX"),
  // ── Commodities (xyz dex) ──
  GOLD:     mk("GOLD", "Gold", "#ffd700", "Au", "commodity", "xyz", "OANDA:XAUUSD"),
  SILVER:   mk("SILVER", "Silver", "#c0c0c0", "Ag", "commodity", "xyz", "OANDA:XAGUSD"),
  CL:       mk("CL", "Crude Oil (WTI)", "#3d3d3d", "Oil", "commodity", "xyz", "TVC:USOIL"),
  BRENTOIL: mk("BRENTOIL", "Brent Oil", "#2d2d2d", "Br", "commodity", "xyz", "TVC:UKOIL"),
  NATGAS:   mk("NATGAS", "Natural Gas", "#4a90d9", "NG", "commodity", "xyz", "TVC:NATGASUSD"),
  COPPER:   mk("COPPER", "Copper", "#b87333", "Cu", "commodity", "xyz", "TVC:COPPER"),
};

// All ticker symbols, grouped for the UI picker
export const ASSET_LIST: Asset[] = Object.keys(ASSETS);
export const DEFAULT_WATCHLIST: Asset[] = ["BTC", "ETH", "SOL", "HYPE"];

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
  stratPattern?: string | null;
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
  note?: string;        // why the bot took this trade
  confidence?: number;  // confidence at entry
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
  note?: string;        // why the bot took this trade
  confidence?: number;  // confidence at entry
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
