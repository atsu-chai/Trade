import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const RUN_SIGNAL_BOT_SECRET = process.env.RUN_SIGNAL_BOT_SECRET;

export async function POST() {
  const redirectTo = new URL("/settings", process.env.NEXT_PUBLIC_SITE_URL ?? "https://trade-lime.vercel.app");
  if (!SUPABASE_URL || !RUN_SIGNAL_BOT_SECRET) {
    redirectTo.searchParams.set("message", "RUN_SIGNAL_BOT_SECRET is not configured in Vercel.");
    return NextResponse.redirect(redirectTo, 303);
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/run-signal-bot`, {
    method: "POST",
    headers: {
      "x-bot-secret": RUN_SIGNAL_BOT_SECRET,
    },
  });

  const text = await response.text();
  redirectTo.searchParams.set("message", response.ok ? `Botを実行しました: ${text}` : `Bot実行に失敗しました: ${text}`);
  return NextResponse.redirect(redirectTo, 303);
}
