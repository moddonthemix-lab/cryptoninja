import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";
import { verifySiweMessage } from "@/lib/siwe";

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    const result = await verifySiweMessage(message, signature);

    if (!result.success) {
      return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
    }

    const siweData = result.data;

    if (siweData.nonce !== session.nonce) {
      return NextResponse.json({ error: "Invalid nonce" }, { status: 401 });
    }

    // Try to persist user in DB — fail silently if DB not configured yet
    if (process.env.DATABASE_URL) {
      try {
        const { prisma } = await import("@/lib/prisma");
        await prisma.user.upsert({
          where: { address: siweData.address.toLowerCase() },
          create: {
            address: siweData.address.toLowerCase(),
            nonce: siweData.nonce,
            riskSettings: {
              create: {
                maxLeverage: 5,
                maxPositionSize: 10,
                maxDailyLoss: 5,
                maxDrawdown: 20,
                maxOpenPositions: 3,
                requireConfirm: true,
              },
            },
          },
          update: { nonce: siweData.nonce, updatedAt: new Date() },
        });
      } catch (dbError) {
        // DB unavailable — still allow login, just won't persist
        console.warn("DB unavailable during auth, session-only mode:", dbError);
      }
    }

    session.address = siweData.address.toLowerCase();
    session.chainId = siweData.chainId;
    session.isAuthenticated = true;
    await session.save();

    return NextResponse.json({ ok: true, address: siweData.address });
  } catch (error) {
    console.error("Verify error:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
