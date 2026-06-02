import type { Asset, Direction, Strategy, Trade } from "@/types";

export interface PaperTrade extends Trade {
  mode: "paper";
}

export class PaperTradingEngine {
  private paperBalance: number = 10000; // $10k virtual
  private openTrades: Map<string, PaperTrade> = new Map();

  getBalance(): number {
    return this.paperBalance;
  }

  openTrade(params: {
    asset: Asset;
    direction: Direction;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    size: number;
    leverage: number;
    strategyId?: string;
    userId: string;
    aiSignal?: Trade["aiSignal"];
  }): PaperTrade | null {
    const margin = (params.size * params.entryPrice) / params.leverage;
    if (margin > this.paperBalance) return null;

    const trade: PaperTrade = {
      id: `paper_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: params.userId,
      strategyId: params.strategyId,
      asset: params.asset,
      direction: params.direction,
      entryPrice: params.entryPrice,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      size: params.size,
      leverage: params.leverage,
      status: "open",
      mode: "paper",
      openedAt: new Date().toISOString(),
      aiSignal: params.aiSignal,
    };

    this.openTrades.set(trade.id, trade);
    this.paperBalance -= margin;
    return trade;
  }

  closeTrade(
    tradeId: string,
    exitPrice: number,
    reason: Trade["closeReason"]
  ): PaperTrade | null {
    const trade = this.openTrades.get(tradeId);
    if (!trade) return null;

    const priceDiff =
      trade.direction === "long"
        ? exitPrice - trade.entryPrice
        : trade.entryPrice - exitPrice;

    const pnl = priceDiff * trade.size * trade.leverage;
    const pnlPercent = (priceDiff / trade.entryPrice) * 100 * trade.leverage;
    const margin = (trade.size * trade.entryPrice) / trade.leverage;

    const closedTrade: PaperTrade = {
      ...trade,
      exitPrice,
      pnl,
      pnlPercent,
      status: "closed",
      closeReason: reason,
      closedAt: new Date().toISOString(),
    };

    this.openTrades.delete(tradeId);
    this.paperBalance += margin + pnl;
    return closedTrade;
  }

  checkStopLossAndTakeProfit(
    currentPrices: Record<Asset, number>
  ): Array<{ tradeId: string; reason: "sl" | "tp"; exitPrice: number }> {
    const triggers: Array<{ tradeId: string; reason: "sl" | "tp"; exitPrice: number }> = [];

    for (const [id, trade] of Array.from(this.openTrades.entries())) {
      const price = currentPrices[trade.asset as Asset];
      if (!price) continue;

      if (trade.direction === "long") {
        if (price <= trade.stopLoss)
          triggers.push({ tradeId: id, reason: "sl", exitPrice: price });
        else if (price >= trade.takeProfit)
          triggers.push({ tradeId: id, reason: "tp", exitPrice: price });
      } else {
        if (price >= trade.stopLoss)
          triggers.push({ tradeId: id, reason: "sl", exitPrice: price });
        else if (price <= trade.takeProfit)
          triggers.push({ tradeId: id, reason: "tp", exitPrice: price });
      }
    }

    return triggers;
  }

  getOpenTrades(): PaperTrade[] {
    return Array.from(this.openTrades.values());
  }

  resetBalance(amount: number = 10000): void {
    this.paperBalance = amount;
    this.openTrades.clear();
  }
}

export const paperEngine = new PaperTradingEngine();
