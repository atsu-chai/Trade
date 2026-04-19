import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";

export const metadata: Metadata = {
  title: "日本株AIシグナルbot",
  description: "日本株AIシグナルbot 管理画面",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="ja">
      <body>
        <header className="topbar">
          <div>
            <p className="muted" style={{ margin: 0 }}>
              日本株AIシグナルbot
            </p>
            <strong>Trade Signal</strong>
          </div>
          <nav className="nav">
            {user ? (
              <>
                <Link href="/dashboard">ダッシュボード</Link>
                <Link href="/stocks">銘柄</Link>
                <Link href="/signals">シグナル</Link>
                <Link href="/backtest">バックテスト</Link>
                <Link href="/notifications">通知</Link>
                <Link href="/runs">実行履歴</Link>
                <Link href="/settings">設定</Link>
                <form action={signOut}>
                  <button className="secondary">ログアウト</button>
                </form>
              </>
            ) : (
              <Link className="button secondary" href="/login">
                ログイン
              </Link>
            )}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
