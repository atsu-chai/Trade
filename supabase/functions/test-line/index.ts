const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
const LINE_TO_USER_ID = Deno.env.get("LINE_TO_USER_ID") ?? "";
const RUN_SIGNAL_BOT_SECRET = Deno.env.get("RUN_SIGNAL_BOT_SECRET") ?? "";

Deno.serve(async (request) => {
  if (!RUN_SIGNAL_BOT_SECRET) {
    return json({ error: "RUN_SIGNAL_BOT_SECRET is not configured." }, 500);
  }

  if (request.headers.get("x-bot-secret") !== RUN_SIGNAL_BOT_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_TO_USER_ID) {
    return json({ error: "LINE secrets are missing." }, 500);
  }

  const body = await readBody(request);
  const message =
    body.message ??
    `日本株AIシグナルbotのLINE通知テストです。\n送信時刻: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`;

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: LINE_TO_USER_ID,
      messages: [{ type: "text", text: message }],
    }),
  });

  if (!response.ok) {
    return json({ ok: false, status: response.status, error: await response.text() }, 502);
  }

  return json({ ok: true, status: "sent" });
});

async function readBody(request: Request): Promise<{ message?: string }> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

