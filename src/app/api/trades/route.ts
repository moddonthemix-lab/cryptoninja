import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";

export async function GET(req: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.json([]);
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.isAuthenticated || !session.address)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({ where: { address: session.address } });
    if (!user) return NextResponse.json([]);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");

    const trades = await prisma.trade.findMany({
      where: { userId: user.id, ...(status ? { status } : {}) },
      orderBy: { openedAt: "desc" },
      take: limit,
    });
    return NextResponse.json(trades);
  } catch (e) {
    console.error(e);
    return NextResponse.json([]);
  }
}
