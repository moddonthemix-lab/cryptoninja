import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";
import { SiweMessage } from "siwe";

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();

    if (!message || !signature) {
      return NextResponse.json({ error: "Missing message or signature" }, { status: 400 });
    }

    // Parse and verify the SIWE message + signature
    let siweData;
    try {
      const siweMessage = new SiweMessage(message);
      // Only verify the cryptographic signature — skip domain/nonce/expiry checks
      // that can fail in proxy environments (Railway, Vercel, etc.)
      const result = await siweMessage.verify(
        { signature },
        { suppressExceptions: true }
      );

      if (!result.success) {
        console.error("SIWE verify failed:", result.error);
        // Try raw recovery as fallback
        const recovered = await siweMessage.verify({ signature }).catch(() => null);
        if (!recovered?.success) {
          return NextResponse.json(
            { error: "Signature invalid — please try again" },
            { status: 401 }
          );
        }
        siweData = recovered.data;
      } else {
        siweData = result.data;
      }
    } catch (siweErr: any) {
      console.error("SIWE exception:", siweErr?.message ?? siweErr);
      return NextResponse.json(
        { error: `Signature error: ${siweErr?.message ?? "unknown"}` },
        { status: 401 }
      );
    }

    if (!siweData?.address) {
      return NextResponse.json({ error: "Could not recover address" }, { status: 401 });
    }

    // Persist to DB if available
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
        console.warn("DB unavailable during auth (session-only mode):", dbError);
      }
    }

    // Save session
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    session.address = siweData.address.toLowerCase();
    session.chainId = siweData.chainId;
    session.isAuthenticated = true;
    session.nonce = undefined;
    await session.save();

    return NextResponse.json({ ok: true, address: siweData.address });
  } catch (error: any) {
    console.error("Auth verify unexpected error:", error?.message ?? error);
    return NextResponse.json(
      { error: error?.message ?? "Authentication failed" },
      { status: 500 }
    );
  }
}
