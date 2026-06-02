import Anthropic from "@anthropic-ai/sdk";
import type { Asset, AISignal, Candle, MarketData } from "@/types";

// Lazy init — avoids crash at build time when key isn't present
function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  return new Anthropic({ apiKey: key });
}

export async function getAITradingSignal(
  asset: Asset,
  candles: Candle[],
  marketData: MarketData,
  strategyContext?: string
): Promise<AISignal> {
  const recentCandles = candles.slice(-20);
  const prices = recentCandles.map((c) => c.close);
  const rsi = calculateRSI(prices);
  const trend = detectTrend(prices);
  const support = Math.min(...recentCandles.map((c) => c.low));
  const resistance = Math.max(...recentCandles.map((c) => c.high));

  const prompt = `You are a professional crypto trading analyst for CryptoNinja platform.
Analyze ${asset}/USDT and provide a trading signal.

Current market data:
- Price: $${marketData.price.toFixed(4)}
- 24h Change: ${marketData.changePercent24h.toFixed(2)}%
- 24h Volume: $${(marketData.volume24h / 1e6).toFixed(1)}M
- 24h High: $${marketData.high24h.toFixed(4)}
- 24h Low: $${marketData.low24h.toFixed(4)}

Technical indicators:
- RSI(14): ${rsi.toFixed(1)}
- Trend: ${trend}
- Recent Support: $${support.toFixed(4)}
- Recent Resistance: $${resistance.toFixed(4)}
- Last 5 closes: ${prices.slice(-5).map((p) => `$${p.toFixed(2)}`).join(", ")}

${strategyContext ? `Strategy context: ${strategyContext}` : ""}

Provide your analysis in this exact JSON format:
{
  "direction": "long" or "short",
  "confidence": 0-100 number,
  "reasoning": "2-3 sentence explanation of why",
  "risk": "low", "medium", or "high",
  "suggestedEntry": price number,
  "suggestedSL": stop loss price number,
  "suggestedTP": take profit price number,
  "suggestedLeverage": 1-10 number,
  "indicators": {
    "rsi": ${rsi.toFixed(1)},
    "trend": "${trend}",
    "support": ${support.toFixed(4)},
    "resistance": ${resistance.toFixed(4)},
    "volume": "${marketData.volume24h > 1e8 ? "high" : marketData.volume24h > 1e7 ? "medium" : "low"}"
  }
}

IMPORTANT: This is for educational/paper trading purposes. Always err on the side of caution. If conditions are unclear, recommend lower confidence and lower leverage. Never suggest leverage above 10x.`;

  try {
    const message = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      asset,
      direction: parsed.direction || "long",
      confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
      reasoning: parsed.reasoning || "Analysis unavailable",
      indicators: parsed.indicators || { rsi, trend, support, resistance },
      suggestedEntry: parsed.suggestedEntry || marketData.price,
      suggestedSL: parsed.suggestedSL,
      suggestedTP: parsed.suggestedTP,
      suggestedLeverage: Math.min(10, Math.max(1, parsed.suggestedLeverage || 2)),
      risk: parsed.risk || "medium",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("AI signal error:", error);
    return {
      asset,
      direction: "long",
      confidence: 0,
      reasoning: "AI analysis temporarily unavailable. Please check your API key.",
      indicators: { rsi, trend, support, resistance },
      suggestedEntry: marketData.price,
      risk: "high",
      timestamp: new Date().toISOString(),
    };
  }
}

export async function getAIMarketOverview(
  marketData: Record<string, MarketData>
): Promise<string> {
  const assets = Object.values(marketData);
  const summary = assets
    .map(
      (m) =>
        `${m.asset}: $${m.price.toFixed(2)} (${m.changePercent24h > 0 ? "+" : ""}${m.changePercent24h.toFixed(2)}%)`
    )
    .join(", ");

  try {
    const message = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are a crypto market analyst. Give a brief 2-3 sentence market overview based on: ${summary}. Focus on overall sentiment and key observations. Be concise and professional.`,
        },
      ],
    });
    const content = message.content[0];
    return content.type === "text" ? content.text : "Market analysis unavailable.";
  } catch {
    return "Market analysis temporarily unavailable.";
  }
}

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0,
    losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function detectTrend(prices: number[]): string {
  if (prices.length < 5) return "sideways";
  const first = prices.slice(0, Math.floor(prices.length / 2));
  const second = prices.slice(Math.floor(prices.length / 2));
  const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
  const secondAvg = second.reduce((a, b) => a + b, 0) / second.length;
  const change = (secondAvg - firstAvg) / firstAvg;
  if (change > 0.02) return "uptrend";
  if (change < -0.02) return "downtrend";
  return "sideways";
}
