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
  BB:    mk("BB", "BlackBerry", "#000000", "B", "stock", "xyz", "NYSE:BB"),
  IBM:   mk("IBM", "IBM", "#0530ad", "I", "stock", "xyz", "NYSE:IBM"),
  HIMS:  mk("HIMS", "Hims & Hers", "#2e2e57", "H", "stock", "xyz", "NYSE:HIMS"),
  RKLB:  mk("RKLB", "Rocket Lab", "#1a1a1a", "R", "stock", "xyz", "NASDAQ:RKLB"),
  EBAY:  mk("EBAY", "eBay", "#e53238", "e", "stock", "xyz", "NASDAQ:EBAY"),
  DELL:  mk("DELL", "Dell", "#007db8", "D", "stock", "xyz", "NYSE:DELL"),
  NOW:   mk("NOW", "ServiceNow", "#62d84e", "N", "stock", "xyz", "NYSE:NOW"),
  // ── Commodities (xyz dex) ──
  // DRAM has no CEX/TradingView listing — empty tvSymbol routes it to the
  // native Hyperliquid candle chart (see TradingViewWidget → NativeChart).
  DRAM:     mk("DRAM", "DRAM (memory)", "#22d3ee", "🧠", "commodity", "xyz", ""),
  GOLD:     mk("GOLD", "Gold", "#ffd700", "Au", "commodity", "xyz", "OANDA:XAUUSD"),
  SILVER:   mk("SILVER", "Silver", "#c0c0c0", "Ag", "commodity", "xyz", "OANDA:XAGUSD"),
  CL:       mk("CL", "Crude Oil (WTI)", "#3d3d3d", "Oil", "commodity", "xyz", "TVC:USOIL"),
  BRENTOIL: mk("BRENTOIL", "Brent Oil", "#2d2d2d", "Br", "commodity", "xyz", "TVC:UKOIL"),
  NATGAS:   mk("NATGAS", "Natural Gas", "#4a90d9", "NG", "commodity", "xyz", "TVC:NATGASUSD"),
  COPPER:   mk("COPPER", "Copper", "#b87333", "Cu", "commodity", "xyz", "TVC:COPPER"),

  // ── Auto-added xyz markets (all remaining markets on the xyz dex) ──
  XYZ100: mk("XYZ100", "XYZ 100 Index", "#818cf8", "X", "stock", "xyz", ""),
  SNDK: mk("SNDK", "SanDisk", "#94a3b8", "S", "stock", "xyz", ""),
  COST: mk("COST", "Costco", "#94a3b8", "C", "stock", "xyz", ""),
  LLY: mk("LLY", "Eli Lilly", "#94a3b8", "L", "stock", "xyz", ""),
  SKHX: mk("SKHX", "SKHX", "#94a3b8", "S", "stock", "xyz", ""),
  TSM: mk("TSM", "TSMC", "#94a3b8", "T", "stock", "xyz", ""),
  JPY: mk("JPY", "Japanese Yen", "#4ade80", "J", "stock", "xyz", ""),
  EUR: mk("EUR", "Euro", "#4ade80", "E", "stock", "xyz", ""),
  RIVN: mk("RIVN", "Rivian", "#94a3b8", "R", "stock", "xyz", ""),
  BABA: mk("BABA", "Alibaba", "#94a3b8", "B", "stock", "xyz", ""),
  URANIUM: mk("URANIUM", "Uranium", "#fbbf24", "U", "commodity", "xyz", ""),
  ALUMINIUM: mk("ALUMINIUM", "Aluminium", "#fbbf24", "A", "commodity", "xyz", ""),
  SMSN: mk("SMSN", "Samsung", "#94a3b8", "S", "stock", "xyz", ""),
  PLATINUM: mk("PLATINUM", "Platinum", "#fbbf24", "P", "commodity", "xyz", ""),
  USAR: mk("USAR", "USAR", "#94a3b8", "U", "stock", "xyz", ""),
  CRWV: mk("CRWV", "CoreWeave", "#94a3b8", "C", "stock", "xyz", ""),
  URNM: mk("URNM", "Uranium ETF", "#38bdf8", "U", "stock", "xyz", ""),
  PALLADIUM: mk("PALLADIUM", "Palladium", "#fbbf24", "P", "commodity", "xyz", ""),
  DXY: mk("DXY", "Dollar Index", "#4ade80", "D", "stock", "xyz", ""),
  GME: mk("GME", "GameStop", "#94a3b8", "G", "stock", "xyz", ""),
  KR200: mk("KR200", "KOSPI 200", "#818cf8", "K", "stock", "xyz", ""),
  SOFTBANK: mk("SOFTBANK", "SoftBank", "#94a3b8", "S", "stock", "xyz", ""),
  JP225: mk("JP225", "Nikkei 225", "#818cf8", "J", "stock", "xyz", ""),
  HYUNDAI: mk("HYUNDAI", "Hyundai", "#94a3b8", "H", "stock", "xyz", ""),
  KIOXIA: mk("KIOXIA", "Kioxia", "#94a3b8", "K", "stock", "xyz", ""),
  EWY: mk("EWY", "Korea ETF", "#38bdf8", "E", "stock", "xyz", ""),
  EWJ: mk("EWJ", "Japan ETF", "#38bdf8", "E", "stock", "xyz", ""),
  VIX: mk("VIX", "Volatility Index", "#818cf8", "V", "stock", "xyz", ""),
  SP500: mk("SP500", "S&P 500", "#818cf8", "S", "stock", "xyz", ""),
  DKNG: mk("DKNG", "DKNG", "#94a3b8", "D", "stock", "xyz", ""),
  LITE: mk("LITE", "LITE", "#94a3b8", "L", "stock", "xyz", ""),
  CORN: mk("CORN", "Corn", "#fbbf24", "C", "commodity", "xyz", ""),
  XLE: mk("XLE", "Energy ETF", "#38bdf8", "X", "stock", "xyz", ""),
  WHEAT: mk("WHEAT", "Wheat", "#fbbf24", "W", "commodity", "xyz", ""),
  TTF: mk("TTF", "Dutch TTF Gas", "#fbbf24", "T", "commodity", "xyz", ""),
  BX: mk("BX", "Blackstone", "#94a3b8", "B", "stock", "xyz", ""),
  PURRDAT: mk("PURRDAT", "PURRDAT", "#94a3b8", "P", "stock", "xyz", ""),
  MRVL: mk("MRVL", "Marvell", "#94a3b8", "M", "stock", "xyz", ""),
  BIRD: mk("BIRD", "BIRD", "#94a3b8", "B", "stock", "xyz", ""),
  VOL: mk("VOL", "Volatility", "#818cf8", "V", "stock", "xyz", ""),
  CBRS: mk("CBRS", "CBRS", "#94a3b8", "C", "stock", "xyz", ""),
  EWZ: mk("EWZ", "Brazil ETF", "#38bdf8", "E", "stock", "xyz", ""),
  KRW: mk("KRW", "Korean Won", "#4ade80", "K", "stock", "xyz", ""),
  ZM: mk("ZM", "Zoom", "#94a3b8", "Z", "stock", "xyz", ""),
  H100: mk("H100", "H100", "#94a3b8", "H", "stock", "xyz", ""),
  NIFTY: mk("NIFTY", "Nifty 50", "#818cf8", "N", "stock", "xyz", ""),
  ARM: mk("ARM", "Arm Holdings", "#94a3b8", "A", "stock", "xyz", ""),
  EWT: mk("EWT", "Taiwan ETF", "#38bdf8", "E", "stock", "xyz", ""),
  GBP: mk("GBP", "British Pound", "#4ade80", "G", "stock", "xyz", ""),
  IBOV: mk("IBOV", "Bovespa", "#818cf8", "I", "stock", "xyz", ""),
  ASML: mk("ASML", "ASML", "#94a3b8", "A", "stock", "xyz", ""),
  MINIMAX: mk("MINIMAX", "MINIMAX", "#94a3b8", "M", "stock", "xyz", ""),
  QNT: mk("QNT", "QNT", "#94a3b8", "Q", "stock", "xyz", ""),
  AVGO: mk("AVGO", "Broadcom", "#94a3b8", "A", "stock", "xyz", ""),
  NBIS: mk("NBIS", "Nebius", "#94a3b8", "N", "stock", "xyz", ""),
  WDC: mk("WDC", "Western Digital", "#94a3b8", "W", "stock", "xyz", ""),
  NOK: mk("NOK", "Nokia", "#94a3b8", "N", "stock", "xyz", ""),
  SMH: mk("SMH", "Semiconductor ETF", "#38bdf8", "S", "stock", "xyz", ""),
  BE: mk("BE", "Bloom Energy", "#94a3b8", "B", "stock", "xyz", ""),
  ZHIPU: mk("ZHIPU", "ZHIPU", "#94a3b8", "Z", "stock", "xyz", ""),
  QCOM: mk("QCOM", "Qualcomm", "#94a3b8", "Q", "stock", "xyz", ""),
  STRC: mk("STRC", "STRC", "#94a3b8", "S", "stock", "xyz", ""),
  BOT: mk("BOT", "BOT", "#94a3b8", "B", "stock", "xyz", ""),
  AMAT: mk("AMAT", "Applied Materials", "#94a3b8", "A", "stock", "xyz", ""),
  IBIDEN: mk("IBIDEN", "IBIDEN", "#94a3b8", "I", "stock", "xyz", ""),
  GIGADEV: mk("GIGADEV", "GIGADEV", "#94a3b8", "G", "stock", "xyz", ""),
  SHAZ: mk("SHAZ", "SHAZ", "#94a3b8", "S", "stock", "xyz", ""),
  SKHY: mk("SKHY", "SKHY", "#94a3b8", "S", "stock", "xyz", ""),
  KSTR: mk("KSTR", "KSTR", "#94a3b8", "K", "stock", "xyz", ""),
  CXMT: mk("CXMT", "CXMT", "#94a3b8", "C", "stock", "xyz", ""),
  GEV: mk("GEV", "GEV", "#94a3b8", "G", "stock", "xyz", ""),
  KORU: mk("KORU", "KORU", "#94a3b8", "K", "stock", "xyz", ""),
  UNITREE: mk("UNITREE", "UNITREE", "#94a3b8", "U", "stock", "xyz", ""),
  LYTE: mk("LYTE", "LYTE", "#94a3b8", "L", "stock", "xyz", ""),
  NCLD: mk("NCLD", "NCLD", "#94a3b8", "N", "stock", "xyz", ""),
  SOXL: mk("SOXL", "Semis 3x ETF", "#38bdf8", "S", "stock", "xyz", ""),
  MAGS: mk("MAGS", "Mag 7 ETF", "#38bdf8", "M", "stock", "xyz", ""),
  IREN: mk("IREN", "IREN", "#94a3b8", "I", "stock", "xyz", ""),
  NET: mk("NET", "Cloudflare", "#94a3b8", "N", "stock", "xyz", ""),
  CRWD: mk("CRWD", "CrowdStrike", "#94a3b8", "C", "stock", "xyz", ""),
  RDDT: mk("RDDT", "Reddit", "#94a3b8", "R", "stock", "xyz", ""),
  AAOI: mk("AAOI", "AAOI", "#94a3b8", "A", "stock", "xyz", ""),
  MRNA: mk("MRNA", "Moderna", "#94a3b8", "M", "stock", "xyz", ""),
  XBI: mk("XBI", "Biotech ETF", "#38bdf8", "X", "stock", "xyz", ""),
  SHEIN: mk("SHEIN", "SHEIN", "#94a3b8", "S", "stock", "xyz", ""),
  YMTC: mk("YMTC", "YMTC", "#94a3b8", "Y", "stock", "xyz", ""),
  BMNR: mk("BMNR", "BMNR", "#94a3b8", "B", "stock", "xyz", ""),
  SNXX: mk("SNXX", "SNXX", "#94a3b8", "S", "stock", "xyz", ""),
  CVX: mk("CVX", "Chevron", "#94a3b8", "C", "stock", "xyz", ""),
  TLT: mk("TLT", "20Y Treasury ETF", "#38bdf8", "T", "stock", "xyz", ""),
  HO: mk("HO", "Heating Oil", "#fbbf24", "H", "commodity", "xyz", ""),
  OURA: mk("OURA", "OURA", "#94a3b8", "O", "stock", "xyz", ""),
  LRCX: mk("LRCX", "Lam Research", "#94a3b8", "L", "stock", "xyz", ""),
  UMC: mk("UMC", "United Micro", "#94a3b8", "U", "stock", "xyz", ""),
  CAMBRICON: mk("CAMBRICON", "CAMBRICON", "#94a3b8", "C", "stock", "xyz", ""),
  TWST: mk("TWST", "Twist Bio", "#94a3b8", "T", "stock", "xyz", ""),
  GLW: mk("GLW", "Corning", "#94a3b8", "G", "stock", "xyz", ""),
  ACN: mk("ACN", "Accenture", "#94a3b8", "A", "stock", "xyz", ""),
  INNOLIGHT: mk("INNOLIGHT", "INNOLIGHT", "#94a3b8", "I", "stock", "xyz", ""),
};

// All ticker symbols, grouped for the UI picker
export const ASSET_LIST: Asset[] = Object.keys(ASSETS);
export const DEFAULT_WATCHLIST: Asset[] = ["BTC", "ETH", "SOL", "HYPE", "DRAM"];

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
  features?: string[];  // setup feature tags (for per-setup learning)
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
  features?: string[];  // setup feature tags (for per-setup learning)
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
