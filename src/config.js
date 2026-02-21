const fs = require("node:fs");
const path = require("node:path");

function parseDotEnv(content) {
  const result = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separatorIndex = withoutExport.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = withoutExport.slice(0, separatorIndex).trim();
    let value = withoutExport.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadDotEnv(envPath = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  const parsed = parseDotEnv(raw);

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeBaseUrl(url) {
  const parsed = new URL(url);
  if (!parsed.protocol.startsWith("http")) {
    throw new Error("BILLING_BASE_URL must use http or https.");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

loadDotEnv();

const botToken = requireEnv("BOT_TOKEN");
const billingApiKey = requireEnv("BILLING_API_KEY");
const billingBaseUrl = normalizeBaseUrl(
  process.env.BILLING_BASE_URL || "https://dash.mehrnet.com",
);

const webhookSecret = (process.env.WEBHOOK_SECRET || "").trim();
const usePolling = (process.env.MODE || "").toUpperCase() === "POLLING";

const config = Object.freeze({
  botToken,
  billingApiKey,
  billingBaseUrl,
  webhookSecret,
  usePolling,
  databaseFile: path.resolve(
    process.cwd(),
    process.env.DATABASE_FILE || "./database.json",
  ),
  defaultLanguage: (process.env.DEFAULT_LANGUAGE || "en").trim(),
  defaultTimezone: (process.env.DEFAULT_TIMEZONE || "UTC").trim(),
  pollingTimeoutSec: parsePositiveInteger(process.env.POLLING_TIMEOUT_SEC, 25),
  pollingIdleDelayMs: parsePositiveInteger(process.env.POLLING_IDLE_DELAY_MS, 500),
  pollingErrorDelayMs: parsePositiveInteger(process.env.POLLING_ERROR_DELAY_MS, 2000),
  port: Number.parseInt(process.env.PORT || "3000", 10) || 3000,
});

module.exports = {
  config,
  loadDotEnv,
  parseDotEnv,
};
