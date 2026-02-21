const fs = require("node:fs");
const fsp = require("node:fs/promises");
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

function readRequestBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", reject);
  });
}

async function ensureWebhookOnStartup(telegram) {
  if (fs.existsSync(config.webhookLockFile)) {
    console.log(`[webhook] Lock file exists (${config.webhookLockFile}); skipping setup.`);
    return;
  }

  await telegram.setWebhook(config.webhookUrl, config.webhookSecret);
  await fsp.writeFile(
    config.webhookLockFile,
    [
      `created_at=${new Date().toISOString()}`,
      `webhook_url=${config.webhookUrl}`,
      "",
    ].join("\n"),
    "utf8",
  );
  console.log(`[webhook] Webhook set and lock file written: ${config.webhookLockFile}`);
}

async function ensurePollingOnStartup(telegram) {
  try {
    await telegram.deleteWebhook(false);
    console.log("[polling] Existing webhook removed (if present).");
  } catch (error) {
    console.warn(`[polling] Could not remove webhook: ${formatError(error)}`);
  }
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

  if (config.usePolling) {
    await ensurePollingOnStartup(telegram);
  } else {
    try {
      await ensureWebhookOnStartup(telegram);
    } catch (error) {
      console.error("[webhook] Setup failed:", error.message);
    }
  }

  const server = http.createServer(async (req, res) => {
    const method = req.method || "GET";
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = reqUrl.pathname;

    if (method === "GET" && pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "mehrnet-hosting-bot",
        webhookPath: config.webhookPath,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (method === "GET" && pathname === "/") {
      sendJson(res, 200, {
        ok: true,
        message: "MehrNet Hosting Telegram Bot",
        webhookPath: config.webhookPath,
      });
      return;
    }

    if (method === "POST" && pathname === config.webhookPath) {
      if (config.webhookSecret) {
        const incomingSecret = String(
          req.headers["x-telegram-bot-api-secret-token"] || "",
        );
        if (incomingSecret !== config.webhookSecret) {
          sendJson(res, 403, { ok: false, error: "Invalid webhook secret token." });
          return;
        }
      }

      try {
        const rawBody = await readRequestBody(req);
        const update = rawBody ? JSON.parse(rawBody) : {};

        await handleTelegramUpdate(update, {
          db,
          telegram,
          billing,
          config,
        });

        sendJson(res, 200, { ok: true });
      } catch (error) {
        console.error("[webhook] Failed to handle update:", error);
        sendJson(res, 500, { ok: false, error: "Webhook processing failed." });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  });

  await new Promise((resolve) => {
    server.listen(config.port, () => {
      console.log(
        `[startup] Bot server listening on port ${config.port}, mode=${
          config.usePolling ? "polling" : "webhook"
        }, webhook path ${config.webhookPath}`,
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
