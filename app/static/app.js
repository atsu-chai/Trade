const state = {
  stocks: [],
  dashboard: null,
};

const $ = (selector) => document.querySelector(selector);
const fmt = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("ja-JP", { maximumFractionDigits: digits });
};

function toast(message) {
  const target = $("#toast");
  target.textContent = message;
  target.classList.add("show");
  window.setTimeout(() => target.classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "API error");
  return payload;
}

function signalClass(signal) {
  if (!signal) return "neutral";
  if (signal.includes("損切り") || signal.includes("撤退") || signal.includes("下落")) return "bad";
  if (signal.includes("利確") || signal.includes("過熱") || signal.includes("注意")) return "warn";
  if (signal.includes("買い")) return "buy";
  return "neutral";
}

function renderSummary() {
  const counts = Object.fromEntries((state.dashboard?.counts || []).map((item) => [item.signal_type, item.count]));
  const cards = [
    ["買い候補", counts["買い候補"] || 0],
    ["利確候補", counts["利確売り候補"] || 0],
    ["損切り/撤退", (counts["損切り候補"] || 0) + (counts["撤退検討"] || 0) + (counts["下落リスク上昇"] || 0)],
    ["監視銘柄", state.stocks.length],
  ];
  $("#summary").innerHTML = cards
    .map(([label, value]) => `<div class="summary-card"><span class="muted">${label}</span><b>${value}</b></div>`)
    .join("");
}

function renderStocks() {
  $("#stocksBody").innerHTML = state.stocks
    .map((stock) => {
      const signal = stock.signal_type || stock.last_signal || "-";
      return `
        <tr>
          <td>${stock.code}</td>
          <td><strong>${stock.name}</strong><div class="muted">${stock.tags || ""}</div></td>
          <td>${fmt(stock.latest_close)}</td>
          <td>${fmt(stock.price_change_pct)}%</td>
          <td>${fmt(stock.volume_ratio)}倍</td>
          <td><span class="badge ${signalClass(signal)}">${signal}</span></td>
          <td>${stock.score ?? "-"}</td>
          <td>${stock.risk_level || "-"}</td>
          <td>${watchStatusLabel(stock.watch_status)}</td>
          <td>
            <button class="secondary" onclick="showDetail(${stock.id})">詳細</button>
            <button class="secondary" onclick="editStock(${stock.id})">編集</button>
            <button class="secondary" onclick="analyzeStock(${stock.id})">分析</button>
            <button class="danger" onclick="removeStock(${stock.id})">削除</button>
          </td>
        </tr>`;
    })
    .join("");
}

function watchStatusLabel(value) {
  return { normal: "通常監視", strong: "強監視", stopped: "停止" }[value] || value;
}

function renderSignals(signals) {
  $("#signals").innerHTML =
    signals
      .slice(0, 12)
      .map(
        (signal) => `
        <article class="signal-item">
          <h3>${signal.code} ${signal.name} <span class="badge ${signalClass(signal.signal_type)}">${signal.signal_type}</span></h3>
          <div class="muted">${signal.created_at} / ${signal.score}点 / ${signal.strength} / リスク:${signal.risk_level}</div>
          <ul class="reasons">${signal.reasons.slice(0, 3).map((reason) => `<li>${reason}</li>`).join("")}</ul>
        </article>`
      )
      .join("") || `<p class="muted">まだシグナルがありません。</p>`;
}

function renderNotifications(notifications) {
  $("#notifications").innerHTML =
    notifications
      .slice(0, 10)
      .map(
        (item) => `
        <article class="notification-item">
          <strong>${item.code} ${item.name}</strong>
          <div class="muted">${item.created_at} / ${item.status}</div>
          ${item.error ? `<p class="muted">${item.error}</p>` : ""}
        </article>`
      )
      .join("") || `<p class="muted">通知履歴はまだありません。</p>`;
}

async function loadAll() {
  const [dash, stocks, signals, notifications] = await Promise.all([
    api("/api/dashboard"),
    api("/api/stocks"),
    api("/api/signals"),
    api("/api/notifications"),
  ]);
  state.dashboard = dash;
  state.stocks = stocks.stocks;
  renderSummary();
  renderStocks();
  renderSignals(signals.signals);
  renderNotifications(notifications.notifications);
}

function formPayload() {
  return {
    code: $("#code").value,
    name: $("#name").value,
    tags: $("#tags").value,
    memo: $("#memo").value,
    watch_status: $("#watch_status").value,
    target_amount: Number($("#target_amount").value || 0),
    is_holding: $("#is_holding").checked,
    allow_additional_buy: $("#allow_additional_buy").checked,
    holding_price: $("#holding_price").value,
    holding_shares: $("#holding_shares").value,
  };
}

function resetForm() {
  $("#stockId").value = "";
  $("#stockForm").reset();
  $("#target_amount").value = 100000;
}

function editStock(id) {
  const stock = state.stocks.find((item) => item.id === id);
  if (!stock) return;
  $("#stockId").value = stock.id;
  $("#code").value = stock.code;
  $("#name").value = stock.name;
  $("#tags").value = stock.tags || "";
  $("#memo").value = stock.memo || "";
  $("#watch_status").value = stock.watch_status;
  $("#target_amount").value = stock.target_amount || 0;
  $("#is_holding").checked = Boolean(stock.is_holding);
  $("#allow_additional_buy").checked = Boolean(stock.allow_additional_buy);
  $("#holding_price").value = stock.holding_price || "";
  $("#holding_shares").value = stock.holding_shares || "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function removeStock(id) {
  if (!window.confirm("この銘柄を削除しますか？")) return;
  await api(`/api/stocks/${id}`, { method: "DELETE" });
  toast("削除しました。");
  await loadAll();
}

async function analyzeStock(id) {
  await api(`/api/stocks/${id}/analyze`, { method: "POST" });
  toast("分析しました。");
  await loadAll();
}

async function showDetail(id) {
  const detail = await api(`/api/stocks/${id}`);
  $("#detailPanel").hidden = false;
  $("#detailTitle").textContent = `${detail.stock.code} ${detail.stock.name}`;
  drawChart(detail.candles);
  const latest = detail.signals[0];
  $("#detailContent").innerHTML = `
    <div class="detail-box">
      <h2>最新シグナル</h2>
      ${
        latest
          ? `<p><span class="badge ${signalClass(latest.signal_type)}">${latest.signal_type}</span> ${latest.score}点 / ${latest.strength}</p>
             <p>リスク: ${latest.risk_level}</p>
             <ul class="reasons">${latest.reasons.map((reason) => `<li>${reason}</li>`).join("")}</ul>
             <p class="muted">${latest.beginner_note}</p>`
          : `<p class="muted">まだシグナルがありません。</p>`
      }
    </div>
    <div class="detail-box">
      <h2>指標</h2>
      <p>現在値: ${fmt(detail.indicators?.latest_close)}</p>
      <p>5MA: ${fmt(detail.indicators?.ma5)} / 25MA: ${fmt(detail.indicators?.ma25)} / 75MA: ${fmt(detail.indicators?.ma75)}</p>
      <p>RSI: ${fmt(detail.indicators?.rsi14)} / VWAP: ${fmt(detail.indicators?.vwap)}</p>
      <p>出来高倍率: ${fmt(detail.indicators?.volume_ratio)}倍</p>
    </div>`;
  $("#detailPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function drawChart(candles) {
  const canvas = $("#chart");
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(720, Math.floor(rect.width * window.devicePixelRatio));
  canvas.height = Math.floor(320 * window.devicePixelRatio);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  if (!candles.length) return;
  const view = candles.slice(-70);
  const max = Math.max(...view.map((c) => c.high));
  const min = Math.min(...view.map((c) => c.low));
  const pad = 24 * window.devicePixelRatio;
  const chartH = h - pad * 2;
  const step = (w - pad * 2) / view.length;
  const y = (price) => pad + ((max - price) / (max - min || 1)) * chartH;
  ctx.strokeStyle = "#d7dee8";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const yy = pad + (chartH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad, yy);
    ctx.lineTo(w - pad, yy);
    ctx.stroke();
  }
  view.forEach((candle, index) => {
    const x = pad + index * step + step / 2;
    const openY = y(candle.open);
    const closeY = y(candle.close);
    const highY = y(candle.high);
    const lowY = y(candle.low);
    const up = candle.close >= candle.open;
    ctx.strokeStyle = up ? "#147a4a" : "#b42318";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();
    const bodyTop = Math.min(openY, closeY);
    const bodyH = Math.max(Math.abs(closeY - openY), 2 * window.devicePixelRatio);
    ctx.fillRect(x - step * 0.28, bodyTop, step * 0.56, bodyH);
  });
  ctx.fillStyle = "#5d6b7a";
  ctx.font = `${12 * window.devicePixelRatio}px system-ui`;
  ctx.fillText(`高値 ${fmt(max)} / 安値 ${fmt(min)}`, pad, pad - 6);
}

$("#stockForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#stockId").value;
  const method = id ? "PUT" : "POST";
  const path = id ? `/api/stocks/${id}` : "/api/stocks";
  await api(path, { method, body: JSON.stringify(formPayload()) });
  toast("保存しました。");
  resetForm();
  await loadAll();
});

$("#resetForm").addEventListener("click", resetForm);
$("#analyzeBtn").addEventListener("click", async () => {
  $("#analyzeBtn").disabled = true;
  try {
    await api("/api/analyze", { method: "POST" });
    toast("全銘柄を分析しました。");
    await loadAll();
  } finally {
    $("#analyzeBtn").disabled = false;
  }
});
$("#notifyAnalyzeBtn").addEventListener("click", async () => {
  $("#notifyAnalyzeBtn").disabled = true;
  try {
    await api("/api/analyze?notify=1", { method: "POST" });
    toast("分析と通知判定を実行しました。");
    await loadAll();
  } finally {
    $("#notifyAnalyzeBtn").disabled = false;
  }
});
$("#importCsvBtn").addEventListener("click", async () => {
  const result = await api("/api/stocks/import", { method: "POST", body: JSON.stringify({ content: $("#csvContent").value }) });
  toast(`CSV取込: 追加${result.created}件 / 更新${result.updated}件 / エラー${result.errors.length}件`);
  await loadAll();
});
$("#closeDetail").addEventListener("click", () => {
  $("#detailPanel").hidden = true;
});

loadAll().catch((error) => toast(error.message));
