import csv
import hashlib
import os
import random
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from io import StringIO
from typing import Any, Dict, List, Optional

from app import db
from app.indicators import calculate
from app.models import SignalResult, StockInput


VALID_WATCH_STATUSES = {"normal", "strong", "stopped"}


def load_env() -> None:
    env_path = db.BASE_DIR / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    if isinstance(value, str):
        return value.lower() in {"1", "true", "yes", "on"}
    return False


def clean_stock_input(payload: Dict[str, Any]) -> StockInput:
    code = str(payload.get("code", "")).strip()
    name = str(payload.get("name", "")).strip()
    if not code or not code.isdigit() or len(code) not in {4, 5}:
        raise ValueError("銘柄コードは4桁または5桁の数字で入力してください。")
    if not name:
        raise ValueError("銘柄名を入力してください。")
    watch_status = str(payload.get("watch_status", "normal")).strip()
    if watch_status not in VALID_WATCH_STATUSES:
        raise ValueError("監視状態が不正です。")
    holding_price = payload.get("holding_price")
    holding_shares = payload.get("holding_shares")
    target_amount = payload.get("target_amount")
    if target_amount in (None, ""):
        target_amount = 100000
    return StockInput(
        code=code,
        name=name,
        memo=str(payload.get("memo", "")).strip(),
        tags=str(payload.get("tags", "")).strip(),
        watch_status=watch_status,
        target_amount=max(int(target_amount), 0),
        is_holding=as_bool(payload.get("is_holding")),
        holding_price=float(holding_price) if holding_price not in (None, "") else None,
        holding_shares=int(holding_shares) if holding_shares not in (None, "") else None,
        allow_additional_buy=as_bool(payload.get("allow_additional_buy")),
    )


def list_stocks() -> List[Dict[str, Any]]:
    stocks = db.rows(
        """
        SELECT s.*, ti.latest_close, ti.price_change_pct, ti.volume_ratio, ti.liquidity_value,
               latest.signal_type, latest.score, latest.risk_level, latest.created_at AS signal_at
        FROM stocks s
        LEFT JOIN technical_indicators ti ON ti.stock_id = s.id
        LEFT JOIN (
            SELECT sig.*
            FROM signals sig
            JOIN (
                SELECT stock_id, MAX(id) AS max_id
                FROM signals
                GROUP BY stock_id
            ) newest ON newest.max_id = sig.id
        ) latest ON latest.stock_id = s.id
        ORDER BY COALESCE(latest.score, 0) DESC, s.code ASC
        """
    )
    for stock in stocks:
        stock["is_holding"] = bool(stock["is_holding"])
        stock["allow_additional_buy"] = bool(stock["allow_additional_buy"])
    return stocks


def get_stock(stock_id: int) -> Optional[Dict[str, Any]]:
    stock = db.row("SELECT * FROM stocks WHERE id = ?", [stock_id])
    if stock:
        stock["is_holding"] = bool(stock["is_holding"])
        stock["allow_additional_buy"] = bool(stock["allow_additional_buy"])
    return stock


def create_stock(payload: Dict[str, Any]) -> Dict[str, Any]:
    stock = clean_stock_input(payload)
    stock_id = db.execute(
        """
        INSERT INTO stocks (
            code, name, memo, tags, watch_status, target_amount, is_holding,
            holding_price, holding_shares, allow_additional_buy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            stock.code,
            stock.name,
            stock.memo,
            stock.tags,
            stock.watch_status,
            stock.target_amount,
            int(stock.is_holding),
            stock.holding_price,
            stock.holding_shares,
            int(stock.allow_additional_buy),
        ],
    )
    return get_stock(stock_id) or {}


def update_stock(stock_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
    if not get_stock(stock_id):
        raise ValueError("銘柄が見つかりません。")
    stock = clean_stock_input(payload)
    db.execute(
        """
        UPDATE stocks
        SET code = ?, name = ?, memo = ?, tags = ?, watch_status = ?, target_amount = ?,
            is_holding = ?, holding_price = ?, holding_shares = ?, allow_additional_buy = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        [
            stock.code,
            stock.name,
            stock.memo,
            stock.tags,
            stock.watch_status,
            stock.target_amount,
            int(stock.is_holding),
            stock.holding_price,
            stock.holding_shares,
            int(stock.allow_additional_buy),
            stock_id,
        ],
    )
    return get_stock(stock_id) or {}


def delete_stock(stock_id: int) -> None:
    db.execute("DELETE FROM stocks WHERE id = ?", [stock_id])


def import_stocks_csv(content: str) -> Dict[str, Any]:
    reader = csv.DictReader(StringIO(content))
    created = 0
    updated = 0
    errors = []
    for index, item in enumerate(reader, start=2):
        try:
            payload = {
                "code": item.get("code") or item.get("銘柄コード") or item.get("symbol"),
                "name": item.get("name") or item.get("銘柄名") or "",
                "memo": item.get("memo") or item.get("メモ") or "",
                "tags": item.get("tags") or item.get("タグ") or "",
                "watch_status": item.get("watch_status") or item.get("監視状態") or "normal",
            }
            existing = db.row("SELECT id FROM stocks WHERE code = ?", [str(payload["code"]).strip()])
            if existing:
                update_stock(existing["id"], {**get_stock(existing["id"]), **payload})
                updated += 1
            else:
                create_stock(payload)
                created += 1
        except Exception as exc:
            errors.append({"line": index, "message": str(exc)})
    return {"created": created, "updated": updated, "errors": errors}


class MarketDataProvider:
    name = "base"

    def fetch_daily_candles(self, stock: Dict[str, Any]) -> List[Dict[str, Any]]:
        raise NotImplementedError


class SampleMarketDataProvider(MarketDataProvider):
    name = "sample"

    def fetch_daily_candles(self, stock: Dict[str, Any]) -> List[Dict[str, Any]]:
        seed = int(hashlib.sha256(stock["code"].encode("utf-8")).hexdigest()[:12], 16)
        rng = random.Random(seed)
        base = 120 + (seed % 2400)
        trend = rng.uniform(-0.0015, 0.0035)
        price = float(base)
        candles = []
        current = date.today() - timedelta(days=140)
        while len(candles) < 100:
            if current.weekday() >= 5:
                current += timedelta(days=1)
                continue
            shock = rng.uniform(-0.035, 0.04)
            if len(candles) > 85:
                shock += trend
            open_price = max(price * (1 + rng.uniform(-0.012, 0.012)), 10)
            close = max(open_price * (1 + shock), 10)
            high = max(open_price, close) * (1 + rng.uniform(0.002, 0.025))
            low = min(open_price, close) * (1 - rng.uniform(0.002, 0.025))
            volume_base = 70000 + (seed % 1200000)
            volume = int(volume_base * rng.uniform(0.5, 1.8))
            if len(candles) in {96, 97, 98, 99} and seed % 3 == 0:
                volume = int(volume * rng.uniform(2.0, 3.5))
                close *= rng.uniform(1.005, 1.035)
                high = max(high, close * 1.01)
            candles.append(
                {
                    "ts": current.isoformat(),
                    "open": round(open_price, 2),
                    "high": round(high, 2),
                    "low": round(low, 2),
                    "close": round(close, 2),
                    "volume": max(volume, 1000),
                }
            )
            price = close
            current += timedelta(days=1)
        return candles


def upsert_candles(stock_id: int, candles: List[Dict[str, Any]], timeframe: str = "1d") -> None:
    params = [
        (stock_id, timeframe, candle["ts"], candle["open"], candle["high"], candle["low"], candle["close"], candle["volume"])
        for candle in candles
    ]
    db.execute_many(
        """
        INSERT INTO price_candles (stock_id, timeframe, ts, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(stock_id, timeframe, ts) DO UPDATE SET
            open = excluded.open,
            high = excluded.high,
            low = excluded.low,
            close = excluded.close,
            volume = excluded.volume
        """,
        params,
    )


def calculate_and_save_indicators(stock_id: int) -> Dict[str, Any]:
    candles = db.rows(
        """
        SELECT ts, open, high, low, close, volume
        FROM price_candles
        WHERE stock_id = ? AND timeframe = '1d'
        ORDER BY ts ASC
        """,
        [stock_id],
    )
    values = calculate(candles)
    db.execute(
        """
        INSERT INTO technical_indicators (
            stock_id, latest_close, previous_close, price_change_pct, ma5, ma25, ma75,
            rsi14, macd, macd_signal, bb_upper, bb_middle, bb_lower, vwap,
            volume_ratio, liquidity_value, raw_json, calculated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(stock_id) DO UPDATE SET
            latest_close = excluded.latest_close,
            previous_close = excluded.previous_close,
            price_change_pct = excluded.price_change_pct,
            ma5 = excluded.ma5,
            ma25 = excluded.ma25,
            ma75 = excluded.ma75,
            rsi14 = excluded.rsi14,
            macd = excluded.macd,
            macd_signal = excluded.macd_signal,
            bb_upper = excluded.bb_upper,
            bb_middle = excluded.bb_middle,
            bb_lower = excluded.bb_lower,
            vwap = excluded.vwap,
            volume_ratio = excluded.volume_ratio,
            liquidity_value = excluded.liquidity_value,
            raw_json = excluded.raw_json,
            calculated_at = CURRENT_TIMESTAMP
        """,
        [
            stock_id,
            values.get("latest_close"),
            values.get("previous_close"),
            values.get("price_change_pct"),
            values.get("ma5"),
            values.get("ma25"),
            values.get("ma75"),
            values.get("rsi14"),
            values.get("macd"),
            values.get("macd_signal"),
            values.get("bb_upper"),
            values.get("bb_middle"),
            values.get("bb_lower"),
            values.get("vwap"),
            values.get("volume_ratio"),
            values.get("liquidity_value"),
            db.dumps(values),
        ],
    )
    return values


def strength(score: int) -> str:
    if score >= 80:
        return "強"
    if score >= 60:
        return "中"
    return "弱"


def risk_level(cautions: List[str], rsi14: Optional[float], volume_ratio: Optional[float]) -> str:
    risk = len(cautions)
    if rsi14 is not None and rsi14 >= 78:
        risk += 1
    if volume_ratio is not None and volume_ratio >= 4:
        risk += 1
    if risk >= 3:
        return "高"
    if risk >= 1:
        return "中"
    return "低"


def generate_signal(stock: Dict[str, Any], indicators: Dict[str, Any]) -> SignalResult:
    if stock["watch_status"] == "stopped":
        return SignalResult(stock["id"], "監視停止", 0, "弱", "低", None, None, None, None, None, ["監視状態が停止です。"], [], "監視停止中のため判定しません。", {}, False)

    required = ["latest_close", "ma5", "ma25", "rsi14", "vwap", "volume_ratio"]
    if any(indicators.get(key) is None for key in required):
        return SignalResult(stock["id"], "データ不足", 0, "弱", "中", None, None, None, None, None, ["必要なローソク足データが不足しています。"], ["価格データを追加取得してください。"], "一定期間の価格データが必要です。", {}, False)

    close = float(indicators["latest_close"])
    previous = float(indicators.get("previous_close") or close)
    ma5 = float(indicators["ma5"])
    ma25 = float(indicators["ma25"])
    ma75 = indicators.get("ma75")
    rsi14 = float(indicators["rsi14"])
    vwap = float(indicators["vwap"])
    volume_ratio = float(indicators["volume_ratio"])
    liquidity_value = float(indicators.get("liquidity_value") or 0)
    recent_high = indicators.get("recent_high")
    recent_low = indicators.get("recent_low")
    macd_value = indicators.get("macd")
    macd_signal = indicators.get("macd_signal")

    technical = 0
    volume = 0
    demand = 0
    safety = 0
    reasons: List[str] = []
    cautions: List[str] = []

    if close > vwap:
        technical += 8
        reasons.append("株価がVWAPを上回っています。")
    if ma5 > ma25:
        technical += 8
        reasons.append("5日移動平均線が25日移動平均線を上回っています。")
    if ma75 is not None and ma25 > float(ma75):
        technical += 6
        reasons.append("中期の移動平均線も上向きです。")
    if close > previous:
        technical += 5
        reasons.append("前日比で上昇しています。")
    if recent_high is not None and close >= float(recent_high) * 0.995:
        technical += 8
        reasons.append("直近高値圏まで上昇しています。")
    if macd_value is not None and macd_signal is not None and float(macd_value) > float(macd_signal):
        technical += 5
        reasons.append("MACDがシグナルを上回っています。")

    if volume_ratio >= 2:
        volume += 15
        demand += 6
        reasons.append("出来高が直近平均の2倍以上です。")
    elif volume_ratio >= 1.3:
        volume += 8
        demand += 3
        reasons.append("出来高が増加傾向です。")

    if liquidity_value >= 50_000_000:
        volume += 10
        reasons.append("売買代金が一定以上あり、流動性があります。")
    elif liquidity_value < 10_000_000:
        safety -= 10
        cautions.append("売買代金が少なく、流動性リスクがあります。")

    if rsi14 >= 80:
        safety -= 16
        cautions.append("RSIが高く、短期過熱感があります。")
    elif rsi14 >= 70:
        safety -= 8
        cautions.append("RSIがやや高めです。")
    elif 45 <= rsi14 <= 65:
        technical += 5
        reasons.append("RSIは過熱しすぎていない範囲です。")

    buy_score = max(0, min(100, technical + volume + demand + safety))
    signal_type = "買い候補" if buy_score >= 65 else "見送り"
    score = buy_score

    holding_price = stock.get("holding_price")
    is_holding = bool(stock.get("is_holding"))
    if is_holding and holding_price:
        pnl_pct = ((close - float(holding_price)) / float(holding_price)) * 100
        sell_score = 0
        cut_score = 0
        if pnl_pct >= 5:
            sell_score += 35
        elif pnl_pct >= 2:
            sell_score += 20
        if rsi14 >= 75:
            sell_score += 20
        if close < vwap:
            sell_score += 15
        if close < ma5:
            sell_score += 15
        if volume_ratio < 0.8:
            sell_score += 10

        if pnl_pct <= -5:
            cut_score += 45
        elif pnl_pct <= -3:
            cut_score += 35
        elif pnl_pct <= -2:
            cut_score += 25
        if recent_low is not None and close <= float(recent_low) * 1.005:
            cut_score += 20
        if close < vwap:
            cut_score += 15
        if close < ma25:
            cut_score += 15
        if volume_ratio >= 1.8 and close < previous:
            cut_score += 15

        if cut_score >= 70 and cut_score >= sell_score:
            score = min(100, cut_score)
            signal_type = "損切り候補" if score >= 90 else "撤退検討" if score >= 80 else "下落リスク上昇"
            reasons = [f"保有単価からの損益率が{pnl_pct:.2f}%です。"] + reasons[:3]
        elif sell_score >= 65:
            score = min(100, sell_score)
            signal_type = "利確売り候補"
            reasons = [f"保有単価からの損益率が{pnl_pct:.2f}%です。"] + reasons[:3]
        elif not stock.get("allow_additional_buy") and signal_type == "買い候補":
            signal_type = "見送り"
            reasons.append("保有中銘柄のため、買い増し候補は抑制しています。")

    if signal_type == "買い候補" and rsi14 >= 75:
        signal_type = "過熱"

    risk = risk_level(cautions, rsi14, volume_ratio)
    entry_low = round(close * 0.995, 2) if signal_type in {"買い候補", "過熱"} else None
    entry_high = round(close * 1.01, 2) if signal_type in {"買い候補", "過熱"} else None
    take_profit_1 = round(close * 1.03, 2) if signal_type in {"買い候補", "利確売り候補", "過熱"} else None
    take_profit_2 = round(close * 1.06, 2) if signal_type in {"買い候補", "利確売り候補", "過熱"} else None
    stop_loss = round(close * 0.97, 2) if signal_type != "見送り" else None
    should_notify = signal_type in {"損切り候補", "撤退検討"} or (signal_type in {"買い候補", "利確売り候補"} and score >= 80)
    breakdown = {
        "technical": min(40, technical),
        "volume_liquidity": min(25, volume),
        "demand_proxy": min(15, demand),
        "news": 0,
        "safety_adjustment": safety,
        "raw": {
            "close": close,
            "rsi14": rsi14,
            "volume_ratio": volume_ratio,
            "liquidity_value": liquidity_value,
        },
    }
    beginner_note = "点数はテクニカル、出来高、流動性、過熱リスクをルールで合算した目安です。断定ではなく確認材料として使ってください。"
    return SignalResult(
        stock_id=stock["id"],
        signal_type=signal_type,
        score=int(max(0, min(100, score))),
        strength=strength(int(score)),
        risk_level=risk,
        entry_price_low=entry_low,
        entry_price_high=entry_high,
        take_profit_1=take_profit_1,
        take_profit_2=take_profit_2,
        stop_loss=stop_loss,
        reasons=reasons or ["明確な優位性は限定的です。"],
        cautions=cautions,
        beginner_note=beginner_note,
        breakdown=breakdown,
        should_notify=should_notify,
    )


def save_signal(result: SignalResult) -> int:
    signal_id = db.execute(
        """
        INSERT INTO signals (
            stock_id, signal_type, score, strength, risk_level, entry_price_low, entry_price_high,
            take_profit_1, take_profit_2, stop_loss, reasons_json, cautions_json,
            beginner_note, breakdown_json, should_notify
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            result.stock_id,
            result.signal_type,
            result.score,
            result.strength,
            result.risk_level,
            result.entry_price_low,
            result.entry_price_high,
            result.take_profit_1,
            result.take_profit_2,
            result.stop_loss,
            db.dumps(result.reasons),
            db.dumps(result.cautions),
            result.beginner_note,
            db.dumps(result.breakdown),
            int(result.should_notify),
        ],
    )
    db.execute("UPDATE stocks SET last_signal = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [result.signal_type, result.stock_id])
    return signal_id


def run_analysis(stock_id: Optional[int] = None, notify: bool = False) -> Dict[str, Any]:
    provider = SampleMarketDataProvider()
    stocks = db.rows("SELECT * FROM stocks WHERE (? IS NULL OR id = ?) ORDER BY code", [stock_id, stock_id])
    processed = []
    for stock in stocks:
        try:
            if stock["watch_status"] != "stopped":
                candles = provider.fetch_daily_candles(stock)
                upsert_candles(stock["id"], candles)
                db.execute(
                    "UPDATE stocks SET last_data_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [datetime.now().isoformat(timespec="seconds"), stock["id"]],
                )
                db.execute(
                    "INSERT INTO data_fetch_logs (stock_id, provider, status, message) VALUES (?, ?, ?, ?)",
                    [stock["id"], provider.name, "success", f"{len(candles)}件のサンプル日足を保存しました。"],
                )
                indicators = calculate_and_save_indicators(stock["id"])
            else:
                indicators = {}
            result = generate_signal(stock, indicators)
            signal_id = save_signal(result)
            sent = None
            if notify and result.should_notify:
                sent = send_line_notification(signal_id)
            processed.append({"stock_id": stock["id"], "code": stock["code"], "signal": result.signal_type, "score": result.score, "notification": sent})
        except Exception as exc:
            db.execute(
                "INSERT INTO data_fetch_logs (stock_id, provider, status, message) VALUES (?, ?, ?, ?)",
                [stock["id"], provider.name, "error", str(exc)],
            )
            processed.append({"stock_id": stock["id"], "code": stock["code"], "error": str(exc)})
    return {"processed": processed, "count": len(processed)}


def list_signals(limit: int = 100) -> List[Dict[str, Any]]:
    signals = db.rows(
        """
        SELECT sig.*, s.code, s.name
        FROM signals sig
        JOIN stocks s ON s.id = sig.stock_id
        ORDER BY sig.id DESC
        LIMIT ?
        """,
        [limit],
    )
    for signal in signals:
        signal["reasons"] = db.loads(signal.pop("reasons_json"), [])
        signal["cautions"] = db.loads(signal.pop("cautions_json"), [])
        signal["breakdown"] = db.loads(signal.pop("breakdown_json"), {})
        signal["should_notify"] = bool(signal["should_notify"])
    return signals


def get_stock_detail(stock_id: int) -> Dict[str, Any]:
    stock = get_stock(stock_id)
    if not stock:
        raise ValueError("銘柄が見つかりません。")
    candles = db.rows(
        """
        SELECT ts, open, high, low, close, volume
        FROM price_candles
        WHERE stock_id = ? AND timeframe = '1d'
        ORDER BY ts ASC
        """,
        [stock_id],
    )
    indicators = db.row("SELECT * FROM technical_indicators WHERE stock_id = ?", [stock_id])
    signals = db.rows("SELECT * FROM signals WHERE stock_id = ? ORDER BY id DESC LIMIT 20", [stock_id])
    for signal in signals:
        signal["reasons"] = db.loads(signal.pop("reasons_json"), [])
        signal["cautions"] = db.loads(signal.pop("cautions_json"), [])
        signal["breakdown"] = db.loads(signal.pop("breakdown_json"), {})
        signal["should_notify"] = bool(signal["should_notify"])
    return {"stock": stock, "candles": candles, "indicators": indicators, "signals": signals}


def notification_message(signal: Dict[str, Any]) -> str:
    reasons = db.loads(signal.get("reasons_json", ""), [])
    lines = [
        f"【{signal['signal_type']}】{signal['code']} {signal['name']}",
        f"スコア：{signal['score']}点 / {signal['strength']}",
        f"リスク：{signal['risk_level']}",
        "",
    ]
    if signal.get("entry_price_low") and signal.get("entry_price_high"):
        lines.append(f"エントリー目安：{signal['entry_price_low']}〜{signal['entry_price_high']}円")
    if signal.get("take_profit_1"):
        lines.append(f"第1利確：{signal['take_profit_1']}円")
    if signal.get("stop_loss"):
        lines.append(f"損切り目安：{signal['stop_loss']}円割れ")
    lines += ["", "根拠：", *(reasons[:3] or ["重要シグナルが発生しました。"])]
    return "\n".join(lines)


def already_notified(signal: Dict[str, Any]) -> bool:
    existing = db.row(
        """
        SELECT nh.id
        FROM notification_history nh
        JOIN signals sig ON sig.id = nh.signal_id
        WHERE nh.stock_id = ? AND sig.signal_type = ? AND sig.score = ? AND nh.status IN ('sent', 'skipped')
          AND nh.created_at >= datetime('now', '-6 hours')
        LIMIT 1
        """,
        [signal["stock_id"], signal["signal_type"], signal["score"]],
    )
    return existing is not None


def send_line_notification(signal_id: int) -> Dict[str, Any]:
    load_env()
    signal = db.row(
        """
        SELECT sig.*, s.code, s.name
        FROM signals sig
        JOIN stocks s ON s.id = sig.stock_id
        WHERE sig.id = ?
        """,
        [signal_id],
    )
    if not signal:
        raise ValueError("シグナルが見つかりません。")
    message = notification_message(signal)
    if already_notified(signal):
        db.execute(
            "INSERT INTO notification_history (signal_id, stock_id, status, message, error) VALUES (?, ?, ?, ?, ?)",
            [signal_id, signal["stock_id"], "skipped", message, "同一シグナルを直近6時間以内に通知済みです。"],
        )
        return {"status": "skipped", "message": "duplicate"}

    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
    to_user_id = os.environ.get("LINE_TO_USER_ID")
    if not token or not to_user_id:
        db.execute(
            "INSERT INTO notification_history (signal_id, stock_id, status, message, error) VALUES (?, ?, ?, ?, ?)",
            [signal_id, signal["stock_id"], "skipped", message, "LINE環境変数が未設定です。"],
        )
        return {"status": "skipped", "message": "line_env_missing"}

    payload = db.dumps({"to": to_user_id, "messages": [{"type": "text", "text": message}]}).encode("utf-8")
    request = urllib.request.Request(
        "https://api.line.me/v2/bot/message/push",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            status = "sent" if response.status < 300 else "error"
            db.execute(
                "INSERT INTO notification_history (signal_id, stock_id, status, message, error) VALUES (?, ?, ?, ?, ?)",
                [signal_id, signal["stock_id"], status, message, None],
            )
            return {"status": status, "http_status": response.status}
    except urllib.error.URLError as exc:
        db.execute(
            "INSERT INTO notification_history (signal_id, stock_id, status, message, error) VALUES (?, ?, ?, ?, ?)",
            [signal_id, signal["stock_id"], "error", message, str(exc)],
        )
        return {"status": "error", "message": str(exc)}


def list_notifications(limit: int = 100) -> List[Dict[str, Any]]:
    return db.rows(
        """
        SELECT nh.*, s.code, s.name
        FROM notification_history nh
        JOIN stocks s ON s.id = nh.stock_id
        ORDER BY nh.id DESC
        LIMIT ?
        """,
        [limit],
    )


def dashboard() -> Dict[str, Any]:
    counts = db.rows(
        """
        SELECT signal_type, COUNT(*) AS count
        FROM signals
        WHERE date(created_at) = date('now')
        GROUP BY signal_type
        """
    )
    high_scores = db.rows(
        """
        SELECT sig.*, s.code, s.name
        FROM signals sig
        JOIN stocks s ON s.id = sig.stock_id
        WHERE sig.id IN (SELECT MAX(id) FROM signals GROUP BY stock_id)
        ORDER BY sig.score DESC
        LIMIT 10
        """
    )
    errors = db.rows(
        """
        SELECT *
        FROM data_fetch_logs
        WHERE status = 'error'
        ORDER BY id DESC
        LIMIT 10
        """
    )
    holdings = db.rows(
        """
        SELECT s.*, ti.latest_close, sig.signal_type, sig.score, sig.risk_level
        FROM stocks s
        LEFT JOIN technical_indicators ti ON ti.stock_id = s.id
        LEFT JOIN signals sig ON sig.id = (SELECT MAX(id) FROM signals WHERE stock_id = s.id)
        WHERE s.is_holding = 1
        ORDER BY sig.score DESC
        """
    )
    return {"counts": counts, "high_scores": high_scores, "holdings": holdings, "errors": errors}
