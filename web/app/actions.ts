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
    target_amount: Number(text(formData, "target_amount") || "100000"),
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
