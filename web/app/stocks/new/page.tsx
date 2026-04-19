import { redirect } from "next/navigation";
import { StockForm } from "@/components/stock-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewStockPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main>
      <section className="panel">
        <h1>銘柄追加</h1>
        <StockForm />
      </section>
    </main>
  );
}

