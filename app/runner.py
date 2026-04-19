import argparse
import html
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import db
from app.services import import_stocks_csv, list_notifications, list_signals, list_stocks, run_analysis, send_line_notification


STATE_PATH = ROOT_DIR / "data" / "notification_state.json"


def load_state() -> Dict[str, Any]:
    if not STATE_PATH.exists():
        return {"notified": {}}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"notified": {}}


def save_state(state: Dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def import_watchlist(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"created": 0, "updated": 0, "errors": [{"line": 0, "message": f"{path} が見つかりません。"}]}
    return import_stocks_csv(path.read_text(encoding="utf-8"))


def notify_latest_signals() -> List[Dict[str, Any]]:
    state = load_state()
    notified = state.setdefault("notified", {})
    latest_by_stock: Dict[int, Dict[str, Any]] = {}
    for signal in list_signals(500):
        latest_by_stock.setdefault(signal["stock_id"], signal)

    results = []
    for signal in latest_by_stock.values():
        if not signal["should_notify"]:
            continue
        signature = f"{signal['code']}|{signal['signal_type']}|{signal['score']}|{signal['risk_level']}"
        if notified.get(signal["code"]) == signature:
            results.append({"code": signal["code"], "status": "skipped", "reason": "same_signature"})
            continue
        result = send_line_notification(signal["id"])
        if result.get("status") == "sent":
            notified[signal["code"]] = signature
            state["updated_at"] = datetime.now().isoformat(timespec="seconds")
            save_state(state)
        results.append({"code": signal["code"], **result})
    return results


def badge_class(signal_type: str) -> str:
    if any(word in signal_type for word in ["損切り", "撤退", "下落"]):
        return "bad"
    if any(word in signal_type for word in ["利確", "過熱", "注意"]):
        return "warn"
    if "買い" in signal_type:
        return "good"
    return "neutral"


def yen(value: Any) -> str:
    if value is None:
        return "-"
    try:
        return f"{float(value):,.2f}"
    except (TypeError, ValueError):
        return "-"


def export_report(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    stocks = list_stocks()
    signals = list_signals(50)
    notifications = list_notifications(20)
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rows = []
    for stock in stocks:
        signal_type = stock.get("signal_type") or stock.get("last_signal") or "-"
        rows.append(
            "<tr>"
            f"<td>{html.escape(stock['code'])}</td>"
            f"<td><strong>{html.escape(stock['name'])}</strong><br><small>{html.escape(stock.get('tags') or '')}</small></td>"
            f"<td>{yen(stock.get('latest_close'))}</td>"
            f"<td>{yen(stock.get('price_change_pct'))}%</td>"
            f"<td>{yen(stock.get('volume_ratio'))}倍</td>"
            f"<td><span class='badge {badge_class(signal_type)}'>{html.escape(signal_type)}</span></td>"
            f"<td>{stock.get('score') if stock.get('score') is not None else '-'}</td>"
            f"<td>{html.escape(stock.get('risk_level') or '-')}</td>"
            f"<td>{html.escape(stock.get('last_data_at') or '-')}</td>"
            "</tr>"
        )
    signal_items = []
    for signal in signals[:12]:
        reasons = "".join(f"<li>{html.escape(reason)}</li>" for reason in signal["reasons"][:3])
        signal_items.append(
            "<article>"
            f"<h3>{html.escape(signal['code'])} {html.escape(signal['name'])} "
            f"<span class='badge {badge_class(signal['signal_type'])}'>{html.escape(signal['signal_type'])}</span></h3>"
            f"<p>{signal['score']}点 / {html.escape(signal['strength'])} / リスク:{html.escape(signal['risk_level'])}</p>"
            f"<ul>{reasons}</ul>"
            "</article>"
        )
    notification_items = []
    for item in notifications:
        notification_items.append(
            "<article>"
            f"<strong>{html.escape(item['code'])} {html.escape(item['name'])}</strong>"
            f"<p>{html.escape(item['created_at'])} / {html.escape(item['status'])}</p>"
            f"<p>{html.escape(item.get('error') or '')}</p>"
            "</article>"
        )
    document = f"""<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>日本株AIシグナルbot レポート</title>
  <style>
    body {{ margin: 0; background: #f6f8fb; color: #15202b; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; }}
    header, main {{ max-width: 1120px; margin: 0 auto; padding: 24px; }}
    header {{ display: flex; justify-content: space-between; gap: 16px; align-items: end; }}
    h1 {{ margin: 0; font-size: 28px; }}
    h2 {{ font-size: 20px; }}
    .notice, section {{ background: white; border: 1px solid #d7dee8; border-radius: 8px; padding: 16px; margin-bottom: 18px; }}
    table {{ width: 100%; border-collapse: collapse; min-width: 860px; }}
    .table-wrap {{ overflow-x: auto; }}
    th, td {{ border-bottom: 1px solid #d7dee8; padding: 10px 8px; text-align: left; vertical-align: top; }}
    th, small, .muted {{ color: #5d6b7a; }}
    .badge {{ border-radius: 6px; display: inline-block; font-size: 12px; font-weight: 700; padding: 3px 8px; }}
    .good {{ background: #dff4e9; color: #147a4a; }}
    .warn {{ background: #fff1d6; color: #a76500; }}
    .bad {{ background: #fee4e2; color: #b42318; }}
    .neutral {{ background: #e8edf3; color: #334155; }}
    article {{ border-top: 1px solid #d7dee8; padding: 12px 0; }}
    article:first-child {{ border-top: 0; }}
  </style>
</head>
<body>
  <header>
    <div>
      <p class="muted">日本株AIシグナルbot</p>
      <h1>シグナルレポート</h1>
    </div>
    <p class="muted">更新: {html.escape(generated_at)}</p>
  </header>
  <main>
    <div class="notice"><strong>免責:</strong> 本システムは投資助言ではありません。表示内容は売買を推奨・保証するものではなく、最終判断は利用者本人が行ってください。</div>
    <section>
      <h2>監視銘柄</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>コード</th><th>銘柄名</th><th>現在値</th><th>前日比</th><th>出来高倍率</th><th>シグナル</th><th>スコア</th><th>リスク</th><th>更新</th></tr></thead>
          <tbody>{''.join(rows)}</tbody>
        </table>
      </div>
    </section>
    <section>
      <h2>最新シグナル</h2>
      {''.join(signal_items) or '<p class="muted">シグナルはまだありません。</p>'}
    </section>
    <section>
      <h2>通知履歴</h2>
      {''.join(notification_items) or '<p class="muted">通知履歴はまだありません。</p>'}
    </section>
  </main>
</body>
</html>
"""
    path.write_text(document, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run stock signal analysis for scheduled environments.")
    parser.add_argument("--watchlist", default="config/watchlist.csv", help="CSV watchlist path.")
    parser.add_argument("--notify", action="store_true", help="Send LINE notifications for important signals.")
    parser.add_argument("--export-report", default="docs/index.html", help="Static HTML report path.")
    args = parser.parse_args()

    db.init_db()
    imported = import_watchlist(ROOT_DIR / args.watchlist)
    analysis = run_analysis(notify=False)
    notification_results = notify_latest_signals() if args.notify else []
    state = load_state()
    state.setdefault("updated_at", datetime.now().isoformat(timespec="seconds"))
    save_state(state)
    export_report(ROOT_DIR / args.export_report)
    print(json.dumps({"import": imported, "analysis": analysis, "notifications": notification_results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
