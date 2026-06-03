import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";
import { verifySiweMessage } from "@/lib/siwe";

export async function POST(req: NextRequest) {
  try {
    // Client also sends the nonce so we can verify without relying on session cookie
    const { message, signature, nonce: clientNonce } = await req.json();
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    const result = await verifySiweMessage(message, signature);

    if (!result.success) {
      console.error("SIWE signature invalid");
      return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
    }

    const siweData = result.data;

    // Validate nonce: check against session if present, otherwise trust the
    // signed message's nonce directly (the signature itself proves authenticity)
    const expectedNonce = session.nonce ?? clientNonce;
    if (expectedNonce && siweData.nonce !== expectedNonce) {
      console.error("Nonce mismatch", { expected: expectedNonce, got: siweData.nonce });
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
        console.warn("DB unavailable during auth, session-only mode:", dbError);
      }
    }

    session.address = siweData.address.toLowerCase();
    session.chainId = siweData.chainId;
    session.isAuthenticated = true;
    session.nonce = undefined; // consume the nonce
    await session.save();

    return NextResponse.json({ ok: true, address: siweData.address });
  } catch (error: any) {
    console.error("Verify error:", error?.message ?? error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
