import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";
import { prisma } from "@/lib/prisma";

async function getUser(req?: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.isAuthenticated || !session.address) return null;
  return prisma.user.findUnique({ where: { address: session.address } });
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const strategies = await prisma.strategy.findMany({
    where: { userId: user.id },
    include: { conditions: { orderBy: { order: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(strategies);
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

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
}
