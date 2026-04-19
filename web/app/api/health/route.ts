import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "trade-signal-web",
    timestamp: new Date().toISOString(),
  });
}

