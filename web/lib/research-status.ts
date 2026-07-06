import fs from "node:fs/promises";
import path from "node:path";

export type ResearchSummary = {
  generatedAt: string;
  source: string;
  universeSize: number;
  baseline: {
    validation: {
      score: number;
      expectancyPct: number;
      winRate?: number;
      terminalEquity: number;
      tradeCount: number;
    };
  };
  best: {
    config: {
      maShort: number;
      maBase: number;
      breakoutLookback: number;
      volumeThreshold: number;
      takeProfitPct: number;
      stopLossPct: number;
      maxHoldBars: number;
    };
    validation: {
      score: number;
      expectancyPct: number;
      winRate?: number;
      terminalEquity: number;
      tradeCount: number;
    };
    adopted: boolean;
  };
};

const REPORT_PATH = path.join(process.cwd(), "..", "data", "research", "latest-report.json");

export async function readResearchStatus(): Promise<ResearchSummary | null> {
  try {
    const content = await fs.readFile(REPORT_PATH, "utf8");
    return JSON.parse(content) as ResearchSummary;
  } catch {
    return null;
  }
}

export function improvementText(report: ResearchSummary) {
  const before = report.baseline.validation.terminalEquity;
  const after = report.best.validation.terminalEquity;
  const diffPct = ((after - before) / Math.max(before, 0.0001)) * 100;
  return {
    before,
    after,
    diffPct,
  };
}
