from typing import Dict, List, Optional


def sma(values: List[float], period: int) -> Optional[float]:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def ema(values: List[float], period: int) -> Optional[float]:
    if len(values) < period:
        return None
    multiplier = 2 / (period + 1)
    current = sum(values[:period]) / period
    for value in values[period:]:
        current = (value - current) * multiplier + current
    return current


def rsi(values: List[float], period: int = 14) -> Optional[float]:
    if len(values) <= period:
        return None
    gains = []
    losses = []
    for previous, current in zip(values[-period - 1 : -1], values[-period:]):
        diff = current - previous
        gains.append(max(diff, 0))
        losses.append(abs(min(diff, 0)))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def macd(values: List[float]) -> Dict[str, Optional[float]]:
    if len(values) < 35:
        return {"macd": None, "signal": None}
    macd_series = []
    for end in range(26, len(values) + 1):
        subset = values[:end]
        ema12 = ema(subset, 12)
        ema26 = ema(subset, 26)
        if ema12 is not None and ema26 is not None:
            macd_series.append(ema12 - ema26)
    signal = ema(macd_series, 9) if len(macd_series) >= 9 else None
    return {"macd": macd_series[-1] if macd_series else None, "signal": signal}


def bollinger(values: List[float], period: int = 20) -> Dict[str, Optional[float]]:
    middle = sma(values, period)
    if middle is None:
        return {"upper": None, "middle": None, "lower": None}
    recent = values[-period:]
    variance = sum((value - middle) ** 2 for value in recent) / period
    sd = variance ** 0.5
    return {"upper": middle + 2 * sd, "middle": middle, "lower": middle - 2 * sd}


def vwap(candles: List[dict]) -> Optional[float]:
    total_price_volume = 0.0
    total_volume = 0
    for candle in candles:
        typical = (candle["high"] + candle["low"] + candle["close"]) / 3
        total_price_volume += typical * candle["volume"]
        total_volume += candle["volume"]
    if total_volume == 0:
        return None
    return total_price_volume / total_volume


def calculate(candles: List[dict]) -> Dict[str, Optional[float]]:
    closes = [float(candle["close"]) for candle in candles]
    volumes = [int(candle["volume"]) for candle in candles]
    latest_close = closes[-1] if closes else None
    previous_close = closes[-2] if len(closes) >= 2 else None
    volume_avg_20 = sum(volumes[-21:-1]) / 20 if len(volumes) >= 21 else None
    latest_volume = volumes[-1] if volumes else None
    bb = bollinger(closes)
    macd_values = macd(closes)
    price_change_pct = None
    if latest_close is not None and previous_close:
        price_change_pct = ((latest_close - previous_close) / previous_close) * 100
    volume_ratio = None
    if latest_volume is not None and volume_avg_20:
        volume_ratio = latest_volume / volume_avg_20
    liquidity_value = None
    if latest_close is not None and latest_volume is not None:
        liquidity_value = latest_close * latest_volume
    return {
        "latest_close": latest_close,
        "previous_close": previous_close,
        "price_change_pct": price_change_pct,
        "ma5": sma(closes, 5),
        "ma25": sma(closes, 25),
        "ma75": sma(closes, 75),
        "rsi14": rsi(closes),
        "macd": macd_values["macd"],
        "macd_signal": macd_values["signal"],
        "bb_upper": bb["upper"],
        "bb_middle": bb["middle"],
        "bb_lower": bb["lower"],
        "vwap": vwap(candles[-20:]) if candles else None,
        "volume_ratio": volume_ratio,
        "liquidity_value": liquidity_value,
        "recent_high": max(closes[-20:]) if len(closes) >= 20 else None,
        "recent_low": min(closes[-20:]) if len(closes) >= 20 else None,
    }
