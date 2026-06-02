import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";
import { generateNonce } from "@/lib/siwe";

export async function GET() {
  try {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    session.nonce = generateNonce();
    await session.save();
    return NextResponse.json({ nonce: session.nonce });
  } catch (error) {
    console.error("Nonce error:", error);
    return NextResponse.json({ error: "Failed to generate nonce" }, { status: 500 });
  }
}
