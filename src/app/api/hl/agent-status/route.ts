import { NextResponse } from "next/server";
import { isAgentConfigured, getAgentAccount } from "@/lib/hl-agent";

export async function GET() {
  const configured = isAgentConfigured();
  return NextResponse.json({
    configured,
    // Return the agent address (not the key) so the UI can verify it matches HL
    agentAddress: configured ? getAgentAccount()?.address ?? null : null,
  });
}
