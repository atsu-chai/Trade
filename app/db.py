import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "trade_bot.sqlite3"


def dict_factory(cursor: sqlite3.Cursor, row: sqlite3.Row) -> Dict[str, Any]:
    return {column[0]: row[index] for index, column in enumerate(cursor.description)}


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = dict_factory
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS stocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                memo TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '',
                watch_status TEXT NOT NULL DEFAULT 'normal',
                target_amount INTEGER NOT NULL DEFAULT 100000,
                is_holding INTEGER NOT NULL DEFAULT 0,
                holding_price REAL,
                holding_shares INTEGER,
                allow_additional_buy INTEGER NOT NULL DEFAULT 0,
                last_data_at TEXT,
                last_signal TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS price_candles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_id INTEGER NOT NULL,
                timeframe TEXT NOT NULL,
                ts TEXT NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(stock_id, timeframe, ts),
                FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS technical_indicators (
                stock_id INTEGER PRIMARY KEY,
                calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                latest_close REAL,
                previous_close REAL,
                price_change_pct REAL,
                ma5 REAL,
                ma25 REAL,
                ma75 REAL,
                rsi14 REAL,
                macd REAL,
                macd_signal REAL,
                bb_upper REAL,
                bb_middle REAL,
                bb_lower REAL,
                vwap REAL,
                volume_ratio REAL,
                liquidity_value REAL,
                raw_json TEXT NOT NULL,
                FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_id INTEGER NOT NULL,
                signal_type TEXT NOT NULL,
                score INTEGER NOT NULL,
                strength TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                entry_price_low REAL,
                entry_price_high REAL,
                take_profit_1 REAL,
                take_profit_2 REAL,
                stop_loss REAL,
                reasons_json TEXT NOT NULL,
                cautions_json TEXT NOT NULL,
                beginner_note TEXT NOT NULL,
                breakdown_json TEXT NOT NULL,
                should_notify INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS notification_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                signal_id INTEGER,
                stock_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                message TEXT NOT NULL,
                error TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(signal_id) REFERENCES signals(id) ON DELETE SET NULL,
                FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS data_fetch_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_id INTEGER,
                provider TEXT NOT NULL,
                status TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )


def rows(query: str, params: Iterable[Any] = ()) -> List[Dict[str, Any]]:
    with connect() as conn:
        return conn.execute(query, tuple(params)).fetchall()


def row(query: str, params: Iterable[Any] = ()) -> Optional[Dict[str, Any]]:
    with connect() as conn:
        return conn.execute(query, tuple(params)).fetchone()


def execute(query: str, params: Iterable[Any] = ()) -> int:
    with connect() as conn:
        cursor = conn.execute(query, tuple(params))
        return int(cursor.lastrowid)


def execute_many(query: str, params: Iterable[Iterable[Any]]) -> None:
    with connect() as conn:
        conn.executemany(query, params)


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def loads(value: str, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback
