import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.isAuthenticated || !session.address) {
    return NextResponse.json({ isAuthenticated: false });
  }
  return NextResponse.json({
    isAuthenticated: true,
    address: session.address,
    chainId: session.chainId,
  });
}
