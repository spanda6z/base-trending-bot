import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getBot } from "./src/telegram/bot";
import { registerHandlers } from "./src/telegram/handlers";
import { registerAdminHandlers } from "./src/telegram/adminHandlers";

type Handler = (req: any, res: any) => Promise<unknown> | unknown;

function attachVercelResponse(res: ServerResponse) {
  const response = res as ServerResponse & {
    status: (code: number) => typeof response;
    json: (body: unknown) => typeof response;
  };
  response.status = (code: number) => {
    response.statusCode = code;
    return response;
  };
  response.json = (body: unknown) => {
    if (!response.headersSent) {
      response.setHeader("content-type", "application/json; charset=utf-8");
    }
    response.end(JSON.stringify(body));
    return response;
  };
  return response;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_048_576) throw new Error("Request body too large");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function invoke(
  handler: Handler,
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
) {
  await handler(req, attachVercelResponse(res));
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url || "/", "http://localhost").pathname;
  try {
    if (req.method === "GET" && path === "/api/health") {
      const mod = await import("./api/health");
      await invoke(mod.default as Handler, req as any, res);
      return;
    }

    if (req.method === "POST" && path === "/api/cron/maintenance") {
      (req as any).body = await readJson(req);
      const mod = await import("./api/cron/maintenance");
      await invoke(mod.default as Handler, req as any, res);
      return;
    }

    if (req.method === "POST" && path === "/api/cron/payments") {
      (req as any).body = await readJson(req);
      const mod = await import("./api/cron/payments");
      await invoke(mod.default as Handler, req as any, res);
      return;
    }

    res.statusCode = 404;
    res.end("Not found");
  } catch (error) {
    console.error("[server]", error);
    if (!res.headersSent) res.statusCode = 500;
    res.end("Internal server error");
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => {
  console.log(`Base Trending Bot listening on 0.0.0.0:${port}`);
});

// Telegram runs in long-polling mode. Telegraf removes any previously configured
// webhook before polling, so no public webhook endpoint or webhook secret is used.
const bot = getBot();
registerHandlers(bot);
registerAdminHandlers(bot);
bot.catch((error) => console.error("[telegram] Update handler failed:", error));
bot.launch({ dropPendingUpdates: false })
  .then(() => console.log("[telegram] Bot started using long polling"))
  .catch((error) => {
    console.error("[telegram] Failed to start long polling:", error);
    process.exitCode = 1;
    server.close();
  });

// The original Vercel cron routes are also run on this always-on Railway service.
// Keep one app replica to avoid duplicate scheduled work.
let lastMaintenance = "";
let lastPayments = "";
setInterval(async () => {
  const now = new Date();
  if (now.getUTCMinutes() !== 0) return;
  const hourKey = now.toISOString().slice(0, 13);
  if (lastMaintenance !== hourKey) {
    lastMaintenance = hourKey;
    try {
      const mod = await import("./api/cron/maintenance");
      const mockRes = {
        statusCode: 200,
        status(code: number) { this.statusCode = code; return this; },
        json(body: unknown) { console.log("[scheduled:maintenance]", body); return this; },
      };
      await mod.default(
        { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET || ""}` }, body: {} } as any,
        mockRes as any,
      );
    } catch (error) {
      console.error("[scheduled:maintenance] failed", error);
    }
  }
  if (now.getUTCHours() % 2 === 0 && lastPayments !== hourKey) {
    lastPayments = hourKey;
    try {
      const mod = await import("./api/cron/payments");
      const mockRes = {
        statusCode: 200,
        status(code: number) { this.statusCode = code; return this; },
        json(body: unknown) { console.log("[scheduled:payments]", body); return this; },
      };
      await mod.default(
        { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET || ""}` }, body: {} } as any,
        mockRes as any,
      );
    } catch (error) {
      console.error("[scheduled:payments] failed", error);
    }
  }
}, 60_000);

function shutdown() {
  bot.stop("SIGTERM");
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
