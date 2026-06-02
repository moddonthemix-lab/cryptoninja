import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";

async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json([]);
  const session = await getSession();
  if (!session.isAuthenticated || !session.address)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({ where: { address: session.address } });
    if (!user) return NextResponse.json([]);

    const strategies = await prisma.strategy.findMany({
      where: { userId: user.id },
      include: { conditions: { orderBy: { order: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(strategies);
  } catch (e) {
    console.error(e);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // No-DB mode: return a client-side-only strategy object so the store can hold it
  if (!process.env.DATABASE_URL) {
    const strategy = {
      id: `local_${Date.now()}`,
      userId: "local",
      name: body.name ?? "Unnamed",
      description: body.description ?? "",
      asset: body.asset ?? "BTC",
      direction: body.direction ?? "long",
      leverage: body.leverage ?? 3,
      positionSizeType: body.positionSizeType ?? "percent",
      positionSize: body.positionSize ?? 1,
      stopLoss: body.stopLoss ?? 1.5,
      takeProfit: body.takeProfit ?? 3,
      trailingStop: body.trailingStop ?? false,
      trailingStopPct: body.trailingStopPct ?? 1,
      maxDailyLoss: body.maxDailyLoss ?? 5,
      maxTradesPerDay: body.maxTradesPerDay ?? 5,
      cooldownMinutes: body.cooldownMinutes ?? 30,
      mode: body.mode ?? "paper",
      isActive: false,
      isPaused: false,
      aiEnabled: body.aiEnabled !== false,
      newsFilter: body.newsFilter !== false,
      conditions: body.conditions ?? [],
      stratPattern: body.stratPattern ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json(strategy, { status: 201 });
  }
  const session = await getSession();
  if (!session.isAuthenticated || !session.address)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({ where: { address: session.address } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const strategy = await prisma.strategy.create({
      data: {
        userId: user.id,
        name: body.name,
        description: body.description,
        asset: body.asset,
        direction: body.direction,
        leverage: body.leverage,
        positionSizeType: body.positionSizeType,
        positionSize: body.positionSize,
        stopLoss: body.stopLoss,
        takeProfit: body.takeProfit,
        trailingStop: body.trailingStop || false,
        trailingStopPct: body.trailingStopPct,
        maxDailyLoss: body.maxDailyLoss,
        maxTradesPerDay: body.maxTradesPerDay,
        cooldownMinutes: body.cooldownMinutes || 0,
        mode: body.mode || "paper",
        aiEnabled: body.aiEnabled !== false,
        timeFilter: body.timeFilter,
        newsFilter: body.newsFilter !== false,
        conditions: {
          create: (body.conditions || []).map((c: any, i: number) => ({
            type: c.type,
            indicator: c.indicator,
            operator: c.operator,
            value: c.value,
            period: c.period,
            description: c.description,
            order: i,
          })),
        },
      },
      include: { conditions: true },
    });
    return NextResponse.json(strategy, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create strategy" }, { status: 500 });
  }
}
