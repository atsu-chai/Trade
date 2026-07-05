import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "data/research/latest-report.json");
const HISTORY_DIR = path.join(ROOT, "data/research");
const HISTORY_PATH = path.join(HISTORY_DIR, "history.jsonl");
const CYCLES = Number(process.env.RESEARCH_CYCLES ?? "1000");
const TOTAL_TARGET = Number(process.env.RESEARCH_TOTAL_TARGET ?? "0");
const START_SEED = Number(process.env.RESEARCH_START_SEED ?? String(Date.now() % 1000000));
const UNIVERSE_SIZE = Number(process.env.RESEARCH_UNIVERSE_SIZE ?? "40");
const CANDIDATE_COUNT = Number(process.env.RESEARCH_CANDIDATES ?? "120");

function runOneCycle(seed) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["research/optimize-strategy.mjs"],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          RESEARCH_SEED: String(seed),
          RESEARCH_UNIVERSE_SIZE: String(UNIVERSE_SIZE),
          RESEARCH_CANDIDATES: String(CANDIDATE_COUNT),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("exit", async (code) => {
      if (code !== 0) {
        reject(new Error(`Cycle failed with code ${code}\n${stderr || stdout}`));
        return;
      }
      try {
        const report = JSON.parse(await fs.readFile(REPORT_PATH, "utf8"));
        resolve({ report, stdout });
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function appendHistory(entry) {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  await fs.appendFile(HISTORY_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

async function countCompletedCycles() {
  try {
    const content = await fs.readFile(HISTORY_PATH, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function main() {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  const completedCycles = await countCompletedCycles();
  const remainingToTarget = TOTAL_TARGET > 0 ? Math.max(0, TOTAL_TARGET - completedCycles) : CYCLES;
  const cyclesThisRun = Math.min(CYCLES, remainingToTarget);

  if (TOTAL_TARGET > 0 && cyclesThisRun === 0) {
    console.log(`Target already reached. completed=${completedCycles} target=${TOTAL_TARGET}`);
    return;
  }

  console.log(
    `Starting research cycles: run=${cyclesThisRun}, completed=${completedCycles}, target=${TOTAL_TARGET || "none"}, universe=${UNIVERSE_SIZE}, candidates=${CANDIDATE_COUNT}, startSeed=${START_SEED}`,
  );

  for (let cycle = 0; cycle < cyclesThisRun; cycle += 1) {
    const seed = START_SEED + cycle;
    const startedAt = new Date().toISOString();
    console.log(`Cycle ${cycle + 1}/${cyclesThisRun} seed=${seed} ...`);
    const { report } = await runOneCycle(seed);
    const finishedAt = new Date().toISOString();
    const entry = {
      cycle: completedCycles + cycle + 1,
      seed,
      startedAt,
      finishedAt,
      adopted: report.best?.adopted ?? false,
      baselineValidation: report.baseline?.validation ?? null,
      bestValidation: report.best?.validation ?? null,
      bestConfig: report.best?.config ?? null,
      universeSize: report.universeSize ?? null,
    };
    await appendHistory(entry);
    console.log(
      `Cycle ${cycle + 1}/${cyclesThisRun} done. globalCycle=${entry.cycle} adopted=${entry.adopted} validationEquity=${entry.bestValidation?.terminalEquity ?? "-"} expectancy=${entry.bestValidation?.expectancyPct ?? "-"}`,
    );
  }
}

await main();
