import { notFound, redirect } from "next/navigation";
import { StockForm } from "@/components/stock-form";
import { createClient } from "@/lib/supabase/server";

export default async function EditStockPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { data: stock } = await supabase.from("stocks").select("*").eq("id", id).single();
  if (!stock) notFound();

  return (
    <main>
      <section className="panel">
        <h1>銘柄編集</h1>
        <StockForm stock={stock} />
      </section>
    </main>
  );
}

