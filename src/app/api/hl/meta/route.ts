import { NextResponse } from "next/server";
import { getMeta, HL_COINS } from "@/lib/hyperliquid";

export async function GET() {
  try {
    const meta = await getMeta();
    // Return only our supported assets with their index
    const result: Record<string, { index: number; name: string; maxLeverage: number; szDecimals: number }> = {};

    meta.universe.forEach((asset, index) => {
      if (Object.values(HL_COINS).includes(asset.name)) {
        result[asset.name] = {
          index,
          name: asset.name,
          maxLeverage: asset.maxLeverage,
          szDecimals: asset.szDecimals,
        };
      }
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
