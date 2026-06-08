export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getIntelSnapshot } from "@/lib/intel";

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Ask a question" }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "AI not configured (ANTHROPIC_API_KEY)" }, { status: 503 });
    }

    const snap = await getIntelSnapshot();

    // Compact data table for the model
    const fmt = (n: number) => Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n.toFixed(0)}`;
    const lines = snap.wallets.map((w, i) => {
      const pos = w.positions.length
        ? w.positions.map((p) => `${p.dir === "long" ? "L" : "S"}:${p.sym}($${fmt(p.notional)},${p.lev}x,${p.upnl >= 0 ? "+" : ""}${fmt(p.upnl)},${p.category})`).join(" ")
        : "flat";
      return `${i + 1}. ${w.name || w.address.slice(0, 8)} ${w.address} | eq $${fmt(w.accountValue)} | 30dROI ${w.roi.toFixed(0)}% PnL $${fmt(w.pnl)} vol $${fmt(w.vlm)} | ${pos}`;
    }).join("\n");

    const prompt = `You are "Deep Eye", an analyst over Hyperliquid's top traders. Below is a live snapshot of the top ${snap.wallets.length} wallets by 30-day volume, with their CURRENT open positions.

Legend: L=long S=short. Position = SIDE:TICKER($notional,leverage,unrealizedPnL,category). Categories: crypto, stock (tokenized equities), commodity (oil=CL/BRENTOIL, gold=GOLD, etc.). SpaceX = SPCX.

SNAPSHOT (refreshed ${Math.round((Date.now() - snap.ts) / 60000)}m ago):
${lines}

Answer the user's question using ONLY this data. Be concise and specific: cite wallet addresses (shortened like 0x1234…abcd) and real numbers. For "top/most" questions, give a ranked list (top 5-10) with the metric. If the data doesn't contain the answer, say so plainly. Note this is the top-volume wallet set, not every wallet on Hyperliquid.

QUESTION: ${question}`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });
    const answer = msg.content[0].type === "text" ? msg.content[0].text : "No answer.";

    // Compact wallet list so the UI can offer one-tap Track / Copy
    const wallets = snap.wallets.slice(0, 25).map((w) => ({
      address: w.address, name: w.name, accountValue: w.accountValue, roi: w.roi,
      assets: Array.from(new Set(w.positions.map((p) => p.sym))).slice(0, 6),
    }));

    return NextResponse.json({ answer, scanned: snap.wallets.length, ts: snap.ts, wallets });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
