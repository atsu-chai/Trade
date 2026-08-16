import { spawn } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const CODEX_BIN = process.env.CODEX_BIN || "codex";
const CODEX_MODEL = process.env.CODEX_MODEL || null;
const POLL_INTERVAL_MS = Number(process.env.LOOP_POLL_INTERVAL_MS ?? "30000");
const TURN_TIMEOUT_MS = Number(process.env.LOOP_TURN_TIMEOUT_MS ?? "900000");
const RUN_ONCE = process.argv.includes("--once");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "marketContext", "candidates"],
  properties: {
    summary: { type: "string" },
    marketContext: { type: "string" },
    candidates: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "code", "name", "currentPrice", "estimatedOrderPrice", "score", "verdict",
          "horizonDays", "thesis", "risks", "sources", "metrics",
        ],
        properties: {
          code: { type: "string", pattern: "^[0-9]{4,5}$" },
          name: { type: "string" },
          currentPrice: { type: "number", exclusiveMinimum: 0 },
          estimatedOrderPrice: { type: "number", exclusiveMinimum: 0 },
          score: { type: "integer", minimum: 0, maximum: 100 },
          verdict: { type: "string", enum: ["候補", "監視", "見送り"] },
          horizonDays: { type: "integer", minimum: 1, maximum: 365 },
          thesis: { type: "string" },
          risks: { type: "array", items: { type: "string" }, maxItems: 6 },
          sources: {
            type: "array",
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "url", "publishedAt", "claim"],
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                publishedAt: { type: ["string", "null"] },
                claim: { type: "string" },
              },
            },
          },
          metrics: {
            type: "object",
            additionalProperties: false,
            required: ["priceTrend", "liquidity", "catalyst", "downside", "sourceQuality"],
            properties: {
              priceTrend: { type: "number", minimum: 0, maximum: 100 },
              liquidity: { type: "number", minimum: 0, maximum: 100 },
              catalyst: { type: "number", minimum: 0, maximum: 100 },
              downside: { type: "number", minimum: 0, maximum: 100 },
              sourceQuality: { type: "number", minimum: 0, maximum: 100 },
            },
          },
        },
      },
    },
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rest(pathname, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

class CodexAppServer {
  constructor() {
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
  }

  async start() {
    this.child = spawn(CODEX_BIN, ["app-server", "--stdio"], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "inherit"],
      env: process.env,
    });
    this.child.on("exit", (code) => {
      const error = new Error(`codex app-server exited with code ${code}`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
    this.child.on("error", (error) => {
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
    const lines = readline.createInterface({ input: this.child.stdout });
    lines.on("line", (line) => this.handleMessage(line));

    await this.request("initialize", {
      clientInfo: { name: "trade-analysis-loop", version: "0.1.0" },
      capabilities: { experimentalApi: false },
    });
    this.notify("initialized", {});
  }

  handleMessage(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      this.replyToServerRequest(message);
      return;
    }
    for (const listener of this.listeners) listener(message);
  }

  replyToServerRequest(message) {
    const deny = message.method.includes("Approval")
      ? { decision: "deny" }
      : message.method.includes("requestUserInput")
        ? { answers: {} }
        : {};
    this.write({ id: message.id, result: deny });
  }

  write(message) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params) {
    const id = this.nextId++;
    this.write({ id, method, params });
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  notify(method, params) {
    this.write({ method, params });
  }

  waitFor(method, predicate, timeoutMs = TURN_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const listener = (message) => {
        if (message.method !== method || !predicate(message.params)) return;
        clearTimeout(timeout);
        this.listeners.delete(listener);
        resolve(message.params);
      };
      this.listeners.add(listener);
    });
  }

  async createThread() {
    const params = {
      cwd: ROOT,
      sandbox: "read-only",
      approvalPolicy: "never",
      ephemeral: false,
      baseInstructions: [
        "You are a Japanese equities research analyst for a small retail investor.",
        "Use web search for current facts and cite direct source URLs.",
        "Never place orders, modify files, or claim guaranteed returns.",
        "Prefer primary sources for company disclosures and official broker rules.",
        "Return only data matching the requested output schema.",
      ].join("\n"),
    };
    if (CODEX_MODEL) params.model = CODEX_MODEL;
    const result = await this.request("thread/start", params);
    return result.thread.id;
  }

  async runTurn(threadId, prompt) {
    const completion = this.waitFor("turn/completed", (params) => params.threadId === threadId);
    await this.request("turn/start", {
      threadId,
      input: [{ type: "text", text: prompt }],
      outputSchema: OUTPUT_SCHEMA,
      effort: "high",
    });
    const completed = await completion;
    if (completed.turn.status !== "completed") {
      throw new Error(completed.turn.error?.message ?? `Turn ${completed.turn.status}`);
    }
    const messages = completed.turn.items.filter((item) => item.type === "agentMessage");
    const finalMessage = [...messages].reverse().find((item) => item.phase === "final_answer") ?? messages.at(-1);
    if (!finalMessage?.text) throw new Error("Codex returned no final analysis.");
    return JSON.parse(finalMessage.text);
  }

  stop() {
    this.child?.kill("SIGTERM");
  }
}

function buildPrompt(profile, iteration, previous) {
  const previousText = previous.length
    ? JSON.stringify(previous.map((candidate) => ({
        code: candidate.code,
        name: candidate.name,
        score: candidate.score,
        verdict: candidate.verdict,
        thesis: candidate.thesis,
      })))
    : "[]";
  return `
Iteration ${iteration}. Research Japanese listed stocks suitable for SBI Securities S shares.

Investor constraints:
- Total budget: ${profile.budget_yen} JPY.
- Keep ${(Number(profile.reserve_rate) * 100).toFixed(0)}% cash buffer for price movement before execution.
- One share minimum; at most ${profile.max_positions} concurrent positions.
- Holding horizon: ${profile.min_horizon_days}-${profile.max_horizon_days} trading days.
- SBI S-share orders are not immediate limit orders. Treat execution-price slippage as a material risk.
- No leverage, no short selling, no automatic order placement.

Research loop:
1. Search current market and company information on the web.
2. Prefer official timely disclosures, company IR, exchange releases, and established financial sources.
3. Confirm current price and liquidity from recent sources.
4. Identify catalysts, then actively search for contradictory evidence and downside risks.
5. Compare against the previous iteration and keep only candidates that survive the challenge.
6. A candidate must be affordable after the cash buffer. Expensive stocks should be marked 見送り.

Previous iteration candidates:
${previousText}

Return no more than five candidates. Scores must reflect evidence quality and affordability, not just price momentum.
`;
}

function normalizeCandidate(candidate, profile) {
  const currentPrice = Number(candidate.currentPrice);
  const reserveMultiplier = 1 + Number(profile.reserve_rate);
  const estimatedOrderPrice = Math.max(Number(candidate.estimatedOrderPrice), currentPrice * reserveMultiplier);
  const affordableShares = Math.max(0, Math.floor(Number(profile.budget_yen) / estimatedOrderPrice));
  const proposedAmount = affordableShares * estimatedOrderPrice;
  const sources = (candidate.sources ?? []).filter((source) => /^https?:\/\//.test(source.url));
  let score = Math.max(0, Math.min(100, Math.round(Number(candidate.score))));
  let verdict = candidate.verdict;
  const risks = [...(candidate.risks ?? [])];

  if (affordableShares < 1) {
    verdict = "見送り";
    score = Math.min(score, 39);
    risks.unshift("価格余裕を含めると1万円で1株購入できません。");
  }
  if (sources.length < 2) {
    verdict = verdict === "候補" ? "監視" : verdict;
    score = Math.min(score, 69);
    risks.unshift("独立した根拠URLが2件未満です。");
  }
  const rawCode = String(candidate.code).replace(/\D/g, "");
  const code = rawCode.length === 5 && rawCode.endsWith("0") ? rawCode.slice(0, 4) : rawCode.slice(0, 4);
  if (!/^\d{4}$/.test(code)) throw new Error(`Invalid stock code: ${candidate.code}`);
  return {
    code,
    name: candidate.name,
    current_price: currentPrice,
    estimated_order_price: Math.round(estimatedOrderPrice * 100) / 100,
    affordable_shares: affordableShares,
    proposed_amount: Math.round(proposedAmount * 100) / 100,
    score,
    verdict,
    horizon_days: Math.max(profile.min_horizon_days, Math.min(profile.max_horizon_days, candidate.horizonDays)),
    thesis: candidate.thesis,
    risks_json: risks.slice(0, 6),
    sources_json: sources.slice(0, 8),
    metrics_json: candidate.metrics,
  };
}

async function claimRun() {
  const runs = await rest("analysis_loop_runs?status=eq.queued&select=*&order=created_at.asc&limit=1");
  const run = runs?.[0];
  if (!run) return null;
  const updated = await rest(`analysis_loop_runs?id=eq.${run.id}&status=eq.queued`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "running", started_at: new Date().toISOString(), error: null }),
  });
  return updated?.[0] ?? null;
}

async function loadProfile(userId) {
  const rows = await rest(`investment_profiles?user_id=eq.${userId}&select=*`);
  if (rows?.[0]) return rows[0];
  const created = await rest("investment_profiles", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId }),
  });
  return created[0];
}

async function processRun(run) {
  const profile = await loadProfile(run.user_id);
  const appServer = new CodexAppServer();
  try {
    await appServer.start();
    const threadId = await appServer.createThread();
    await rest(`analysis_loop_runs?id=eq.${run.id}`, {
      method: "PATCH",
      body: JSON.stringify({ codex_thread_id: threadId }),
    });

    let previous = [];
    let finalSummary = "";
    for (let iteration = 1; iteration <= run.iteration_limit; iteration += 1) {
      const result = await appServer.runTurn(threadId, buildPrompt(profile, iteration, previous));
      const normalized = result.candidates.map((candidate) => normalizeCandidate(candidate, profile));
      if (normalized.length) {
        await rest("analysis_loop_candidates?on_conflict=run_id,iteration,code", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify(normalized.map((candidate) => ({ ...candidate, run_id: run.id, iteration }))),
        });
      }
      previous = normalized.sort((a, b) => b.score - a.score).slice(0, 5);
      finalSummary = `${result.marketContext}\n\n${result.summary}`;
      await rest(`analysis_loop_runs?id=eq.${run.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          completed_iterations: iteration,
          best_score: previous[0]?.score ?? null,
          summary: finalSummary,
        }),
      });
    }

    await rest(`analysis_loop_runs?id=eq.${run.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "completed",
        completed_at: new Date().toISOString(),
        best_score: previous[0]?.score ?? null,
        summary: finalSummary,
      }),
    });
  } catch (error) {
    await rest(`analysis_loop_runs?id=eq.${run.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      }),
    });
    throw error;
  } finally {
    appServer.stop();
  }
}

async function main() {
  while (true) {
    const run = await claimRun();
    if (run) {
      try {
        console.log(`Processing analysis loop ${run.id}`);
        await processRun(run);
        console.log(`Completed analysis loop ${run.id}`);
      } catch (error) {
        console.error(`Analysis loop ${run.id} failed`, error);
      }
    }
    if (RUN_ONCE) return;
    await sleep(POLL_INTERVAL_MS);
  }
}

await main();
