import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  if (!email) {
    return NextResponse.redirect(new URL("/login?message=メールアドレスを入力してください。", origin), 303);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return NextResponse.redirect(new URL(`/login?message=${encodeURIComponent(error.message)}`, origin), 303);
  }

  return NextResponse.redirect(new URL("/login?message=ログイン用メールを送信しました。", origin), 303);
}

