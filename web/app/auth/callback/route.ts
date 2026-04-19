import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/login?message=${encodeURIComponent(error.message)}`, requestUrl.origin));
    }
  } else if (requestUrl.searchParams.get("error")) {
    const message = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error") ?? "ログインに失敗しました。";
    return NextResponse.redirect(new URL(`/login?message=${encodeURIComponent(message)}`, requestUrl.origin));
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
