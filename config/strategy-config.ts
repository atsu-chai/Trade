export type DailyStrategyConfig = {
  maShort: number;
  maBase: number;
  breakoutLookback: number;
  breakoutBuffer: number;
  volumeLookback: number;
  volumeThreshold: number;
  takeProfitPct: number;
  stopLossPct: number;
  maxHoldBars: number;
};

export type StrategyConfig = {
  version: number;
  updatedAt: string;
  source: string;
  dailyBacktest: DailyStrategyConfig;
};

export const STRATEGY_CONFIG: StrategyConfig = {
  version: 1,
  updatedAt: "2026-07-05T09:24:21.893Z",
  source: "research-2015-yahoo",
  dailyBacktest: {
    maShort: 4,
    maBase: 30,
    breakoutLookback: 30,
    breakoutBuffer: 0.995,
    volumeLookback: 20,
    volumeThreshold: 1.1,
    takeProfitPct: 0.04,
    stopLossPct: 0.03,
    maxHoldBars: 15,
  },
};
