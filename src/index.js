const http = require("node:http");

const { config } = require("./config");
const { JsonDatabase } = require("./database");
const { TelegramClient } = require("./telegram");
const { FossBillingClient } = require("./fossbilling");
const { handleTelegramUpdate } = require("./bot");

function formatError(error) {
  if (!error) {
    return "Unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error.message) {
    return error.message;
  }
  if (error.code) {
    return String(error.code);
  }
  try {
    return JSON.stringify(error);
  } catch (_jsonError) {
    return String(error);
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}





function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function startPollingLoop({ telegram, db, billing }) {
  let stopped = false;
  let offset = 0;

  const run = async () => {
    console.log(
      `[polling] Started (timeout=${config.pollingTimeoutSec}s idle_delay=${config.pollingIdleDelayMs}ms).`,
    );

    while (!stopped) {
      try {
        const updates = await telegram.getUpdates({
          offset: offset > 0 ? offset : undefined,
          timeout: config.pollingTimeoutSec,
          allowedUpdates: ["message", "callback_query"],
        });

        if (Array.isArray(updates) && updates.length > 0) {
          for (const update of updates) {
            try {
              await handleTelegramUpdate(update, {
                db,
                telegram,
                billing,
                config,
              });
            } catch (error) {
              console.error("[polling] Failed to process update:", error);
            }

            if (
              update &&
              typeof update.update_id === "number" &&
              update.update_id >= offset
            ) {
              offset = update.update_id + 1;
            }
          }
          continue;
        }

        if (config.pollingIdleDelayMs > 0) {
          await sleep(config.pollingIdleDelayMs);
        }
      } catch (error) {
        if (stopped) {
          break;
        }
        console.error("[polling] getUpdates failed:", formatError(error));
        await sleep(config.pollingErrorDelayMs);
      }
    }

    console.log("[polling] Stopped.");
  };

  const done = run().catch((error) => {
    console.error("[polling] Fatal loop error:", error);
  });

  return {
    stop() {
      stopped = true;
    },
    done,
  };
}

async function startServer() {
  const db = new JsonDatabase(config.databaseFile, {
    defaultLanguage: config.defaultLanguage,
    defaultTimezone: config.defaultTimezone,
  });
  await db.init();

  const telegram = new TelegramClient(config.botToken);
  const billing = new FossBillingClient(config.billingBaseUrl, config.billingApiKey);

  const server = http.createServer(async (req, res) => {
    const method = req.method || "GET";
    const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;

    if (method === "GET" && pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "mehrnet-hosting-bot",
        mode: config.usePolling ? "polling" : "webhook",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (method === "GET" && pathname === "/") {
      sendJson(res, 200, {
        ok: true,
        message: "MehrNet Hosting Telegram Bot",
        mode: config.usePolling ? "polling" : "webhook",
      });
      return;
    }

    // Accept any POST (old webhooks) to prevent Telegram errors
    if (method === "POST") {
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  });

  await new Promise((resolve) => {
    server.listen(config.port, () => {
      console.log(
        `[startup] Bot server listening on port ${config.port}, mode=${
          config.usePolling ? "polling" : "webhook"
        }`,
      );
      resolve();
    });
  });

  let poller = null;
  if (config.usePolling) {
    poller = startPollingLoop({ telegram, db, billing });
  }

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    console.log(`[shutdown] Received ${signal}. Shutting down...`);
    if (poller) {
      poller.stop();
    }

    const forceExitTimer = setTimeout(() => {
      console.error("[shutdown] Force exiting after timeout.");
      process.exit(1);
    }, 8000);
    if (typeof forceExitTimer.unref === "function") {
      forceExitTimer.unref();
    }

    server.close(async (error) => {
      if (error) {
        clearTimeout(forceExitTimer);
        console.error("[shutdown] Failed to close server:", formatError(error));
        process.exit(1);
        return;
      }

      if (poller && poller.done) {
        await Promise.race([poller.done, sleep(1000)]);
      }

      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

module.exports = {
  startServer,
};
