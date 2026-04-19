from dataclasses import dataclass
from typing import Any, Dict, List, Optional


SignalKind = str


@dataclass
class StockInput:
    code: str
    name: str
    memo: str = ""
    tags: str = ""
    watch_status: str = "normal"
    target_amount: int = 100000
    is_holding: bool = False
    holding_price: Optional[float] = None
    holding_shares: Optional[int] = None
    allow_additional_buy: bool = False


@dataclass
class SignalResult:
    stock_id: int
    signal_type: SignalKind
    score: int
    strength: str
    risk_level: str
    entry_price_low: Optional[float]
    entry_price_high: Optional[float]
    take_profit_1: Optional[float]
    take_profit_2: Optional[float]
    stop_loss: Optional[float]
    reasons: List[str]
    cautions: List[str]
    beginner_note: str
    breakdown: Dict[str, Any]
    should_notify: bool
