"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberOrNull(value: string) {
  return value === "" ? null : Number(value);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function upsertStock(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = text(formData, "id");
  const payload = {
    user_id: user.id,
    code: text(formData, "code"),
    name: text(formData, "name"),
    tags: text(formData, "tags"),
    memo: text(formData, "memo"),
    watch_status: text(formData, "watch_status") || "normal",
    target_amount: Number(text(formData, "target_amount") || "10000"),
    is_holding: formData.get("is_holding") === "on",
    allow_additional_buy: formData.get("allow_additional_buy") === "on",
    holding_price: numberOrNull(text(formData, "holding_price")),
    holding_shares: numberOrNull(text(formData, "holding_shares")),
  };

  const result = id
    ? await supabase.from("stocks").update(payload).eq("id", id)
    : await supabase.from("stocks").insert(payload);

  if (result.error) {
    redirect(`/stocks?message=${encodeURIComponent(result.error.message)}`);
  }
  revalidatePath("/stocks");
  revalidatePath("/dashboard");
  redirect("/stocks");
}

export async function deleteStock(formData: FormData) {
  const id = text(formData, "id");
  const supabase = await createClient();
  const { error } = await supabase.from("stocks").delete().eq("id", id);
  if (error) redirect(`/stocks?message=${encodeURIComponent(error.message)}`);
  revalidatePath("/stocks");
  revalidatePath("/dashboard");
}

export async function saveInvestmentProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const minHorizon = Math.max(1, Number(text(formData, "min_horizon_days") || "3"));
  const maxHorizon = Math.max(minHorizon, Number(text(formData, "max_horizon_days") || "20"));
  const payload = {
    user_id: user.id,
    broker: "sbi",
    budget_yen: Math.max(1000, Math.min(1000000, Number(text(formData, "budget_yen") || "10000"))),
    reserve_rate: Math.max(0, Math.min(0.3, Number(text(formData, "reserve_rate") || "5") / 100)),
    max_positions: Math.max(1, Math.min(10, Number(text(formData, "max_positions") || "2"))),
    min_horizon_days: minHorizon,
    max_horizon_days: Math.min(365, maxHorizon),
    odd_lot_enabled: true,
  };
  const { error } = await supabase.from("investment_profiles").upsert(payload, { onConflict: "user_id" });
  if (error) redirect(`/loop?message=${encodeURIComponent(error.message)}`);
  revalidatePath("/loop");
  revalidatePath("/dashboard");
  redirect("/loop?message=投資条件を保存しました");
}

export async function startAnalysisLoop(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: active } = await supabase
    .from("analysis_loop_runs")
    .select("id,status")
    .eq("user_id", user.id)
    .in("status", ["queued", "running"])
    .limit(1);
  if (active?.length) redirect("/loop?message=分析はすでに実行待ち、または実行中です");

  const iterationLimit = Math.max(1, Math.min(10, Number(text(formData, "iteration_limit") || "3")));
  const { error } = await supabase.from("analysis_loop_runs").insert({
    user_id: user.id,
    iteration_limit: iterationLimit,
    objective: "SBI証券のS株で1万円前後の資金に適した日本株候補をWeb調査する",
  });
  if (error) redirect(`/loop?message=${encodeURIComponent(error.message)}`);
  revalidatePath("/loop");
  revalidatePath("/dashboard");
  redirect("/loop?message=分析を受け付けました。Codexワーカーが順番に処理します");
}
