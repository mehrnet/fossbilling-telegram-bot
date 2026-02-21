#!/usr/bin/env node
(function() {
  const __nativeRequire = typeof require === "function" ? require : null;
  const __modules = {
"src/config.js": function(module, exports, __require, __filename, __dirname, require) {
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

function resolveWebhookPath(webhookUrl) {
  if (!webhookUrl) {
    return "/telegram/webhook";
  }
  try {
    const parsed = new URL(webhookUrl);
    return parsed.pathname || "/telegram/webhook";
  } catch (_error) {
    return "/telegram/webhook";
  }
}

loadDotEnv();

const botToken = requireEnv("BOT_TOKEN");
const billingApiKey = requireEnv("BILLING_API_KEY");
const billingBaseUrl = normalizeBaseUrl(
  process.env.BILLING_BASE_URL || "https://dash.mehrnet.com",
);

const webhookUrl = (process.env.WEBHOOK_URL || "").trim();
const webhookPath = resolveWebhookPath(webhookUrl);
const usePolling = (process.env.MODE || "").toUpperCase() === "POLLING";

const config = Object.freeze({
  botToken,
  billingApiKey,
  billingBaseUrl,
  webhookUrl,
  webhookPath,
  webhookSecret: (process.env.WEBHOOK_SECRET || "").trim(),
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

},
"src/localization.js": function(module, exports, __require, __filename, __dirname, require) {
const SUPPORTED_LANGUAGES = ["en", "fa"];
const DEFAULT_LANGUAGE = "en";
const DEFAULT_TIMEZONE = "UTC";

const TIMEZONE_PRESETS = [
  { key: "utc", id: "UTC", label: "UTC" },
  { key: "tehran", id: "Asia/Tehran", label: "Asia/Tehran (+03:30)" },
  { key: "dubai", id: "Asia/Dubai", label: "Asia/Dubai (+04:00)" },
  { key: "istanbul", id: "Europe/Istanbul", label: "Europe/Istanbul (+03:00)" },
  { key: "london", id: "Europe/London", label: "Europe/London (GMT/BST)" },
  {
    key: "newyork",
    id: "America/New_York",
    label: "America/New_York (EST/EDT)",
  },
  {
    key: "losangeles",
    id: "America/Los_Angeles",
    label: "America/Los_Angeles (PST/PDT)",
  },
];

const LOCALES = {
  en: "en-US",
  fa: "fa-IR",
};

function normalizeLanguage(lang, fallback = DEFAULT_LANGUAGE) {
  if (!lang) {
    return fallback;
  }
  const value = String(lang).trim().toLowerCase();
  return SUPPORTED_LANGUAGES.includes(value) ? value : fallback;
}

function detectLanguage(telegramLanguageCode, fallback = DEFAULT_LANGUAGE) {
  if (!telegramLanguageCode) {
    return fallback;
  }

  const value = String(telegramLanguageCode).trim().toLowerCase();
  if (value.startsWith("fa") || value.startsWith("ir")) {
    return "fa";
  }
  return "en";
}

function isValidTimeZone(timeZone) {
  if (!timeZone) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch (_error) {
    return false;
  }
}

function normalizeTimeZone(timeZone, fallback = DEFAULT_TIMEZONE) {
  if (!timeZone) {
    return fallback;
  }

  const normalized = String(timeZone).trim();
  return isValidTimeZone(normalized) ? normalized : fallback;
}

function formatDateTime(value, context = {}) {
  const language = normalizeLanguage(context.language, DEFAULT_LANGUAGE);
  const locale = LOCALES[language] || LOCALES.en;
  const timeZone = normalizeTimeZone(context.timezone, DEFAULT_TIMEZONE);

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone,
    });

    return formatter.format(date);
  } catch (_error) {
    return date.toISOString().replace("T", " ").replace("Z", " UTC");
  }
}

function getTimezonePresetByKey(key) {
  return TIMEZONE_PRESETS.find((item) => item.key === key) || null;
}

module.exports = {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  DEFAULT_TIMEZONE,
  TIMEZONE_PRESETS,
  detectLanguage,
  normalizeLanguage,
  normalizeTimeZone,
  isValidTimeZone,
  formatDateTime,
  getTimezonePresetByKey,
};

},
"src/database.js": function(module, exports, __require, __filename, __dirname, require) {
const fs = require("node:fs/promises");
const path = require("node:path");

const {
  detectLanguage,
  normalizeLanguage,
  normalizeTimeZone,
  DEFAULT_LANGUAGE,
  DEFAULT_TIMEZONE,
} = __require("src/localization.js");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmptyState() {
  const now = Date.now();
  return {
    meta: {
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    users: {},
  };
}

class JsonDatabase {
  constructor(filePath, options = {}) {
    this.filePath = path.resolve(filePath);
    this.defaultLanguage = normalizeLanguage(
      options.defaultLanguage || DEFAULT_LANGUAGE,
      DEFAULT_LANGUAGE,
    );
    this.defaultTimezone = normalizeTimeZone(
      options.defaultTimezone || DEFAULT_TIMEZONE,
      DEFAULT_TIMEZONE,
    );
    this.state = createEmptyState();
    this._writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.state = this._normalizeState(parsed);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn("[database] Could not parse existing file, creating a new one.");
      }
      this.state = createEmptyState();
      await this._atomicWrite(this.state);
    }
  }

  _normalizeState(input) {
    const state = createEmptyState();
    if (!input || typeof input !== "object") {
      return state;
    }

    state.meta = {
      version: Number(input.meta?.version || 1),
      createdAt: Number(input.meta?.createdAt || Date.now()),
      updatedAt: Number(input.meta?.updatedAt || Date.now()),
    };

    if (input.users && typeof input.users === "object") {
      for (const [id, user] of Object.entries(input.users)) {
        state.users[id] = this._normalizeUser({
          ...user,
          telegramId: String(user.telegramId || id),
        });
      }
    }

    return state;
  }

  _normalizeUser(user) {
    const now = Date.now();
    return {
      telegramId: String(user.telegramId),
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      username: user.username || "",
      language: normalizeLanguage(
        user.language || this.defaultLanguage,
        this.defaultLanguage,
      ),
      timezone: normalizeTimeZone(
        user.timezone || this.defaultTimezone,
        this.defaultTimezone,
      ),
      billing:
        user.billing && typeof user.billing === "object"
          ? {
              email: String(user.billing.email || ""),
              clientId:
                user.billing.clientId === undefined
                  ? null
                  : String(user.billing.clientId),
              auth:
                user.billing.auth && typeof user.billing.auth === "object"
                  ? { ...user.billing.auth }
                  : null,
              linkedAt: Number(user.billing.linkedAt || now),
              lastSyncedAt: Number(user.billing.lastSyncedAt || now),
            }
          : null,
      state:
        user.state && typeof user.state === "object"
          ? {
              mode: String(user.state.mode || ""),
              reason: String(user.state.reason || ""),
              pendingAction:
                user.state.pendingAction && typeof user.state.pendingAction === "object"
                  ? { ...user.state.pendingAction }
                  : null,
              createdAt: Number(user.state.createdAt || now),
              updatedAt: Number(user.state.updatedAt || now),
            }
          : null,
      ui:
        user.ui && typeof user.ui === "object"
          ? {
              lastBotChatId:
                user.ui.lastBotChatId === undefined || user.ui.lastBotChatId === null
                  ? null
                  : Number(user.ui.lastBotChatId),
              lastBotMessageId:
                user.ui.lastBotMessageId === undefined || user.ui.lastBotMessageId === null
                  ? null
                  : Number(user.ui.lastBotMessageId),
              updatedAt: Number(user.ui.updatedAt || now),
            }
          : {
              lastBotChatId: null,
              lastBotMessageId: null,
              updatedAt: now,
            },
      createdAt: Number(user.createdAt || now),
      updatedAt: Number(user.updatedAt || now),
      lastSeenAt: Number(user.lastSeenAt || now),
    };
  }

  async _atomicWrite(state) {
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    const serialized = `${JSON.stringify(state, null, 2)}\n`;
    await fs.writeFile(tempPath, serialized, "utf8");
    await fs.rename(tempPath, this.filePath);
  }

  async _commit(mutator) {
    let result;

    this._writeQueue = this._writeQueue
      .catch(() => {})
      .then(async () => {
        const draft = clone(this.state);
        result = await mutator(draft);
        draft.meta.updatedAt = Date.now();
        this.state = draft;
        await this._atomicWrite(this.state);
      });

    await this._writeQueue;
    return clone(result);
  }

  async getUser(telegramId) {
    const key = String(telegramId);
    const user = this.state.users[key];
    return user ? clone(user) : null;
  }

  async upsertTelegramUser(from = {}) {
    const telegramId = String(from.id || "");
    if (!telegramId) {
      throw new Error("Missing Telegram user id.");
    }

    return this._commit((state) => {
      const now = Date.now();
      const existing = state.users[telegramId] || null;
      const createdAt = existing?.createdAt || now;
      const language =
        existing?.language ||
        detectLanguage(from.language_code, this.defaultLanguage);
      const timezone = existing?.timezone || this.defaultTimezone;

      const merged = this._normalizeUser({
        telegramId,
        firstName: from.first_name || existing?.firstName || "",
        lastName: from.last_name || existing?.lastName || "",
        username: from.username || existing?.username || "",
        language,
        timezone,
        billing: existing?.billing || null,
        state: existing?.state || null,
        ui: existing?.ui || null,
        createdAt,
        updatedAt: now,
        lastSeenAt: now,
      });

      state.users[telegramId] = merged;
      return merged;
    });
  }

  async touchUser(telegramId) {
    const key = String(telegramId);
    return this._commit((state) => {
      const user = state.users[key];
      if (!user) {
        return null;
      }
      user.lastSeenAt = Date.now();
      user.updatedAt = Date.now();
      return user;
    });
  }

  async setLanguage(telegramId, language) {
    const key = String(telegramId);
    return this._commit((state) => {
      const user = state.users[key];
      if (!user) {
        return null;
      }
      user.language = normalizeLanguage(language, this.defaultLanguage);
      user.updatedAt = Date.now();
      return user;
    });
  }

  async setTimezone(telegramId, timezone) {
    const key = String(telegramId);
    return this._commit((state) => {
      const user = state.users[key];
      if (!user) {
        return null;
      }
      user.timezone = normalizeTimeZone(timezone, this.defaultTimezone);
      user.updatedAt = Date.now();
      return user;
    });
  }

  async linkBilling(telegramId, billingData) {
    const key = String(telegramId);
    return this._commit((state) => {
      const user = state.users[key];
      if (!user) {
        return null;
      }

      user.billing = {
        email: String(billingData.email || ""),
        clientId:
          billingData.clientId === undefined || billingData.clientId === null
            ? null
            : String(billingData.clientId),
        auth:
          billingData.auth && typeof billingData.auth === "object"
            ? { ...billingData.auth }
            : null,
        linkedAt: Date.now(),
        lastSyncedAt: Date.now(),
      };
      user.state = null;
      user.updatedAt = Date.now();
      return user;
    });
  }

  async unlinkBilling(telegramId) {
    const key = String(telegramId);
    return this._commit((state) => {
      const user = state.users[key];
      if (!user) {
        return null;
      }
      user.billing = null;
      user.state = null;
      user.updatedAt = Date.now();
      return user;
    });
  }

  async setUserState(telegramId, stateData) {
    const key = String(telegramId);
    return this._commit((state) => {
      const user = state.users[key];
      if (!user) {
        return null;
      }

      const now = Date.now();
      user.state = {
        mode: String(stateData?.mode || ""),
        reason: String(stateData?.reason || ""),
        pendingAction:
          stateData?.pendingAction && typeof stateData.pendingAction === "object"
            ? { ...stateData.pendingAction }
            : null,
        createdAt: Number(stateData?.createdAt || now),
        updatedAt: now,
      };
      user.updatedAt = now;
      return user;
    });
  }

  async clearUserState(telegramId) {
    const key = String(telegramId);
    return this._commit((state) => {
      const user = state.users[key];
      if (!user) {
        return null;
      }
      user.state = null;
      user.updatedAt = Date.now();
      return user;
    });
  }

  async setLatestBotMessage(telegramId, chatId, messageId) {
    const key = String(telegramId);
    return this._commit((state) => {
      const user = state.users[key];
      if (!user) {
        return null;
      }
      const now = Date.now();
      user.ui = {
        lastBotChatId:
          chatId === undefined || chatId === null ? null : Number(chatId),
        lastBotMessageId:
          messageId === undefined || messageId === null ? null : Number(messageId),
        updatedAt: now,
      };
      user.updatedAt = now;
      return user;
    });
  }

  async clearLatestBotMessage(telegramId) {
    const key = String(telegramId);
    return this._commit((state) => {
      const user = state.users[key];
      if (!user) {
        return null;
      }
      const now = Date.now();
      user.ui = {
        lastBotChatId: null,
        lastBotMessageId: null,
        updatedAt: now,
      };
      user.updatedAt = now;
      return user;
    });
  }
}

module.exports = {
  JsonDatabase,
};

},
"src/http-client.js": function(module, exports, __require, __filename, __dirname, require) {
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const tls = require("node:tls");

const RETRYABLE_PROXY_CODES = new Set([
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
  "EAI_AGAIN",
  "ERR_SOCKET_CLOSED",
]);

const SOCKS_REPLY_ERRORS = {
  0x01: "General SOCKS server failure",
  0x02: "Connection not allowed by ruleset",
  0x03: "Network unreachable",
  0x04: "Host unreachable",
  0x05: "Connection refused by destination host",
  0x06: "TTL expired",
  0x07: "Command not supported",
  0x08: "Address type not supported",
};

function getTransport(url) {
  return url.protocol === "https:" ? https : http;
}

function defaultPort(protocol) {
  if (protocol === "https:") {
    return 443;
  }
  if (protocol === "http:") {
    return 80;
  }
  if (protocol === "socks:" || protocol === "socks5:" || protocol === "socks5h:") {
    return 1080;
  }
  return 0;
}

function getProxyLabel(proxyUrl) {
  return `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port || defaultPort(proxyUrl.protocol)}`;
}

function describeError(error) {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof AggregateError || Array.isArray(error.errors)) {
    const children = Array.isArray(error.errors) ? error.errors : [];
    const childMessages = children
      .map((child) => {
        if (!child) {
          return "";
        }
        const parts = [];
        if (child.code) {
          parts.push(String(child.code));
        }
        if (child.message) {
          parts.push(String(child.message));
        }
        if (child.address || child.port) {
          parts.push(
            [
              child.address ? `address=${child.address}` : "",
              child.port ? `port=${child.port}` : "",
            ]
              .filter(Boolean)
              .join(" "),
          );
        }
        return parts.join(" | ").trim();
      })
      .filter(Boolean);

    if (childMessages.length > 0) {
      return childMessages.join(" ; ");
    }
  }

  const fallbackParts = [];
  if (error.code) {
    fallbackParts.push(String(error.code));
  }
  if (error.message) {
    fallbackParts.push(String(error.message));
  }
  if (fallbackParts.length > 0) {
    return fallbackParts.join(" | ");
  }

  try {
    return JSON.stringify(error);
  } catch (_error) {
    return String(error);
  }
}

function normalizeRequestError(error, contextLabel) {
  const message = describeError(error);
  const wrapped = new Error(`${contextLabel}: ${message}`);
  wrapped.cause = error;
  if (error && error.code) {
    wrapped.code = error.code;
  }
  return wrapped;
}

function isRetryableProxyError(error) {
  const code = error?.code || error?.cause?.code || "";
  if (code && RETRYABLE_PROXY_CODES.has(String(code))) {
    return true;
  }

  const message = describeError(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("connect failed") ||
    message.includes("proxy") ||
    message.includes("socks")
  );
}

function getProxyAuthorizationHeader(proxyUrl) {
  if (!proxyUrl.username && !proxyUrl.password) {
    return "";
  }

  const username = decodeURIComponent(proxyUrl.username || "");
  const password = decodeURIComponent(proxyUrl.password || "");
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

function normalizeProxyUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  try {
    return new URL(raw);
  } catch (_error) {
    return new URL(`http://${raw}`);
  }
}

function isSupportedProxyProtocol(protocol) {
  return (
    protocol === "http:" ||
    protocol === "https:" ||
    protocol === "socks:" ||
    protocol === "socks5:" ||
    protocol === "socks5h:"
  );
}

function parseNoProxyEntries(noProxyValue) {
  return String(noProxyValue || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isProxyDisabledByEnv() {
  const value = String(process.env.DISABLE_SYSTEM_PROXY || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function shouldBypassProxy(targetUrl) {
  const entries = parseNoProxyEntries(process.env.NO_PROXY || process.env.no_proxy);
  if (entries.length === 0) {
    return false;
  }

  const hostname = String(targetUrl.hostname || "").toLowerCase();
  const targetPort = String(targetUrl.port || defaultPort(targetUrl.protocol));

  for (const entry of entries) {
    if (entry === "*") {
      return true;
    }

    const hasPort = entry.includes(":");
    const [entryHostRaw, entryPort] = hasPort ? entry.split(":", 2) : [entry, ""];
    const entryHost = entryHostRaw.replace(/^\./, "");
    if (!entryHost) {
      continue;
    }

    if (entryPort && entryPort !== targetPort) {
      continue;
    }

    if (hostname === entryHost || hostname.endsWith(`.${entryHost}`)) {
      return true;
    }
  }

  return false;
}

function getProxyCandidatesForTarget(targetUrl) {
  if (isProxyDisabledByEnv() || shouldBypassProxy(targetUrl)) {
    return [];
  }

  const orderedValues =
    targetUrl.protocol === "https:"
      ? [
          process.env.HTTPS_PROXY,
          process.env.https_proxy,
          process.env.ALL_PROXY,
          process.env.all_proxy,
          process.env.HTTP_PROXY,
          process.env.http_proxy,
        ]
      : [
          process.env.HTTP_PROXY,
          process.env.http_proxy,
          process.env.ALL_PROXY,
          process.env.all_proxy,
        ];

  const seen = new Set();
  const list = [];

  for (const value of orderedValues) {
    const parsed = normalizeProxyUrl(value);
    if (!parsed || !isSupportedProxyProtocol(parsed.protocol)) {
      continue;
    }

    const key = parsed.toString();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    list.push(parsed);
  }

  return list;
}

function finalizeResponse(res, chunks) {
  const rawBody = Buffer.concat(chunks).toString("utf8");
  const contentType = String(res.headers["content-type"] || "");
  let data = rawBody;

  if (contentType.includes("application/json")) {
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch (_error) {
      data = rawBody;
    }
  } else if (rawBody.startsWith("{") || rawBody.startsWith("[")) {
    try {
      data = JSON.parse(rawBody);
    } catch (_error) {
      data = rawBody;
    }
  }

  return {
    statusCode: res.statusCode || 0,
    headers: res.headers,
    data,
    rawBody,
  };
}

function requestDirect(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const transport = getTransport(targetUrl);
    const headers = { ...(options.headers || {}) };
    const body = options.body || "";

    if (body && !headers["Content-Length"] && !headers["content-length"]) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = transport.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || defaultPort(targetUrl.protocol),
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method: options.method || "GET",
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve(finalizeResponse(res, chunks));
        });
      },
    );

    req.setTimeout(options.timeoutMs || 15000, () => {
      req.destroy(new Error("Request timeout"));
    });

    req.on("error", (error) => {
      reject(normalizeRequestError(error, `HTTP request failed (${targetUrl.hostname})`));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function requestHttpViaHttpProxy(targetUrl, proxyUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const transport = getTransport(proxyUrl);
    const proxyLabel = getProxyLabel(proxyUrl);
    const headers = { ...(options.headers || {}) };
    const body = options.body || "";

    headers.Host = headers.Host || targetUrl.host;
    const proxyAuth = getProxyAuthorizationHeader(proxyUrl);
    if (proxyAuth) {
      headers["Proxy-Authorization"] = proxyAuth;
    }

    if (body && !headers["Content-Length"] && !headers["content-length"]) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = transport.request(
      {
        protocol: proxyUrl.protocol,
        hostname: proxyUrl.hostname,
        port: proxyUrl.port || defaultPort(proxyUrl.protocol),
        method: options.method || "GET",
        path: targetUrl.toString(),
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve(finalizeResponse(res, chunks));
        });
      },
    );

    req.setTimeout(options.timeoutMs || 15000, () => {
      req.destroy(new Error("Request timeout"));
    });

    req.on("error", (error) => {
      reject(
        normalizeRequestError(
          error,
          `HTTP proxy request failed (${proxyLabel} -> ${targetUrl.hostname})`,
        ),
      );
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function openHttpConnectTunnel(targetUrl, proxyUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const transport = getTransport(proxyUrl);
    const proxyLabel = getProxyLabel(proxyUrl);
    const targetPort = Number(targetUrl.port || defaultPort(targetUrl.protocol));
    const proxyHeaders = {};
    const proxyAuth = getProxyAuthorizationHeader(proxyUrl);
    if (proxyAuth) {
      proxyHeaders["Proxy-Authorization"] = proxyAuth;
    }

    const connectReq = transport.request({
      protocol: proxyUrl.protocol,
      hostname: proxyUrl.hostname,
      port: proxyUrl.port || defaultPort(proxyUrl.protocol),
      method: "CONNECT",
      path: `${targetUrl.hostname}:${targetPort}`,
      headers: {
        Host: `${targetUrl.hostname}:${targetPort}`,
        ...proxyHeaders,
      },
    });

    connectReq.setTimeout(options.timeoutMs || 15000, () => {
      connectReq.destroy(new Error("Proxy CONNECT timeout"));
    });

    connectReq.on("connect", (res, socket, head) => {
      if ((res.statusCode || 0) !== 200) {
        socket.destroy();
        reject(
          new Error(
            `Proxy CONNECT failed with status ${res.statusCode || 0} (${proxyLabel})`,
          ),
        );
        return;
      }

      if (head && head.length > 0) {
        socket.unshift(head);
      }

      resolve(socket);
    });

    connectReq.on("error", (error) => {
      reject(
        normalizeRequestError(
          error,
          `Proxy CONNECT failed (${proxyLabel} -> ${targetUrl.hostname})`,
        ),
      );
    });

    connectReq.end();
  });
}

function requestHttpsOverSocket(targetUrl, socket, contextLabel, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (error, responsePayload) => {
      if (settled) {
        return;
      }
      settled = true;
      agent.destroy();

      if (error) {
        socket.destroy();
        reject(normalizeRequestError(error, contextLabel));
        return;
      }

      resolve(responsePayload);
    };

    const targetPort = Number(targetUrl.port || 443);
    const agent = new https.Agent({
      keepAlive: false,
      maxSockets: 1,
    });
    agent.createConnection = () =>
      tls.connect({
        socket,
        servername: targetUrl.hostname,
      });

    const headers = { ...(options.headers || {}) };
    const body = options.body || "";
    headers.Host = headers.Host || targetUrl.host;
    if (body && !headers["Content-Length"] && !headers["content-length"]) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = https.request(
      {
        protocol: "https:",
        hostname: targetUrl.hostname,
        port: targetPort,
        method: options.method || "GET",
        path: `${targetUrl.pathname}${targetUrl.search}`,
        headers,
        agent,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          done(null, finalizeResponse(response, chunks));
        });
      },
    );

    req.setTimeout(options.timeoutMs || 15000, () => {
      req.destroy(new Error("Request timeout"));
    });
    req.on("error", (error) => done(error));

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function requestHttpOverSocket(targetUrl, socket, contextLabel, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (error, responsePayload) => {
      if (settled) {
        return;
      }
      settled = true;
      agent.destroy();

      if (error) {
        socket.destroy();
        reject(normalizeRequestError(error, contextLabel));
        return;
      }

      resolve(responsePayload);
    };

    const agent = new http.Agent({
      keepAlive: false,
      maxSockets: 1,
    });
    agent.createConnection = () => socket;

    const headers = { ...(options.headers || {}) };
    const body = options.body || "";
    headers.Host = headers.Host || targetUrl.host;
    if (body && !headers["Content-Length"] && !headers["content-length"]) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = http.request(
      {
        protocol: "http:",
        hostname: targetUrl.hostname,
        port: Number(targetUrl.port || 80),
        method: options.method || "GET",
        path: `${targetUrl.pathname}${targetUrl.search}`,
        headers,
        agent,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          done(null, finalizeResponse(response, chunks));
        });
      },
    );

    req.setTimeout(options.timeoutMs || 15000, () => {
      req.destroy(new Error("Request timeout"));
    });
    req.on("error", (error) => done(error));

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function waitForReadable(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onReadable = () => {
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (error) => {
      settled = true;
      cleanup();
      reject(error);
    };
    const onClosed = () => {
      settled = true;
      cleanup();
      reject(new Error("Socket closed unexpectedly"));
    };
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error("Socket read timeout"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("readable", onReadable);
      socket.off("error", onError);
      socket.off("end", onClosed);
      socket.off("close", onClosed);
    };

    socket.on("readable", onReadable);
    socket.on("error", onError);
    socket.on("end", onClosed);
    socket.on("close", onClosed);
  });
}

async function readBytes(socket, expected, timeoutMs) {
  const chunks = [];
  let total = 0;

  while (total < expected) {
    const chunk = socket.read(expected - total);
    if (!chunk) {
      await waitForReadable(socket, timeoutMs);
      continue;
    }

    chunks.push(chunk);
    total += chunk.length;
  }

  return Buffer.concat(chunks, expected);
}

function writeBytes(socket, buffer, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy(new Error("Socket write timeout"));
      reject(new Error("Socket write timeout"));
    }, timeoutMs);

    socket.write(buffer, (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function connectTcp(hostname, port, timeoutMs, contextLabel) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({
      host: hostname,
      port,
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy(new Error("Connection timeout"));
      reject(new Error("Connection timeout"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("error", onError);
    };

    const onConnect = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(socket);
    };

    const onError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(normalizeRequestError(error, contextLabel));
    };

    socket.on("connect", onConnect);
    socket.on("error", onError);
  });
}

async function openSocks5Tunnel(targetUrl, proxyUrl, options = {}) {
  const timeoutMs = options.timeoutMs || 15000;
  const proxyLabel = getProxyLabel(proxyUrl);
  const proxyPort = Number(proxyUrl.port || 1080);
  const targetPort = Number(targetUrl.port || defaultPort(targetUrl.protocol));

  const socket = await connectTcp(
    proxyUrl.hostname,
    proxyPort,
    timeoutMs,
    `SOCKS proxy connect failed (${proxyLabel})`,
  );

  try {
    const username = decodeURIComponent(proxyUrl.username || "");
    const password = decodeURIComponent(proxyUrl.password || "");
    const hasAuth = username.length > 0 || password.length > 0;

    const methods = hasAuth ? Buffer.from([0x00, 0x02]) : Buffer.from([0x00]);
    await writeBytes(
      socket,
      Buffer.concat([Buffer.from([0x05, methods.length]), methods]),
      timeoutMs,
    );

    const methodResponse = await readBytes(socket, 2, timeoutMs);
    if (methodResponse[0] !== 0x05) {
      throw new Error(`Invalid SOCKS version: ${methodResponse[0]}`);
    }
    if (methodResponse[1] === 0xff) {
      throw new Error("SOCKS proxy has no acceptable authentication method.");
    }

    if (methodResponse[1] === 0x02) {
      const userBytes = Buffer.from(username, "utf8");
      const passBytes = Buffer.from(password, "utf8");
      if (userBytes.length > 255 || passBytes.length > 255) {
        throw new Error("SOCKS username/password is too long.");
      }

      await writeBytes(
        socket,
        Buffer.concat([
          Buffer.from([0x01, userBytes.length]),
          userBytes,
          Buffer.from([passBytes.length]),
          passBytes,
        ]),
        timeoutMs,
      );

      const authResponse = await readBytes(socket, 2, timeoutMs);
      if (authResponse[1] !== 0x00) {
        throw new Error("SOCKS authentication failed.");
      }
    } else if (methodResponse[1] !== 0x00) {
      throw new Error(`SOCKS authentication method ${methodResponse[1]} not supported.`);
    }

    const hostBytes = Buffer.from(targetUrl.hostname, "utf8");
    if (hostBytes.length === 0 || hostBytes.length > 255) {
      throw new Error("Target host is invalid for SOCKS tunneling.");
    }

    const connectRequest = Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, hostBytes.length]),
      hostBytes,
      Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff]),
    ]);
    await writeBytes(socket, connectRequest, timeoutMs);

    const replyHead = await readBytes(socket, 4, timeoutMs);
    if (replyHead[0] !== 0x05) {
      throw new Error(`Invalid SOCKS reply version: ${replyHead[0]}`);
    }
    if (replyHead[1] !== 0x00) {
      const explanation =
        SOCKS_REPLY_ERRORS[replyHead[1]] || `Unknown SOCKS reply code ${replyHead[1]}`;
      throw new Error(`SOCKS CONNECT rejected: ${explanation}`);
    }

    if (replyHead[3] === 0x01) {
      await readBytes(socket, 4 + 2, timeoutMs);
    } else if (replyHead[3] === 0x04) {
      await readBytes(socket, 16 + 2, timeoutMs);
    } else if (replyHead[3] === 0x03) {
      const len = await readBytes(socket, 1, timeoutMs);
      await readBytes(socket, len[0] + 2, timeoutMs);
    } else {
      throw new Error(`SOCKS CONNECT returned unknown address type ${replyHead[3]}`);
    }

    return socket;
  } catch (error) {
    socket.destroy();
    throw normalizeRequestError(
      error,
      `SOCKS tunnel failed (${proxyLabel} -> ${targetUrl.hostname}:${targetPort})`,
    );
  }
}

async function requestViaProxy(targetUrl, proxyUrl, options = {}) {
  const protocol = proxyUrl.protocol;
  const proxyLabel = getProxyLabel(proxyUrl);

  if (protocol === "http:" || protocol === "https:") {
    if (targetUrl.protocol === "http:") {
      return requestHttpViaHttpProxy(targetUrl, proxyUrl, options);
    }
    if (targetUrl.protocol === "https:") {
      const tunnelSocket = await openHttpConnectTunnel(targetUrl, proxyUrl, options);
      return requestHttpsOverSocket(
        targetUrl,
        tunnelSocket,
        `HTTPS request failed through proxy (${proxyLabel} -> ${targetUrl.hostname})`,
        options,
      );
    }
    throw new Error(`Unsupported target protocol: ${targetUrl.protocol}`);
  }

  if (protocol === "socks:" || protocol === "socks5:" || protocol === "socks5h:") {
    const tunnelSocket = await openSocks5Tunnel(targetUrl, proxyUrl, options);
    if (targetUrl.protocol === "http:") {
      return requestHttpOverSocket(
        targetUrl,
        tunnelSocket,
        `HTTP request failed through SOCKS proxy (${proxyLabel} -> ${targetUrl.hostname})`,
        options,
      );
    }
    if (targetUrl.protocol === "https:") {
      return requestHttpsOverSocket(
        targetUrl,
        tunnelSocket,
        `HTTPS request failed through SOCKS proxy (${proxyLabel} -> ${targetUrl.hostname})`,
        options,
      );
    }
    throw new Error(`Unsupported target protocol: ${targetUrl.protocol}`);
  }

  throw new Error(`Unsupported proxy protocol: ${protocol}`);
}

async function request(urlString, options = {}) {
  const targetUrl = new URL(urlString);
  const proxyCandidates = options.disableProxy ? [] : getProxyCandidatesForTarget(targetUrl);

  if (proxyCandidates.length === 0) {
    return requestDirect(targetUrl, options);
  }

  const failures = [];
  for (const proxyUrl of proxyCandidates) {
    try {
      return await requestViaProxy(targetUrl, proxyUrl, options);
    } catch (error) {
      failures.push({
        proxy: getProxyLabel(proxyUrl),
        message: describeError(error),
        error,
      });

      if (!isRetryableProxyError(error)) {
        break;
      }
    }
  }

  const details = failures
    .map((item) => `${item.proxy} => ${item.message}`)
    .join(" ; ");
  const finalError = new Error(
    `All proxy attempts failed for ${targetUrl.hostname}: ${details}`,
  );
  finalError.cause = failures.length > 0 ? failures[failures.length - 1].error : null;
  throw finalError;
}

async function postJson(urlString, payload, options = {}) {
  return request(urlString, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: JSON.stringify(payload || {}),
    timeoutMs: options.timeoutMs,
  });
}

async function postForm(urlString, payload, options = {}) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) {
      continue;
    }
    form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }

  return request(urlString, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(options.headers || {}),
    },
    body: form.toString(),
    timeoutMs: options.timeoutMs,
  });
}

module.exports = {
  request,
  postJson,
  postForm,
};

},
"src/telegram.js": function(module, exports, __require, __filename, __dirname, require) {
const { postJson } = __require("src/http-client.js");

class TelegramClient {
  constructor(botToken) {
    this.botToken = botToken;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async api(method, payload = {}) {
    const url = `${this.baseUrl}/${method}`;
    const response = await postJson(url, payload);

    if (response.statusCode >= 400) {
      throw new Error(
        `Telegram HTTP ${response.statusCode} on ${method}: ${response.rawBody.slice(
          0,
          300,
        )}`,
      );
    }

    const body = response.data;
    if (!body || typeof body !== "object" || body.ok !== true) {
      const errorText =
        body && typeof body === "object"
          ? `${body.error_code || ""} ${body.description || ""}`.trim()
          : String(response.rawBody || "Unknown Telegram error");
      throw new Error(`Telegram API error on ${method}: ${errorText}`);
    }

    return body.result;
  }

  async setWebhook(url, secretToken = "") {
    const payload = {
      url,
      allowed_updates: [
        "message",
        "callback_query",
      ],
      drop_pending_updates: false,
    };

    if (secretToken) {
      payload.secret_token = secretToken;
    }

    return this.api("setWebhook", payload);
  }

  async deleteWebhook(dropPendingUpdates = false) {
    return this.api("deleteWebhook", {
      drop_pending_updates: Boolean(dropPendingUpdates),
    });
  }

  async getUpdates(options = {}) {
    const payload = {
      timeout: Number.isFinite(options.timeout) ? options.timeout : 25,
      allowed_updates: Array.isArray(options.allowedUpdates)
        ? options.allowedUpdates
        : ["message", "callback_query"],
    };

    if (Number.isFinite(options.offset)) {
      payload.offset = options.offset;
    }

    return this.api("getUpdates", payload);
  }

  async sendMessage(chatId, text, options = {}) {
    const payload = {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...options,
    };
    return this.api("sendMessage", payload);
  }

  async editMessageText(chatId, messageId, text, options = {}) {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text,
      disable_web_page_preview: true,
      ...options,
    };
    return this.api("editMessageText", payload);
  }

  async deleteMessage(chatId, messageId) {
    return this.api("deleteMessage", {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  async answerCallbackQuery(callbackQueryId, text = "", showAlert = false) {
    return this.api("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }
}

module.exports = {
  TelegramClient,
};

},
"src/fossbilling.js": function(module, exports, __require, __filename, __dirname, require) {
const { postJson, postForm } = __require("src/http-client.js");

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function throwIfApiError(body) {
  if (!body || typeof body !== "object") {
    return;
  }
  if (!body.error) {
    return;
  }

  if (typeof body.error === "string") {
    throw new Error(body.error);
  }

  const message =
    body.error.message ||
    body.error.msg ||
    body.error.code ||
    JSON.stringify(body.error);
  throw new Error(String(message));
}

function unwrapApiResult(body) {
  throwIfApiError(body);
  if (body && Object.prototype.hasOwnProperty.call(body, "result")) {
    return body.result;
  }
  return body;
}

function safeText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value.list)) {
    return value.list;
  }
  if (Array.isArray(value.data)) {
    return value.data;
  }
  if (Array.isArray(value.items)) {
    return value.items;
  }

  return [];
}

function buildBasicAuthHeader(username, password) {
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

function isAuthenticationFailureError(error) {
  const message = String(error?.message || error || "");
  return (
    message.includes("Authentication Failed") ||
    message.includes("HTTP 401") ||
    message.includes("code\":206") ||
    message.includes("code 206")
  );
}

function isMethodNotFoundError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("method not found") ||
    message.includes("unknown method") ||
    message.includes("invalid method") ||
    message.includes("does not exist") ||
    message.includes("does not exists") ||
    message.includes("not implemented")
  );
}

/**
 * API Schema represents available methods and field mappings per FOSSBilling instance.
 * Cached in database to avoid repeated discovery calls.
 */
class ApiSchema {
  constructor() {
    this.endpoints = {};
    this.fieldMaps = {};
    this.discoveredAt = null;
  }

  registerEndpoint(scope, method, variants = []) {
    const key = `${scope}/${method}`;
    this.endpoints[key] = {
      scope,
      method,
      variants: Array.isArray(variants) ? variants : [method],
    };
  }

  registerFieldMap(entity, fields = {}) {
    this.fieldMaps[entity] = fields;
  }

  getFieldMap(entity) {
    return this.fieldMaps[entity] || {};
  }

  tryMethods(scope, method) {
    const key = `${scope}/${method}`;
    const endpoint = this.endpoints[key];
    if (!endpoint) {
      return [method];
    }
    return endpoint.variants;
  }
}

class FossBillingClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey;
    this.schema = new ApiSchema();
    this._initializeDefaultSchema();
  }

  _initializeDefaultSchema() {
    // Profile endpoints
    this.schema.registerEndpoint("guest", "client/login", ["client/login"]);
    this.schema.registerEndpoint("client", "profile/get", ["profile/get", "client/get"]);

    // Service/Order endpoints
    this.schema.registerEndpoint("client", "order/get_list", [
      "order/get_list",
      "order/gets",
      "service/get_list",
    ]);
    this.schema.registerEndpoint("admin", "order/get_list", ["order/get_list"]);

    // Invoice endpoints
    this.schema.registerEndpoint("client", "invoice/get_list", [
      "invoice/get_list",
      "invoice/gets",
    ]);
    this.schema.registerEndpoint("admin", "invoice/get_list", ["invoice/get_list"]);
    this.schema.registerEndpoint("guest", "invoice/payment", [
      "invoice/payment",
      "invoice/pay",
    ]);

    // Ticket endpoints
    this.schema.registerEndpoint("client", "support/ticket_get_list", [
      "support/ticket_get_list",
      "support/ticket/get_list",
      "support/ticket_gets",
      "support/ticket/gets",
    ]);
    this.schema.registerEndpoint("admin", "support/ticket_get_list", [
      "support/ticket_get_list",
    ]);

    // Domain endpoints
    this.schema.registerEndpoint("client", "domain/get_list", [
      "domain/get_list",
      "domain/gets",
    ]);
    this.schema.registerEndpoint("admin", "domain/get_list", ["domain/get_list"]);

    // Addon/Extra endpoints
    this.schema.registerEndpoint("client", "addon/get_list", [
      "addon/get_list",
      "addon/gets",
    ]);
    this.schema.registerEndpoint("admin", "addon/get_list", ["addon/get_list"]);

    // Renewal invoice
    this.schema.registerEndpoint("client", "invoice/renewal_invoice", [
      "invoice/renewal_invoice",
    ]);
    this.schema.registerEndpoint("admin", "invoice/renewal_invoice", [
      "invoice/renewal_invoice",
    ]);

    // Field mappings for normalization
    this.schema.registerFieldMap("account", {
      id: ["id", "client_id", "clientId"],
      email: ["email"],
      firstName: ["first_name", "firstName"],
      lastName: ["last_name", "lastName"],
      fullName: ["name"],
      status: ["status"],
      balance: ["balance", "credit"],
      currency: ["currency", "currency_code", "currencyCode", "currency_title"],
      group: ["group", "group_name"],
    });

    this.schema.registerFieldMap("service", {
      id: ["id", "order_id", "orderId", "invoiceable_id", "service_id"],
      title: ["title", "product_title", "label", "description", "domain"],
      status: ["status", "service_status"],
      nextDue: ["next_due", "renewal_date", "expires_at", "paid_till"],
      loginUrl: ["login_url", "manage_url", "panel_url", "sso_url", "url"],
      description: ["description"],
    });

    this.schema.registerFieldMap("invoice", {
      id: ["id", "invoice_id", "invoiceId"],
      status: ["status"],
      total: ["total", "price", "amount"],
      currency: ["currency", "currency_code", "currencyCode"],
      dueAt: ["due_at", "due_date", "due_date_utc"],
      paymentUrl: ["pay_url", "payment_url", "url", "link"],
      createdAt: ["created_at", "created_date"],
      description: ["description"],
    });

    this.schema.registerFieldMap("ticket", {
      id: ["id", "ticket_id", "ticketId"],
      subject: ["subject", "title"],
      status: ["status"],
      updatedAt: ["updated_at", "updated_at_utc", "updated", "created_at"],
      priority: ["priority"],
      lastReplyAt: ["last_reply_at", "reply_date"],
    });

    this.schema.registerFieldMap("domain", {
      id: ["id", "domain_id"],
      name: ["name", "domain"],
      status: ["status"],
      registrar: ["registrar"],
      expiresAt: ["expires_at", "expiration_date"],
      registrationDate: ["registration_date", "created_at"],
    });

    this.schema.registerFieldMap("addon", {
      id: ["id", "addon_id"],
      title: ["title", "name"],
      status: ["status"],
      relatedOrderId: ["order_id", "related_order_id"],
      price: ["price", "amount"],
    });
  }

  _endpoint(scope, method) {
    return `${this.baseUrl}/api/${scope}/${method}`;
  }

  _withAdminAuth(payload = {}) {
    return {
      ...payload,
      api_key: this.apiKey,
      api_token: this.apiKey,
      token: this.apiKey,
    };
  }

  _buildClientRequest(payload = {}, auth = null) {
    const mergedPayload = { ...payload };
    const headers = {};

    if (!auth || typeof auth !== "object") {
      return { payload: mergedPayload, headers };
    }

    if (auth.token) {
      mergedPayload.token = auth.token;
      mergedPayload.api_token = auth.token;
      mergedPayload.client_token = auth.token;
    }
    if (auth.apiToken) {
      mergedPayload.api_token = auth.apiToken;
      mergedPayload.token = auth.apiToken;
    }
    if (auth.sid) {
      mergedPayload.sid = auth.sid;
      mergedPayload.session_id = auth.sid;
    }
    if (auth.sessionId) {
      mergedPayload.session_id = auth.sessionId;
    }
    if (auth.cookie) {
      headers.Cookie = String(auth.cookie);
    }
    if (auth.clientApiKey) {
      headers.Authorization = buildBasicAuthHeader("client", String(auth.clientApiKey));
    }

    return { payload: mergedPayload, headers };
  }

  async _call(scope, method, payload = {}, options = {}) {
    const endpoint = this._endpoint(scope, method);
    const requestHeaders = options.headers || {};

    const jsonResponse = await postJson(endpoint, payload, {
      headers: requestHeaders,
    });
    if (jsonResponse.statusCode >= 500) {
      throw new Error(
        `FOSSBilling ${scope}/${method} failed with HTTP ${jsonResponse.statusCode}`,
      );
    }

    const jsonBody = jsonResponse.data;
    const isJsonLike =
      jsonBody && typeof jsonBody === "object" && !Array.isArray(jsonBody);
    if (jsonResponse.statusCode < 400 && isJsonLike) {
      const result = unwrapApiResult(jsonBody);
      if (options.rawResponse) {
        return { result, response: jsonResponse };
      }
      return result;
    }

    const formResponse = await postForm(endpoint, payload, {
      headers: requestHeaders,
    });
    if (formResponse.statusCode >= 400) {
      throw new Error(
        `FOSSBilling ${scope}/${method} failed with HTTP ${formResponse.statusCode}: ${formResponse.rawBody.slice(
          0,
          300,
        )}`,
      );
    }

    const result = unwrapApiResult(formResponse.data);
    if (options.rawResponse) {
      return { result, response: formResponse };
    }
    return result;
  }

  async callGuest(method, payload = {}) {
    return this._call("guest", method, payload);
  }

  async callClient(method, payload = {}, auth = null) {
    const request = this._buildClientRequest(payload, auth);
    return this._call("client", method, request.payload, {
      headers: request.headers,
    });
  }

  async callAdmin(method, payload = {}) {
    return this._call("admin", method, this._withAdminAuth(payload), {
      headers: {
        Authorization: buildBasicAuthHeader("admin", this.apiKey),
      },
    });
  }

  async _callClientWithFallback(methodKey, payloads, auth) {
    const methodList = this.schema.tryMethods("client", methodKey);
    const payloadList =
      Array.isArray(payloads) && payloads.length > 0 ? payloads : [{}];

    let lastError = null;
    for (const method of methodList) {
      for (const payload of payloadList) {
        try {
          return await this.callClient(method, payload, auth);
        } catch (error) {
          if (isAuthenticationFailureError(error)) {
            throw error;
          }
          lastError = error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    return null;
  }

  async _callAdminWithFallback(methodKey, payloads) {
    const methodList = this.schema.tryMethods("admin", methodKey);
    const payloadList =
      Array.isArray(payloads) && payloads.length > 0 ? payloads : [{}];

    let lastError = null;
    for (const method of methodList) {
      for (const payload of payloadList) {
        try {
          return await this.callAdmin(method, payload);
        } catch (error) {
          lastError = error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    return null;
  }

  _extractAuthFromObject(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    if (typeof value.token === "string" && value.token) {
      return { token: value.token };
    }
    if (typeof value.api_token === "string" && value.api_token) {
      return { token: value.api_token, apiToken: value.api_token };
    }
    if (typeof value.client_token === "string" && value.client_token) {
      return { token: value.client_token };
    }
    if (typeof value.sid === "string" && value.sid) {
      return { sid: value.sid };
    }
    if (typeof value.session_id === "string" && value.session_id) {
      return { sessionId: value.session_id };
    }

    return null;
  }

  _extractAuth(loginResult) {
    if (typeof loginResult === "string") {
      return { token: loginResult };
    }

    if (typeof loginResult === "boolean") {
      if (loginResult === false) {
        throw new Error("Invalid billing credentials.");
      }
      return null;
    }

    if (typeof loginResult === "number") {
      if (loginResult <= 0) {
        throw new Error("Invalid billing credentials.");
      }
      return null;
    }

    if (!loginResult || typeof loginResult !== "object") {
      return null;
    }

    return (
      this._extractAuthFromObject(loginResult) ||
      this._extractAuthFromObject(loginResult.result) ||
      this._extractAuthFromObject(loginResult.data) ||
      null
    );
  }

  _extractProfileFromValue(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const id = value.id || value.client_id || value.clientId || null;
    const email = value.email || null;

    if (!id && !email) {
      return null;
    }

    return {
      ...value,
      id: id ? String(id) : undefined,
      email: email ? String(email) : undefined,
    };
  }

  _extractProfileFromLoginResult(loginResult) {
    return (
      this._extractProfileFromValue(loginResult) ||
      this._extractProfileFromValue(loginResult?.result) ||
      this._extractProfileFromValue(loginResult?.data) ||
      null
    );
  }

  async loginByClientApiKey(email, clientApiKey) {
    const auth = { clientApiKey: String(clientApiKey || "").trim() };
    if (!auth.clientApiKey) {
      return null;
    }

    try {
      const profile = await this.getClientProfile(auth);
      const profileEmail = String(profile?.email || "").trim().toLowerCase();
      const requestedEmail = String(email || "").trim().toLowerCase();
      if (requestedEmail && profileEmail && requestedEmail !== profileEmail) {
        throw new Error("The provided client API key does not match the given email.");
      }
      return { auth, profile };
    } catch (_error) {
      return null;
    }
  }

  _extractCookieHeader(headers = {}) {
    const setCookie = headers["set-cookie"];
    if (!setCookie) {
      return "";
    }

    const list = Array.isArray(setCookie) ? setCookie : [setCookie];
    return list
      .map((item) => String(item).split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
  }

  _pickClientByEmail(items, email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      return items[0] || null;
    }

    const exact = items.find(
      (item) => String(item?.email || "").trim().toLowerCase() === normalizedEmail,
    );
    return exact || items[0] || null;
  }

  async findClientByEmail(email) {
    const normalized = String(email || "").trim();
    if (!normalized) {
      return null;
    }

    const attempts = [
      { search: normalized, page: 1, per_page: 100 },
      { email: normalized, page: 1, per_page: 100 },
      { query: normalized, page: 1, per_page: 100 },
    ];

    for (const payload of attempts) {
      try {
        const result = await this.callAdmin("client/get_list", payload);
        const items = toArray(result);
        const picked = this._pickClientByEmail(items, normalized);
        if (picked) {
          return picked;
        }
      } catch (_error) {
        // Try next payload shape.
      }
    }

    return null;
  }

  async loginClient(email, passwordOrApiKey) {
    const directKeyLogin = await this.loginByClientApiKey(email, passwordOrApiKey);
    if (directKeyLogin) {
      return directKeyLogin;
    }

    const loginResponse = await this._call(
      "guest",
      "client/login",
      { email, password: passwordOrApiKey },
      { rawResponse: true },
    );
    const result = loginResponse.result;
    const auth = this._extractAuth(result);
    const cookie = this._extractCookieHeader(loginResponse.response?.headers || {});

    const resolvedAuth =
      auth && typeof auth === "object"
        ? {
            ...auth,
            ...(cookie ? { cookie } : {}),
          }
        : cookie
          ? { cookie }
          : null;

    let profile = this._extractProfileFromLoginResult(result);

    if (!profile && resolvedAuth) {
      try {
        profile = await this.getClientProfile(resolvedAuth);
      } catch (_error) {
        profile = null;
      }
    }

    if (!profile) {
      profile = await this.findClientByEmail(email);
    }

    if (!profile) {
      profile = { email: String(email || "") };
    }

    return { auth: resolvedAuth, profile };
  }

  async getClientProfile(auth) {
    const profileMethods = [
      "profile/get",
      "client/get",
    ];
    const errors = [];

    for (const method of profileMethods) {
      try {
        return await this.callClient(method, {}, auth);
      } catch (error) {
        errors.push(error);
        if (isAuthenticationFailureError(error)) {
          throw error;
        }
      }
    }

    if (errors.length > 0) {
      throw errors[errors.length - 1];
    }
    throw new Error("Unable to load client profile.");
  }

  /**
   * Extract field value using schema-driven field map fallbacks
   */
  _extractField(item, fieldKey, entityType = "service") {
    const fieldMap = this.schema.getFieldMap(entityType);
    const possibleKeys = fieldMap[fieldKey] || [fieldKey];

    for (const key of possibleKeys) {
      if (key in item && item[key] != null) {
        return item[key];
      }
    }
    return null;
  }

  /**
   * Normalize item using schema field maps
   */
  _normalizeItem(item, entityType, defaultTitle = "Item") {
    if (!item || typeof item !== "object") {
      return null;
    }

    const fieldMap = this.schema.getFieldMap(entityType);
    const normalized = {};

    Object.keys(fieldMap).forEach((key) => {
      const value = this._extractField(item, key, entityType);
      if (value != null) {
        normalized[key] = value;
      }
    });

    // Ensure ID exists
    if (!normalized.id) {
      normalized.id = this._extractField(item, "id", entityType);
    }

    return normalized;
  }

  // ============ ACCOUNT ============

  async getAccountSummary({ auth, clientId, email }) {
    let profile = null;
    let clientError = null;

    try {
      profile = await this.getClientProfile(auth);
    } catch (error) {
      clientError = error;
    }

    if (!profile && clientId) {
      const id = String(clientId);
      const payloads = [
        { id },
        { client_id: id },
      ];
      try {
        profile = await this._callAdminWithFallback("client/get_list", payloads);
        if (Array.isArray(profile)) {
          profile = profile[0] || null;
        }
      } catch (_error) {
        // Continue to email fallback.
      }
    }

    if (!profile && email) {
      profile = await this.findClientByEmail(email);
    }

    if (!profile) {
      if (clientError) {
        throw clientError;
      }
      return null;
    }

    return this._normalizeAccount(profile);
  }

  _normalizeAccount(profile) {
    const normalized = this._normalizeItem(profile, "account", "Account");
    if (!normalized) return null;

    const firstName = safeText(normalized.firstName || "");
    const lastName = safeText(normalized.lastName || "");
    const fullName = normalized.fullName || safeText(`${firstName} ${lastName}`.trim());

    return {
      id: safeText(normalized.id || ""),
      email: safeText(normalized.email || ""),
      fullName,
      status: safeText(normalized.status || "unknown"),
      balance: safeText(normalized.balance || "0"),
      currency: safeText(normalized.currency || ""),
      group: safeText(normalized.group || ""),
    };
  }

  // ============ SERVICES ============

  async getServices({ auth, clientId, email }) {
    let clientError = null;
    try {
      const result = await this._callClientWithFallback(
        "order/get_list",
        [{ page: 1, per_page: 100 }],
        auth,
      );
      const services = this._normalizeServices(toArray(result));
      if (services.length > 0) {
        return services;
      }
    } catch (error) {
      clientError = error;
    }

    let resolvedClientId = clientId ? String(clientId) : "";
    if (!resolvedClientId && email) {
      const client = await this.findClientByEmail(email);
      if (client?.id) {
        resolvedClientId = String(client.id);
      }
    }

    const adminPayload = { page: 1, per_page: 100 };
    if (resolvedClientId) {
      adminPayload.client_id = resolvedClientId;
    } else if (email) {
      adminPayload.search = email;
    }

    try {
      const adminResult = await this._callAdminWithFallback(
        "order/get_list",
        [adminPayload],
      );
      return this._normalizeServices(toArray(adminResult));
    } catch (adminError) {
      if (clientError && isAuthenticationFailureError(adminError)) {
        throw clientError;
      }
      throw adminError;
    }
  }

  _normalizeServices(items) {
    return items
      .map((item) => this._normalizeItem(item, "service", "Service"))
      .filter(Boolean)
      .map((normalized) => ({
        orderId: safeText(normalized.id, ""),
        title: safeText(normalized.title, "Service"),
        status: safeText(normalized.status, "unknown"),
        nextDue: normalized.nextDue || null,
        loginUrl: normalized.loginUrl || null,
        description: safeText(normalized.description, ""),
      }));
  }

  // ============ INVOICES ============

  async createRenewalInvoice({ auth, clientId, orderId }) {
    const payload = {
      order_id: orderId,
      orderId,
      id: orderId,
    };

    let clientError = null;
    try {
      const result = await this._callClientWithFallback(
        "invoice/renewal_invoice",
        [payload],
        auth,
      );
      return this._normalizeRenewalResult(result);
    } catch (error) {
      clientError = error;
      const adminPayload = this._withAdminAuth({
        ...payload,
        client_id: clientId || undefined,
      });
      try {
        const result = await this._call("admin", "invoice/renewal_invoice", adminPayload);
        return this._normalizeRenewalResult(result);
      } catch (adminError) {
        if (clientError && isAuthenticationFailureError(adminError)) {
          throw clientError;
        }
        throw adminError;
      }
    }
  }

  _normalizeRenewalResult(result) {
    if (typeof result === "string" || typeof result === "number") {
      return { invoiceId: String(result) };
    }

    if (!result || typeof result !== "object") {
      throw new Error("Billing API did not return an invoice id.");
    }

    const invoiceId =
      result.invoice_id || result.id || result.invoiceId || result.invoice;
    if (!invoiceId) {
      throw new Error("Billing API did not include invoice details.");
    }

    return {
      invoiceId: String(invoiceId),
      paymentUrl:
        result.payment_url || result.pay_url || result.url || result.link || null,
    };
  }

  async getInvoicePaymentLink({ auth, invoiceId }) {
    try {
      const result = await this.callGuest("invoice/payment", {
        invoice_id: invoiceId,
        id: invoiceId,
      });
      if (result && typeof result === "object") {
        if (typeof result.url === "string" && result.url) {
          return result.url;
        }
        if (typeof result.link === "string" && result.link) {
          return result.link;
        }
        if (typeof result.payment_url === "string" && result.payment_url) {
          return result.payment_url;
        }
      }
    } catch (_error) {
      // Fall back to built URL.
    }

    if (auth && auth.token) {
      return `${this.baseUrl}/invoice/${invoiceId}?token=${encodeURIComponent(
        auth.token,
      )}`;
    }

    return `${this.baseUrl}/invoice/${invoiceId}`;
  }

  async getInvoices({ auth, clientId, email }) {
    const basePayload = { page: 1, per_page: 20 };
    let clientError = null;

    try {
      const clientResult = await this._callClientWithFallback(
        "invoice/get_list",
        [basePayload],
        auth,
      );
      const invoices = this._normalizeInvoices(toArray(clientResult));
      return invoices;
    } catch (error) {
      clientError = error;
      if (
        !isAuthenticationFailureError(error) &&
        !isMethodNotFoundError(error)
      ) {
        throw error;
      }
    }

    let resolvedClientId = clientId ? String(clientId) : "";
    if (!resolvedClientId && email) {
      const client = await this.findClientByEmail(email);
      if (client?.id) {
        resolvedClientId = String(client.id);
      }
    }

    const adminPayload = { page: 1, per_page: 20 };
    if (resolvedClientId) {
      adminPayload.client_id = resolvedClientId;
    } else if (email) {
      adminPayload.search = email;
    }

    try {
      const adminResult = await this._callAdminWithFallback(
        "invoice/get_list",
        [adminPayload],
      );
      return this._normalizeInvoices(toArray(adminResult));
    } catch (adminError) {
      if (clientError && isAuthenticationFailureError(adminError)) {
        throw clientError;
      }
      throw adminError;
    }
  }

  _normalizeInvoices(items) {
    return items
      .map((item) => this._normalizeItem(item, "invoice", "Invoice"))
      .filter(Boolean)
      .map((normalized) => ({
        invoiceId: safeText(normalized.id, ""),
        status: safeText(normalized.status, "unknown"),
        total: safeText(normalized.total, "0"),
        currency: safeText(normalized.currency, ""),
        dueAt: normalized.dueAt || null,
        paymentUrl: normalized.paymentUrl || null,
        createdAt: normalized.createdAt || null,
        description: safeText(normalized.description, ""),
      }));
  }

  // ============ TICKETS ============

  async getTickets({ auth, clientId, email }) {
    const payloads = [
      { page: 1, per_page: 20 },
      { per_page: 20 },
    ];

    let clientError = null;
    try {
      const clientResult = await this._callClientWithFallback(
        "support/ticket_get_list",
        payloads,
        auth,
      );
      return this._normalizeTickets(toArray(clientResult));
    } catch (error) {
      clientError = error;
      if (
        !isAuthenticationFailureError(error) &&
        !isMethodNotFoundError(error)
      ) {
        throw error;
      }
    }

    let resolvedClientId = clientId ? String(clientId) : "";
    if (!resolvedClientId && email) {
      const client = await this.findClientByEmail(email);
      if (client?.id) {
        resolvedClientId = String(client.id);
      }
    }

    const adminPayload = { page: 1, per_page: 20 };
    if (resolvedClientId) {
      adminPayload.client_id = resolvedClientId;
    } else if (email) {
      adminPayload.search = email;
    }

    try {
      const adminResult = await this._callAdminWithFallback(
        "support/ticket_get_list",
        [adminPayload],
      );
      return this._normalizeTickets(toArray(adminResult));
    } catch (adminError) {
      if (clientError && isAuthenticationFailureError(adminError)) {
        throw clientError;
      }
      throw adminError;
    }
  }

  _normalizeTickets(items) {
    return items
      .map((item) => this._normalizeItem(item, "ticket", "Ticket"))
      .filter(Boolean)
      .map((normalized) => ({
        ticketId: safeText(normalized.id, ""),
        subject: safeText(normalized.subject, "Ticket"),
        status: safeText(normalized.status, "unknown"),
        updatedAt: normalized.updatedAt || null,
        priority: safeText(normalized.priority, "normal"),
      }));
  }

  // ============ DOMAINS ============

  async getDomains({ auth, clientId, email }) {
    let clientError = null;

    try {
      const result = await this._callClientWithFallback(
        "domain/get_list",
        [{ page: 1, per_page: 20 }],
        auth,
      );
      const domains = this._normalizeDomains(toArray(result));
      if (domains.length > 0) {
        return domains;
      }
    } catch (error) {
      clientError = error;
      if (
        !isAuthenticationFailureError(error) &&
        !isMethodNotFoundError(error)
      ) {
        throw error;
      }
    }

    let resolvedClientId = clientId ? String(clientId) : "";
    if (!resolvedClientId && email) {
      const client = await this.findClientByEmail(email);
      if (client?.id) {
        resolvedClientId = String(client.id);
      }
    }

    const adminPayload = { page: 1, per_page: 20 };
    if (resolvedClientId) {
      adminPayload.client_id = resolvedClientId;
    } else if (email) {
      adminPayload.search = email;
    }

    try {
      const adminResult = await this._callAdminWithFallback(
        "domain/get_list",
        [adminPayload],
      );
      return this._normalizeDomains(toArray(adminResult));
    } catch (adminError) {
      if (clientError && isAuthenticationFailureError(adminError)) {
        throw clientError;
      }
      // Gracefully fail if domains not supported
      return [];
    }
  }

  _normalizeDomains(items) {
    return items
      .map((item) => this._normalizeItem(item, "domain", "Domain"))
      .filter(Boolean)
      .map((normalized) => ({
        domainId: safeText(normalized.id, ""),
        name: safeText(normalized.name, "Domain"),
        status: safeText(normalized.status, "unknown"),
        registrar: safeText(normalized.registrar, ""),
        expiresAt: normalized.expiresAt || null,
        registrationDate: normalized.registrationDate || null,
      }));
  }

  // ============ ADDONS ============

  async getAddons({ auth, clientId, email }) {
    let clientError = null;

    try {
      const result = await this._callClientWithFallback(
        "addon/get_list",
        [{ page: 1, per_page: 20 }],
        auth,
      );
      const addons = this._normalizeAddons(toArray(result));
      if (addons.length > 0) {
        return addons;
      }
    } catch (error) {
      clientError = error;
      if (
        !isAuthenticationFailureError(error) &&
        !isMethodNotFoundError(error)
      ) {
        throw error;
      }
    }

    let resolvedClientId = clientId ? String(clientId) : "";
    if (!resolvedClientId && email) {
      const client = await this.findClientByEmail(email);
      if (client?.id) {
        resolvedClientId = String(client.id);
      }
    }

    const adminPayload = { page: 1, per_page: 20 };
    if (resolvedClientId) {
      adminPayload.client_id = resolvedClientId;
    } else if (email) {
      adminPayload.search = email;
    }

    try {
      const adminResult = await this._callAdminWithFallback(
        "addon/get_list",
        [adminPayload],
      );
      return this._normalizeAddons(toArray(adminResult));
    } catch (adminError) {
      if (clientError && isAuthenticationFailureError(adminError)) {
        throw clientError;
      }
      // Gracefully fail if addons not supported
      return [];
    }
  }

  _normalizeAddons(items) {
    return items
      .map((item) => this._normalizeItem(item, "addon", "Addon"))
      .filter(Boolean)
      .map((normalized) => ({
        addonId: safeText(normalized.id, ""),
        title: safeText(normalized.title, "Addon"),
        status: safeText(normalized.status, "unknown"),
        relatedOrderId: safeText(normalized.relatedOrderId, ""),
        price: safeText(normalized.price, "0"),
      }));
  }
}

module.exports = {
  FossBillingClient,
};

},
"src/translations.js": function(module, exports, __require, __filename, __dirname, require) {
const STRINGS = {
  welcome_unlinked: {
    en: "Welcome to MehrNet Hosting Bot.\n\nConnect your billing account to get started.",
    fa: "به ربات میزبانی مهرنت خوش آمدید.\n\nبرای شروع، حساب صورتحساب خود را متصل کنید.",
  },
  welcome_linked: {
    en: "Your billing account is linked.\n\nUse the keyboard buttons to manage your services.",
    fa: "حساب صورتحساب شما متصل است.\n\nبا دکمه‌های کیبورد سرویس‌های خود را مدیریت کنید.",
  },
  help: {
    en: [
      "Use keyboard buttons to navigate the bot.",
      "",
      "Main actions:",
      "Connect Account / Relink Account",
      "Services",
      "Invoices",
      "Tickets",
      "Account",
      "Settings",
      "Help",
      "Unlink Account",
    ].join("\n"),
    fa: [
      "برای کار با ربات از دکمه‌های کیبورد استفاده کنید.",
      "",
      "عملیات اصلی:",
      "اتصال حساب / اتصال مجدد حساب",
      "سرویس‌ها",
      "فاکتورها",
      "تیکت‌ها",
      "حساب کاربری",
      "تنظیمات",
      "راهنما",
      "حذف اتصال حساب",
    ].join("\n"),
  },
  private_only: {
    en: "Please use this command in a private chat with the bot.",
    fa: "لطفا این دستور را در گفتگوی خصوصی با ربات استفاده کنید.",
  },
  link_usage: {
    en: "Usage: /link <email> <password>",
    fa: "روش استفاده: /link <email> <password>",
  },
  link_enter_email: {
    en: "Please enter your billing account email.\nTap Cancel to stop.",
    fa: "ایمیل حساب صورتحساب خود را وارد کنید.\nبرای لغو دکمه لغو را بزنید.",
  },
  link_email_invalid: {
    en: "This email looks invalid. Please enter a valid email.",
    fa: "ایمیل معتبر نیست. لطفا یک ایمیل صحیح وارد کنید.",
  },
  link_enter_password: {
    en: "Now enter your account password.",
    fa: "حالا رمز حساب خود را وارد کنید.",
  },
  link_waiting_password: {
    en: "Waiting for your password. Tap Cancel to stop.",
    fa: "منتظر رمز شما هستم. برای لغو دکمه لغو را بزنید.",
  },
  link_running: {
    en: "Checking your credentials. Please wait...",
    fa: "در حال بررسی اطلاعات ورود. لطفا صبر کنید...",
  },
  link_success: {
    en: "Logged in successfully.\nEmail: {email}",
    fa: "ورود با موفقیت انجام شد.\nایمیل: {email}",
  },
  link_failed: {
    en: "Could not link account: {reason}",
    fa: "اتصال حساب انجام نشد: {reason}",
  },
  reauth_running: {
    en: "Refreshing your billing session. Please wait...",
    fa: "در حال بروزرسانی نشست صورتحساب شما. لطفا صبر کنید...",
  },
  reauth_failed: {
    en: "Re-authentication failed: {reason}",
    fa: "احراز هویت مجدد ناموفق بود: {reason}",
  },
  session_expired_enter_password: {
    en: "Your billing session expired. Please enter your account password to continue.",
    fa: "نشست صورتحساب شما منقضی شده است. برای ادامه، رمز حساب خود را وارد کنید.",
  },
  session_waiting_password: {
    en: "Waiting for your password to continue. Tap Cancel to stop.",
    fa: "برای ادامه منتظر رمز شما هستم. برای لغو دکمه لغو را بزنید.",
  },
  session_refresh_continue: {
    en: "Session refreshed. Continuing your request...",
    fa: "نشست بروزرسانی شد. در حال ادامه درخواست شما...",
  },
  session_cancelled: {
    en: "Request cancelled.",
    fa: "درخواست لغو شد.",
  },
  unlink_success: {
    en: "Billing account link removed.",
    fa: "اتصال حساب صورتحساب حذف شد.",
  },
  not_linked: {
    en: "No billing account is linked yet. Use the Connect Account button first.",
    fa: "هنوز حسابی متصل نشده است. ابتدا از دکمه اتصال حساب استفاده کنید.",
  },
  settings_title: {
    en: "Settings:",
    fa: "تنظیمات:",
  },
  language_prompt: {
    en: "Choose language:",
    fa: "زبان را انتخاب کنید:",
  },
  language_saved: {
    en: "Language updated to English.",
    fa: "زبان به فارسی تغییر کرد.",
  },
  timezone_prompt: {
    en: "Choose your timezone:",
    fa: "منطقه زمانی خود را انتخاب کنید:",
  },
  timezone_usage: {
    en: "Usage: /timezone <IANA zone>\nExample: /timezone Asia/Tehran",
    fa: "روش استفاده: /timezone <IANA zone>\nمثال: /timezone Asia/Tehran",
  },
  timezone_saved: {
    en: "Timezone updated to {timezone}.",
    fa: "منطقه زمانی به {timezone} تغییر کرد.",
  },
  timezone_invalid: {
    en: "Invalid timezone. Use a valid IANA zone like Asia/Tehran.",
    fa: "منطقه زمانی معتبر نیست. از IANA معتبر مانند Asia/Tehran استفاده کنید.",
  },
  services_loading: {
    en: "Fetching your services...",
    fa: "در حال دریافت سرویس‌های شما...",
  },
  services_empty: {
    en: "No services found for your account.",
    fa: "سرویسی برای حساب شما پیدا نشد.",
  },
  services_header: {
    en: "Your services ({count}):",
    fa: "سرویس‌های شما ({count}):",
  },
  services_line: {
    en: "{index}. #{orderId} | {title}\nStatus: {status}\nNext due: {nextDue}",
    fa: "{index}. #{orderId} | {title}\nوضعیت: {status}\nسررسید بعدی: {nextDue}",
  },
  services_login_link: {
    en: "Login URL: {url}",
    fa: "لینک ورود: {url}",
  },
  services_due_unknown: {
    en: "Unknown",
    fa: "نامشخص",
  },
  invoices_loading: {
    en: "Fetching your invoices...",
    fa: "در حال دریافت فاکتورهای شما...",
  },
  invoices_empty: {
    en: "No invoices found for your account.",
    fa: "فاکتوری برای حساب شما پیدا نشد.",
  },
  invoices_header: {
    en: "Your invoices ({count}):",
    fa: "فاکتورهای شما ({count}):",
  },
  invoices_line: {
    en: "{index}. #{invoiceId}\nStatus: {status}\nTotal: {total}\nDue: {dueAt}",
    fa: "{index}. #{invoiceId}\nوضعیت: {status}\nمبلغ: {total}\nسررسید: {dueAt}",
  },
  invoices_due_unknown: {
    en: "Unknown",
    fa: "نامشخص",
  },
  tickets_loading: {
    en: "Fetching your tickets...",
    fa: "در حال دریافت تیکت‌های شما...",
  },
  tickets_empty: {
    en: "No tickets found for your account.",
    fa: "تیکتی برای حساب شما پیدا نشد.",
  },
  tickets_header: {
    en: "Your tickets ({count}):",
    fa: "تیکت‌های شما ({count}):",
  },
  tickets_line: {
    en: "{index}. #{ticketId} | {subject}\nStatus: {status}\nUpdated: {updatedAt}",
    fa: "{index}. #{ticketId} | {subject}\nوضعیت: {status}\nآخرین بروزرسانی: {updatedAt}",
  },
  tickets_updated_unknown: {
    en: "Unknown",
    fa: "نامشخص",
  },
  account_loading: {
    en: "Fetching your account details...",
    fa: "در حال دریافت اطلاعات حساب شما...",
  },
  account_unavailable: {
    en: "Account details are not available right now.",
    fa: "اطلاعات حساب در حال حاضر در دسترس نیست.",
  },
  account_summary: {
    en: [
      "Account details:",
      "ID: {id}",
      "Name: {fullName}",
      "Email: {email}",
      "Status: {status}",
      "Group: {group}",
      "Balance: {balance}",
    ].join("\n"),
    fa: [
      "جزئیات حساب:",
      "شناسه: {id}",
      "نام: {fullName}",
      "ایمیل: {email}",
      "وضعیت: {status}",
      "گروه: {group}",
      "اعتبار: {balance}",
    ].join("\n"),
  },
  renew_usage: {
    en: "Usage: /renew <order_id>",
    fa: "روش استفاده: /renew <order_id>",
  },
  renew_running: {
    en: "Creating renewal invoice for order #{orderId}...",
    fa: "در حال ساخت فاکتور تمدید برای سفارش #{orderId}...",
  },
  renew_success: {
    en: "Renewal invoice created.\nInvoice: #{invoiceId}\nPay here: {url}",
    fa: "فاکتور تمدید ساخته شد.\nفاکتور: #{invoiceId}\nپرداخت: {url}",
  },
  renew_failed: {
    en: "Renewal failed: {reason}",
    fa: "تمدید انجام نشد: {reason}",
  },
  btn_services: {
    en: "Services",
    fa: "سرویس‌ها",
  },
  btn_invoices: {
    en: "Invoices",
    fa: "فاکتورها",
  },
  btn_tickets: {
    en: "Tickets",
    fa: "تیکت‌ها",
  },
  btn_account: {
    en: "Account",
    fa: "حساب کاربری",
  },
  btn_connect_account: {
    en: "Connect Account",
    fa: "اتصال حساب",
  },
  btn_relink_account: {
    en: "Relink Account",
    fa: "اتصال مجدد حساب",
  },
  btn_unlink_account: {
    en: "Unlink Account",
    fa: "حذف اتصال حساب",
  },
  btn_settings: {
    en: "Settings",
    fa: "تنظیمات",
  },
  btn_help: {
    en: "Help",
    fa: "راهنما",
  },
  btn_cancel: {
    en: "Cancel",
    fa: "لغو",
  },
  btn_back: {
    en: "Back",
    fa: "بازگشت",
  },
  btn_back_main: {
    en: "Back to Main Menu",
    fa: "بازگشت به منوی اصلی",
  },
  btn_home: {
    en: "Home",
    fa: "خانه",
  },
  btn_refresh: {
    en: "Refresh",
    fa: "بروزرسانی",
  },
  btn_language: {
    en: "Language",
    fa: "زبان",
  },
  btn_timezone: {
    en: "Timezone",
    fa: "منطقه زمانی",
  },
  btn_renew: {
    en: "Renew #{orderId}",
    fa: "تمدید #{orderId}",
  },
  btn_pay_now: {
    en: "Pay now",
    fa: "پرداخت",
  },
  btn_pay_invoice: {
    en: "Pay Invoice #{invoiceId}",
    fa: "پرداخت فاکتور #{invoiceId}",
  },
  callback_done: {
    en: "Done",
    fa: "انجام شد",
  },
  callback_failed: {
    en: "Request failed",
    fa: "درخواست ناموفق بود",
  },
  command_unknown: {
    en: "I didn't understand that. Use keyboard buttons.",
    fa: "متوجه نشدم. از دکمه‌های کیبورد استفاده کنید.",
  },
  generic_error: {
    en: "An error occurred. Please try again.",
    fa: "خطایی رخ داد. دوباره تلاش کنید.",
  },
};

function interpolate(template, variables = {}) {
  return template.replace(/\{([^}]+)\}/g, (match, key) => {
    if (variables[key] === undefined || variables[key] === null) {
      return match;
    }
    return String(variables[key]);
  });
}

function t(key, language = "en", variables = {}) {
  const entry = STRINGS[key];
  if (!entry) {
    return key;
  }

  const template = entry[language] || entry.en || key;
  return interpolate(template, variables);
}

module.exports = {
  t,
  STRINGS,
};

},
"src/bot.js": function(module, exports, __require, __filename, __dirname, require) {
const { t } = __require("src/translations.js");
const {
  SUPPORTED_LANGUAGES,
  TIMEZONE_PRESETS,
  normalizeLanguage,
  normalizeTimeZone,
  isValidTimeZone,
  formatDateTime,
  getTimezonePresetByKey,
} = __require("src/localization.js");

const STATE_AWAITING_LINK_EMAIL = "awaiting_link_email";
const STATE_AWAITING_LINK_PASSWORD = "awaiting_link_password";
const STATE_AWAITING_BILLING_PASSWORD = "awaiting_billing_password";

function parseCommand(text) {
  if (!text || !text.startsWith("/")) {
    return null;
  }

  const trimmed = text.trim();
  const [rawCommand, ...rest] = trimmed.split(/\s+/);
  const command = rawCommand.slice(1).split("@")[0].toLowerCase();
  const argsText = rest.join(" ").trim();

  return {
    command,
    argsText,
    argList: argsText ? argsText.split(/\s+/) : [],
  };
}

function getUserLanguage(user, defaultLanguage) {
  return normalizeLanguage(user?.language, normalizeLanguage(defaultLanguage, "en"));
}

function getUserTimeZone(user, defaultTimezone) {
  return normalizeTimeZone(user?.timezone, normalizeTimeZone(defaultTimezone, "UTC"));
}

function splitLinkArgs(argsText) {
  if (!argsText) {
    return null;
  }
  const firstSpaceIndex = argsText.indexOf(" ");
  if (firstSpaceIndex <= 0) {
    return null;
  }

  const email = argsText.slice(0, firstSpaceIndex).trim();
  const password = argsText.slice(firstSpaceIndex + 1).trim();
  if (!email || !password) {
    return null;
  }
  return { email, password };
}

function isLikelyEmail(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 254) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function isBillingSessionExpiredError(error) {
  const message = String(error?.message || error || "");
  const lower = message.toLowerCase();

  const clientScope =
    lower.includes("fossbilling client/") ||
    lower.includes("client/order/get_list") ||
    lower.includes("client/invoice/renewal_invoice");
  const authFailure =
    lower.includes("authentication failed") ||
    lower.includes("http 401") ||
    lower.includes("code\":206") ||
    lower.includes("code 206");

  return clientScope && authFailure;
}

function isPrivateChat(message) {
  return message?.chat?.type === "private";
}

function buildPendingAction(type, payload = {}) {
  return {
    type: String(type || ""),
    ...payload,
  };
}

function buildMainMenu(language, isLinked) {
  const rows = [];

  if (isLinked) {
    rows.push([
      { text: t("btn_services", language), callback_data: "menu:services" },
      { text: t("btn_invoices", language), callback_data: "menu:invoices" },
    ]);
    rows.push([
      { text: t("btn_tickets", language), callback_data: "menu:tickets" },
      { text: t("btn_account", language), callback_data: "menu:account" },
    ]);
    rows.push([
      { text: t("btn_relink_account", language), callback_data: "menu:link" },
      { text: t("btn_unlink_account", language), callback_data: "menu:unlink" },
    ]);
  } else {
    rows.push([{ text: t("btn_connect_account", language), callback_data: "menu:link" }]);
  }

  rows.push([
    { text: t("btn_settings", language), callback_data: "menu:settings" },
    { text: t("btn_help", language), callback_data: "menu:help" },
  ]);

  return {
    inline_keyboard: rows,
  };
}

function buildSectionSubmenuRows(language, section) {
  if (section === "services") {
    return [
      [{ text: t("btn_refresh", language), callback_data: "menu:services" }],
      [
        { text: t("btn_invoices", language), callback_data: "menu:invoices" },
        { text: t("btn_tickets", language), callback_data: "menu:tickets" },
      ],
      [{ text: t("btn_back_main", language), callback_data: "menu:home" }],
    ];
  }

  if (section === "invoices") {
    return [
      [{ text: t("btn_refresh", language), callback_data: "menu:invoices" }],
      [
        { text: t("btn_services", language), callback_data: "menu:services" },
        { text: t("btn_account", language), callback_data: "menu:account" },
      ],
      [{ text: t("btn_back_main", language), callback_data: "menu:home" }],
    ];
  }

  if (section === "tickets") {
    return [
      [{ text: t("btn_refresh", language), callback_data: "menu:tickets" }],
      [
        { text: t("btn_services", language), callback_data: "menu:services" },
        { text: t("btn_account", language), callback_data: "menu:account" },
      ],
      [{ text: t("btn_back_main", language), callback_data: "menu:home" }],
    ];
  }

  if (section === "account") {
    return [
      [{ text: t("btn_refresh", language), callback_data: "menu:account" }],
      [
        { text: t("btn_relink_account", language), callback_data: "menu:link" },
        { text: t("btn_unlink_account", language), callback_data: "menu:unlink" },
      ],
      [{ text: t("btn_settings", language), callback_data: "menu:settings" }],
      [{ text: t("btn_back_main", language), callback_data: "menu:home" }],
    ];
  }

  return [[{ text: t("btn_back_main", language), callback_data: "menu:home" }]];
}

function buildSectionKeyboard(language, section, primaryRows = []) {
  const rows = Array.isArray(primaryRows) ? [...primaryRows] : [];
  rows.push(...buildSectionSubmenuRows(language, section));
  return { inline_keyboard: rows };
}

function buildCancelKeyboard(language) {
  return {
    inline_keyboard: [[{ text: t("btn_cancel", language), callback_data: "state:cancel" }]],
  };
}

function isCancelInput(inputText) {
  const value = String(inputText || "").trim();
  if (!value) {
    return false;
  }
  return value.toLowerCase() === "/cancel";
}

function isNumericMessageId(value) {
  return Number.isInteger(value) && value > 0;
}

async function safeDeleteMessage(telegram, chatId, messageId) {
  if (!Number.isFinite(chatId) || !isNumericMessageId(messageId)) {
    return;
  }
  try {
    await telegram.deleteMessage(chatId, messageId);
  } catch (_error) {
    // Ignore cleanup delete errors to keep flow responsive.
  }
}

async function sendTrackedMessage({
  db,
  telegram,
  telegramUserId,
  chatId,
  text,
  options = {},
}) {
  const result = await telegram.sendMessage(chatId, text, options);
  const messageId = Number(result?.message_id);
  if (isNumericMessageId(messageId)) {
    await db.setLatestBotMessage(telegramUserId, chatId, messageId);
  }
  return result;
}

async function editTrackedMessage({
  db,
  telegram,
  telegramUserId,
  chatId,
  messageId,
  text,
  options = {},
}) {
  if (!Number.isFinite(chatId) || !isNumericMessageId(messageId)) {
    throw new Error("Missing chat/message id for edit.");
  }

  const result = await telegram.editMessageText(chatId, messageId, text, options);
  await db.setLatestBotMessage(telegramUserId, chatId, messageId);
  return result;
}

async function cleanupIncomingUserMessage({ user, message, db, telegram }) {
  const chatId = Number(message?.chat?.id);
  const userId = Number(message?.from?.id);
  const incomingMessageId = Number(message?.message_id);
  const lastBotChatId = Number(user?.ui?.lastBotChatId);
  const lastBotMessageId = Number(user?.ui?.lastBotMessageId);

  const deletions = [];
  if (Number.isFinite(chatId) && isNumericMessageId(incomingMessageId)) {
    deletions.push(safeDeleteMessage(telegram, chatId, incomingMessageId));
  }
  if (
    Number.isFinite(lastBotChatId) &&
    Number.isFinite(lastBotMessageId) &&
    isNumericMessageId(lastBotMessageId)
  ) {
    deletions.push(safeDeleteMessage(telegram, lastBotChatId, lastBotMessageId));
  }

  await Promise.allSettled([
    ...deletions,
    Number.isFinite(userId) ? db.clearLatestBotMessage(userId) : Promise.resolve(),
  ]);
}

function buildLanguageKeyboard(currentLanguage) {
  const options = SUPPORTED_LANGUAGES.map((language) => {
    const label = language === "fa" ? "فارسی" : "English";
    return [
      {
        text: language === currentLanguage ? `${label} ✓` : label,
        callback_data: `lang:${language}`,
      },
    ];
  });

  options.push([{ text: t("btn_back", currentLanguage), callback_data: "menu:settings" }]);
  return { inline_keyboard: options };
}

function buildTimezoneKeyboard(currentTimezone, language) {
  const rows = TIMEZONE_PRESETS.map((preset) => [
    {
      text:
        preset.id === currentTimezone ? `${preset.label} ✓` : preset.label,
      callback_data: `tzp:${preset.key}`,
    },
  ]);
  rows.push([{ text: t("btn_back", language), callback_data: "menu:settings" }]);
  return { inline_keyboard: rows };
}

function buildSettingsKeyboard(language, timezone) {
  return {
    inline_keyboard: [
      [{ text: t("btn_language", language), callback_data: "menu:language" }],
      [
        {
          text: `${t("btn_timezone", language)} (${timezone})`,
          callback_data: "menu:timezone",
        },
      ],
      [{ text: t("btn_back_main", language), callback_data: "menu:home" }],
    ],
  };
}

function normalizeServiceForMessage(service, index, userContext, language) {
  return t("services_line", language, {
    index: index + 1,
    orderId: service.orderId || "-",
    title: service.title || "Service",
    status: service.status || "-",
    nextDue: service.nextDue
      ? formatDateTime(service.nextDue, userContext)
      : t("services_due_unknown", language),
  });
}

function normalizeInvoiceForMessage(invoice, index, userContext, language) {
  const totalText = invoice.currency
    ? `${invoice.total || "0"} ${invoice.currency}`
    : String(invoice.total || "0");

  return t("invoices_line", language, {
    index: index + 1,
    invoiceId: invoice.invoiceId || "-",
    status: invoice.status || "-",
    total: totalText,
    dueAt: invoice.dueAt
      ? formatDateTime(invoice.dueAt, userContext)
      : t("invoices_due_unknown", language),
  });
}

function normalizeTicketForMessage(ticket, index, userContext, language) {
  return t("tickets_line", language, {
    index: index + 1,
    ticketId: ticket.ticketId || "-",
    subject: ticket.subject || "-",
    status: ticket.status || "-",
    updatedAt: ticket.updatedAt
      ? formatDateTime(ticket.updatedAt, userContext)
      : t("tickets_updated_unknown", language),
  });
}

function normalizeAccountForMessage(account, language) {
  const balanceText = account.currency
    ? `${account.balance || "0"} ${account.currency}`
    : String(account.balance || "0");

  return t("account_summary", language, {
    id: account.id || "-",
    fullName: account.fullName || "-",
    email: account.email || "-",
    status: account.status || "-",
    group: account.group || "-",
    balance: balanceText,
  });
}

async function sendMainMenu({
  db,
  telegram,
  chatId,
  telegramUserId,
  user,
  config,
  textOverride,
}) {
  const language = getUserLanguage(user, config.defaultLanguage);
  const welcomeKey = user?.billing ? "welcome_linked" : "welcome_unlinked";
  const text = textOverride || t(welcomeKey, language);
  await sendTrackedMessage({
    db,
    telegram,
    telegramUserId,
    chatId,
    text,
    options: {
      reply_markup: buildMainMenu(language, Boolean(user?.billing)),
    },
  });
}

async function sendHelp({ db, telegram, chatId, telegramUserId, user, config }) {
  const language = getUserLanguage(user, config.defaultLanguage);
  await sendTrackedMessage({
    db,
    telegram,
    telegramUserId,
    chatId,
    text: t("help", language),
    options: {
      reply_markup: buildMainMenu(language, Boolean(user?.billing)),
    },
  });
}

async function sendSettings({ db, telegram, chatId, telegramUserId, user, config }) {
  const language = getUserLanguage(user, config.defaultLanguage);
  const timezone = getUserTimeZone(user, config.defaultTimezone);

  await sendTrackedMessage({
    db,
    telegram,
    telegramUserId,
    chatId,
    text: t("settings_title", language),
    options: {
      reply_markup: buildSettingsKeyboard(language, timezone),
    },
  });
}

async function editCallbackMessageText({
  callbackQuery,
  db,
  telegram,
  telegramUserId,
  text,
  replyMarkup,
}) {
  const chatId = callbackQuery?.message?.chat?.id;
  const messageId = callbackQuery?.message?.message_id;

  if (chatId && Number.isFinite(messageId)) {
    try {
      await editTrackedMessage({
        db,
        telegram,
        telegramUserId,
        chatId,
        messageId,
        text,
        options: {
          reply_markup: replyMarkup,
        },
      });
      return;
    } catch (error) {
      const message = String(error?.message || error || "").toLowerCase();
      if (message.includes("message is not modified")) {
        await db.setLatestBotMessage(telegramUserId, chatId, messageId);
        return;
      }
    }
  }

  if (chatId) {
    await sendTrackedMessage({
      db,
      telegram,
      telegramUserId,
      chatId,
      text,
      options: {
        reply_markup: replyMarkup,
      },
    });
  }
}

async function sendOrEditView({
  db,
  telegram,
  telegramUserId,
  chatId,
  callbackQuery,
  text,
  replyMarkup,
}) {
  if (callbackQuery) {
    await editCallbackMessageText({
      callbackQuery,
      db,
      telegram,
      telegramUserId,
      text,
      replyMarkup,
    });
    return;
  }

  await sendTrackedMessage({
    db,
    telegram,
    telegramUserId,
    chatId,
    text,
    options: {
      reply_markup: replyMarkup,
    },
  });
}

async function startLinkFlow({
  telegramUserId,
  chatId,
  callbackQuery,
  db,
  telegram,
  config,
  reason = "link_started",
}) {
  const updatedUser = await db.setUserState(telegramUserId, {
    mode: STATE_AWAITING_LINK_EMAIL,
    reason,
    pendingAction: null,
    createdAt: Date.now(),
  });
  const language = getUserLanguage(updatedUser, config.defaultLanguage);
  await sendOrEditView({
    db,
    telegram,
    telegramUserId,
    chatId,
    callbackQuery,
    text: t("link_enter_email", language),
    replyMarkup: buildCancelKeyboard(language),
  });
}

async function completeLinkWithCredentials({
  telegramUserId,
  chatId,
  email,
  password,
  db,
  billing,
  telegram,
  config,
}) {
  const user = await db.getUser(telegramUserId);
  const language = getUserLanguage(user, config.defaultLanguage);
  const runningMessage = await sendTrackedMessage({
    db,
    telegram,
    telegramUserId,
    chatId,
    text: t("link_running", language),
  });
  const runningMessageId = Number(runningMessage?.message_id);

  try {
    const { auth, profile } = await billing.loginClient(email, password);
    const clientId = profile?.id || profile?.client_id || profile?.clientId || null;
    const resolvedEmail = profile?.email || email;
    const updatedUser = await db.linkBilling(telegramUserId, {
      email: resolvedEmail,
      clientId,
      auth,
    });

    const updatedLanguage = getUserLanguage(updatedUser, config.defaultLanguage);
    if (isNumericMessageId(runningMessageId)) {
      await editTrackedMessage({
        db,
        telegram,
        telegramUserId,
        chatId,
        messageId: runningMessageId,
        text: t("link_success", updatedLanguage, {
          email: resolvedEmail,
        }),
        options: {
          reply_markup: buildMainMenu(updatedLanguage, true),
        },
      });
    } else {
      await sendTrackedMessage({
        db,
        telegram,
        telegramUserId,
        chatId,
        text: t("link_success", updatedLanguage, {
          email: resolvedEmail,
        }),
        options: {
          reply_markup: buildMainMenu(updatedLanguage, true),
        },
      });
    }
    return true;
  } catch (error) {
    const failureText = t("link_failed", language, {
      reason: String(error.message || error),
    });
    if (isNumericMessageId(runningMessageId)) {
      await editTrackedMessage({
        db,
        telegram,
        telegramUserId,
        chatId,
        messageId: runningMessageId,
        text: failureText,
        options: {
          reply_markup: buildCancelKeyboard(language),
        },
      });
    } else {
      await sendTrackedMessage({
        db,
        telegram,
        telegramUserId,
        chatId,
        text: failureText,
        options: {
          reply_markup: buildCancelKeyboard(language),
        },
      });
    }
    return false;
  }
}

async function handleLinkEmailInput({
  email,
  chatId,
  telegramUserId,
  db,
  telegram,
  config,
}) {
  const user = await db.getUser(telegramUserId);
  const language = getUserLanguage(user, config.defaultLanguage);
  const normalizedEmail = String(email || "").trim();

  if (!isLikelyEmail(normalizedEmail)) {
    await sendTrackedMessage({
      db,
      telegram,
      telegramUserId,
      chatId,
      text: t("link_email_invalid", language),
      options: {
        reply_markup: buildCancelKeyboard(language),
      },
    });
    return;
  }

  await db.setUserState(telegramUserId, {
    mode: STATE_AWAITING_LINK_PASSWORD,
    reason: "link_password",
    pendingAction: buildPendingAction("link", { email: normalizedEmail }),
    createdAt: Date.now(),
  });

  await sendTrackedMessage({
    db,
    telegram,
    telegramUserId,
    chatId,
    text: t("link_enter_password", language),
    options: {
      reply_markup: buildCancelKeyboard(language),
    },
  });
}

async function handleLinkPasswordInput({
  user,
  password,
  chatId,
  telegramUserId,
  db,
  billing,
  telegram,
  config,
}) {
  const language = getUserLanguage(user, config.defaultLanguage);
  const pendingAction = user?.state?.pendingAction || null;
  const email = pendingAction?.type === "link" ? String(pendingAction.email || "") : "";

  if (!email) {
    await startLinkFlow({
      telegramUserId,
      chatId,
      db,
      telegram,
      config,
      reason: "missing_link_email",
    });
    return;
  }

  const ok = await completeLinkWithCredentials({
    telegramUserId,
    chatId,
    email,
    password,
    db,
    billing,
    telegram,
    config,
  });
  if (!ok) {
    await sendTrackedMessage({
      db,
      telegram,
      telegramUserId,
      chatId,
      text: t("link_waiting_password", language),
      options: {
        reply_markup: buildCancelKeyboard(language),
      },
    });
  }
}

async function handleLinkCommand({ parsed, message, db, billing, telegram, config }) {
  const user = await db.getUser(message.from.id);
  const language = getUserLanguage(user, config.defaultLanguage);

  if (!isPrivateChat(message)) {
    await sendTrackedMessage({
      db,
      telegram,
      telegramUserId: message.from.id,
      chatId: message.chat.id,
      text: t("private_only", language),
    });
    return;
  }

  const credentials = splitLinkArgs(parsed.argsText);
  if (!credentials) {
    await startLinkFlow({
      telegramUserId: message.from.id,
      chatId: message.chat.id,
      db,
      telegram,
      config,
      reason: "command_link_start",
    });
    return;
  }

  if (!isLikelyEmail(credentials.email)) {
    await sendTrackedMessage({
      db,
      telegram,
      telegramUserId: message.from.id,
      chatId: message.chat.id,
      text: t("link_email_invalid", language),
      options: {
        reply_markup: buildCancelKeyboard(language),
      },
    });
    return;
  }

  await db.setUserState(message.from.id, {
    mode: STATE_AWAITING_LINK_PASSWORD,
    reason: "command_link_password",
    pendingAction: buildPendingAction("link", { email: credentials.email }),
    createdAt: Date.now(),
  });

  const ok = await completeLinkWithCredentials({
    telegramUserId: message.from.id,
    chatId: message.chat.id,
    email: credentials.email,
    password: credentials.password,
    db,
    billing,
    telegram,
    config,
  });
  if (!ok) {
    await sendTrackedMessage({
      db,
      telegram,
      telegramUserId: message.from.id,
      chatId: message.chat.id,
      text: t("link_waiting_password", language),
      options: {
        reply_markup: buildCancelKeyboard(language),
      },
    });
  }
}

async function requestPasswordForContinuation({
  telegramUserId,
  chatId,
  language,
  pendingAction,
  callbackQuery,
  db,
  telegram,
}) {
  await db.setUserState(telegramUserId, {
    mode: STATE_AWAITING_BILLING_PASSWORD,
    reason: "session_expired",
    pendingAction,
    createdAt: Date.now(),
  });
  await sendOrEditView({
    db,
    telegram,
    telegramUserId,
    chatId,
    callbackQuery,
    text: t("session_expired_enter_password", language),
    replyMarkup: buildCancelKeyboard(language),
  });
}

async function continuePendingAction({
  pendingAction,
  telegramUserId,
  chatId,
  db,
  billing,
  telegram,
  config,
}) {
  if (!pendingAction || typeof pendingAction !== "object") {
    return;
  }

  if (pendingAction.type === "services") {
    await handleServicesCommand({
      message: {
        from: { id: telegramUserId },
        chat: { id: chatId, type: "private" },
      },
      db,
      billing,
      telegram,
      config,
    });
    return;
  }

  if (pendingAction.type === "invoices") {
    await handleInvoicesCommand({
      message: {
        from: { id: telegramUserId },
        chat: { id: chatId, type: "private" },
      },
      db,
      billing,
      telegram,
      config,
    });
    return;
  }

  if (pendingAction.type === "tickets") {
    await handleTicketsCommand({
      message: {
        from: { id: telegramUserId },
        chat: { id: chatId, type: "private" },
      },
      db,
      billing,
      telegram,
      config,
    });
    return;
  }

  if (pendingAction.type === "account") {
    await handleAccountCommand({
      message: {
        from: { id: telegramUserId },
        chat: { id: chatId, type: "private" },
      },
      db,
      billing,
      telegram,
      config,
    });
    return;
  }

  if (pendingAction.type === "renew" && pendingAction.orderId) {
    await handleRenewOrder({
      chatId,
      telegramUserId,
      orderId: String(pendingAction.orderId),
      db,
      billing,
      telegram,
      config,
    });
  }
}

async function handleServicesCommand({
  message,
  callbackQuery,
  db,
  billing,
  telegram,
  config,
}) {
  const telegramUserId = Number(callbackQuery?.from?.id || message?.from?.id);
  const chatId = Number(callbackQuery?.message?.chat?.id || message?.chat?.id);
  const user = await db.getUser(telegramUserId);
  const language = getUserLanguage(user, config.defaultLanguage);

  if (!user?.billing) {
    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: t("not_linked", language),
      replyMarkup: buildMainMenu(language, false),
    });
    return;
  }

  try {
    const services = await billing.getServices({
      auth: user.billing.auth,
      clientId: user.billing.clientId,
      email: user.billing.email,
    });

    if (!services.length) {
      await sendOrEditView({
        db,
        telegram,
        telegramUserId,
        chatId,
        callbackQuery,
        text: t("services_empty", language),
        replyMarkup: buildSectionKeyboard(language, "services"),
      });
      return;
    }

    const shown = services.slice(0, 15);
    const userContext = {
      language,
      timezone: getUserTimeZone(user, config.defaultTimezone),
    };
    const lines = [t("services_header", language, { count: shown.length })];
    const keyboardRows = [];

    shown.forEach((service, index) => {
      lines.push("");
      lines.push(normalizeServiceForMessage(service, index, userContext, language));
      if (service.loginUrl) {
        lines.push(t("services_login_link", language, { url: service.loginUrl }));
      }

      if (service.orderId) {
        keyboardRows.push([
          {
            text: t("btn_renew", language, { orderId: service.orderId }),
            callback_data: `renew:${service.orderId}`,
          },
        ]);
      }
    });

    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: lines.join("\n"),
      replyMarkup: buildSectionKeyboard(language, "services", keyboardRows),
    });
  } catch (error) {
    if (isBillingSessionExpiredError(error)) {
      await requestPasswordForContinuation({
        telegramUserId,
        chatId,
        language,
        pendingAction: buildPendingAction("services"),
        callbackQuery,
        db,
        telegram,
      });
      return;
    }

    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: t("generic_error", language),
      replyMarkup: buildSectionKeyboard(language, "services"),
    });
    console.error("[services] Failed:", error);
  }
}

async function handleInvoicesCommand({
  message,
  callbackQuery,
  db,
  billing,
  telegram,
  config,
}) {
  const telegramUserId = Number(callbackQuery?.from?.id || message?.from?.id);
  const chatId = Number(callbackQuery?.message?.chat?.id || message?.chat?.id);
  const user = await db.getUser(telegramUserId);
  const language = getUserLanguage(user, config.defaultLanguage);

  if (!user?.billing) {
    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: t("not_linked", language),
      replyMarkup: buildMainMenu(language, false),
    });
    return;
  }

  try {
    const invoices = await billing.getInvoices({
      auth: user.billing.auth,
      clientId: user.billing.clientId,
      email: user.billing.email,
    });

    if (!invoices.length) {
      await sendOrEditView({
        db,
        telegram,
        telegramUserId,
        chatId,
        callbackQuery,
        text: t("invoices_empty", language),
        replyMarkup: buildSectionKeyboard(language, "invoices"),
      });
      return;
    }

    const shown = invoices.slice(0, 15);
    const userContext = {
      language,
      timezone: getUserTimeZone(user, config.defaultTimezone),
    };
    const lines = [t("invoices_header", language, { count: shown.length })];
    const keyboardRows = [];

    shown.forEach((invoice, index) => {
      lines.push("");
      lines.push(normalizeInvoiceForMessage(invoice, index, userContext, language));
      if (invoice.paymentUrl) {
        keyboardRows.push([
          {
            text: t("btn_pay_invoice", language, {
              invoiceId: invoice.invoiceId || index + 1,
            }),
            url: invoice.paymentUrl,
          },
        ]);
      }
    });

    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: lines.join("\n"),
      replyMarkup: buildSectionKeyboard(language, "invoices", keyboardRows),
    });
  } catch (error) {
    if (isBillingSessionExpiredError(error)) {
      await requestPasswordForContinuation({
        telegramUserId,
        chatId,
        language,
        pendingAction: buildPendingAction("invoices"),
        callbackQuery,
        db,
        telegram,
      });
      return;
    }

    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: t("generic_error", language),
      replyMarkup: buildSectionKeyboard(language, "invoices"),
    });
    console.error("[invoices] Failed:", error);
  }
}

async function handleTicketsCommand({
  message,
  callbackQuery,
  db,
  billing,
  telegram,
  config,
}) {
  const telegramUserId = Number(callbackQuery?.from?.id || message?.from?.id);
  const chatId = Number(callbackQuery?.message?.chat?.id || message?.chat?.id);
  const user = await db.getUser(telegramUserId);
  const language = getUserLanguage(user, config.defaultLanguage);

  if (!user?.billing) {
    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: t("not_linked", language),
      replyMarkup: buildMainMenu(language, false),
    });
    return;
  }

  try {
    const tickets = await billing.getTickets({
      auth: user.billing.auth,
      clientId: user.billing.clientId,
      email: user.billing.email,
    });

    if (!tickets.length) {
      await sendOrEditView({
        db,
        telegram,
        telegramUserId,
        chatId,
        callbackQuery,
        text: t("tickets_empty", language),
        replyMarkup: buildSectionKeyboard(language, "tickets"),
      });
      return;
    }

    const shown = tickets.slice(0, 15);
    const userContext = {
      language,
      timezone: getUserTimeZone(user, config.defaultTimezone),
    };
    const lines = [t("tickets_header", language, { count: shown.length })];

    shown.forEach((ticket, index) => {
      lines.push("");
      lines.push(normalizeTicketForMessage(ticket, index, userContext, language));
    });

    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: lines.join("\n"),
      replyMarkup: buildSectionKeyboard(language, "tickets"),
    });
  } catch (error) {
    if (isBillingSessionExpiredError(error)) {
      await requestPasswordForContinuation({
        telegramUserId,
        chatId,
        language,
        pendingAction: buildPendingAction("tickets"),
        callbackQuery,
        db,
        telegram,
      });
      return;
    }

    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: t("generic_error", language),
      replyMarkup: buildSectionKeyboard(language, "tickets"),
    });
    console.error("[tickets] Failed:", error);
  }
}

async function handleAccountCommand({
  message,
  callbackQuery,
  db,
  billing,
  telegram,
  config,
}) {
  const telegramUserId = Number(callbackQuery?.from?.id || message?.from?.id);
  const chatId = Number(callbackQuery?.message?.chat?.id || message?.chat?.id);
  const user = await db.getUser(telegramUserId);
  const language = getUserLanguage(user, config.defaultLanguage);

  if (!user?.billing) {
    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: t("not_linked", language),
      replyMarkup: buildMainMenu(language, false),
    });
    return;
  }

  try {
    const account = await billing.getAccountSummary({
      auth: user.billing.auth,
      clientId: user.billing.clientId,
      email: user.billing.email,
    });

    if (!account) {
      await sendOrEditView({
        db,
        telegram,
        telegramUserId,
        chatId,
        callbackQuery,
        text: t("account_unavailable", language),
        replyMarkup: buildSectionKeyboard(language, "account"),
      });
      return;
    }

    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: normalizeAccountForMessage(account, language),
      replyMarkup: buildSectionKeyboard(language, "account"),
    });
  } catch (error) {
    if (isBillingSessionExpiredError(error)) {
      await requestPasswordForContinuation({
        telegramUserId,
        chatId,
        language,
        pendingAction: buildPendingAction("account"),
        callbackQuery,
        db,
        telegram,
      });
      return;
    }

    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: t("generic_error", language),
      replyMarkup: buildSectionKeyboard(language, "account"),
    });
    console.error("[account] Failed:", error);
  }
}

async function handleSessionPasswordInput({
  user,
  password,
  chatId,
  telegramUserId,
  db,
  billing,
  telegram,
  config,
}) {
  const language = getUserLanguage(user, config.defaultLanguage);
  if (!user?.billing?.email) {
    await db.clearUserState(telegramUserId);
    await sendTrackedMessage({
      db,
      telegram,
      telegramUserId,
      chatId,
      text: t("not_linked", language),
      options: {
        reply_markup: buildMainMenu(language, false),
      },
    });
    return;
  }

  const runningMessage = await sendTrackedMessage({
    db,
    telegram,
    telegramUserId,
    chatId,
    text: t("reauth_running", language),
    options: {
      reply_markup: buildCancelKeyboard(language),
    },
  });
  const runningMessageId = Number(runningMessage?.message_id);

  try {
    const pendingAction = user.state?.pendingAction || null;
    const { auth, profile } = await billing.loginClient(user.billing.email, password);

    const email = profile?.email || user.billing.email;
    const clientId =
      profile?.id ||
      profile?.client_id ||
      profile?.clientId ||
      user.billing.clientId ||
      null;

    const updatedUser = await db.linkBilling(telegramUserId, {
      email,
      clientId,
      auth: auth || user.billing.auth || null,
    });

    const updatedLanguage = getUserLanguage(updatedUser, config.defaultLanguage);
    if (isNumericMessageId(runningMessageId)) {
      await editTrackedMessage({
        db,
        telegram,
        telegramUserId,
        chatId,
        messageId: runningMessageId,
        text: t("session_refresh_continue", updatedLanguage),
      });
    } else {
      await sendTrackedMessage({
        db,
        telegram,
        telegramUserId,
        chatId,
        text: t("session_refresh_continue", updatedLanguage),
      });
    }

    await continuePendingAction({
      pendingAction,
      telegramUserId,
      chatId,
      db,
      billing,
      telegram,
      config,
    });
  } catch (error) {
    const failureText = t("reauth_failed", language, {
      reason: String(error.message || error),
    });
    if (isNumericMessageId(runningMessageId)) {
      await editTrackedMessage({
        db,
        telegram,
        telegramUserId,
        chatId,
        messageId: runningMessageId,
        text: `${failureText}\n\n${t("session_waiting_password", language)}`,
        options: {
          reply_markup: buildCancelKeyboard(language),
        },
      });
    } else {
      await sendTrackedMessage({
        db,
        telegram,
        telegramUserId,
        chatId,
        text: `${failureText}\n\n${t("session_waiting_password", language)}`,
        options: {
          reply_markup: buildCancelKeyboard(language),
        },
      });
    }
  }
}

async function handleRenewOrder({
  chatId,
  telegramUserId,
  orderId,
  callbackQuery,
  db,
  billing,
  telegram,
  config,
}) {
  const user = await db.getUser(telegramUserId);
  const language = getUserLanguage(user, config.defaultLanguage);

  if (!user?.billing) {
    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: t("not_linked", language),
      replyMarkup: buildMainMenu(language, false),
    });
    return;
  }

  try {
    const renewal = await billing.createRenewalInvoice({
      auth: user.billing.auth,
      clientId: user.billing.clientId,
      orderId,
    });

    const paymentUrl =
      renewal.paymentUrl ||
      (await billing.getInvoicePaymentLink({
        auth: user.billing.auth,
        invoiceId: renewal.invoiceId,
      }));

    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: t("renew_success", language, {
        invoiceId: renewal.invoiceId,
        url: paymentUrl,
      }),
      replyMarkup: buildSectionKeyboard(language, "services", [
        [{ text: t("btn_pay_now", language), url: paymentUrl }],
      ]),
    });
  } catch (error) {
    if (isBillingSessionExpiredError(error)) {
      await requestPasswordForContinuation({
        telegramUserId,
        chatId,
        language,
        pendingAction: buildPendingAction("renew", { orderId }),
        callbackQuery,
        db,
        telegram,
      });
      return;
    }

    await sendOrEditView({
      db,
      telegram,
      telegramUserId,
      chatId,
      callbackQuery,
      text: t("renew_failed", language, {
        reason: String(error.message || error),
      }),
      replyMarkup: buildSectionKeyboard(language, "services"),
    });
  }
}

async function handleLanguageCommand({ message, db, telegram, config }) {
  const user = await db.getUser(message.from.id);
  const language = getUserLanguage(user, config.defaultLanguage);

  await sendTrackedMessage({
    db,
    telegram,
    telegramUserId: message.from.id,
    chatId: message.chat.id,
    text: t("language_prompt", language),
    options: {
      reply_markup: buildLanguageKeyboard(language),
    },
  });
}

async function handleTimezoneCommand({ parsed, message, db, telegram, config }) {
  const user = await db.getUser(message.from.id);
  const language = getUserLanguage(user, config.defaultLanguage);

  if (!parsed.argsText) {
    await sendTrackedMessage({
      db,
      telegram,
      telegramUserId: message.from.id,
      chatId: message.chat.id,
      text: t("timezone_prompt", language),
      options: {
        reply_markup: buildTimezoneKeyboard(
          getUserTimeZone(user, config.defaultTimezone),
          language,
        ),
      },
    });
    return;
  }

  const timezone = parsed.argsText.trim();
  if (!isValidTimeZone(timezone)) {
    await sendTrackedMessage({
      db,
      telegram,
      telegramUserId: message.from.id,
      chatId: message.chat.id,
      text: t("timezone_invalid", language),
      options: {
        reply_markup: buildTimezoneKeyboard(
          getUserTimeZone(user, config.defaultTimezone),
          language,
        ),
      },
    });
    return;
  }

  const updatedUser = await db.setTimezone(message.from.id, timezone);
  const updatedLanguage = getUserLanguage(updatedUser, config.defaultLanguage);
  await sendTrackedMessage({
    db,
    telegram,
    telegramUserId: message.from.id,
    chatId: message.chat.id,
    text: t("timezone_saved", updatedLanguage, { timezone }),
    options: {
      reply_markup: buildSettingsKeyboard(updatedLanguage, timezone),
    },
  });
}

async function handleTextMessage({ message, db, telegram, billing, config }) {
  let user = await db.upsertTelegramUser(message.from);
  await db.touchUser(message.from.id);
  const text = String(message.text || "");
  const inputText = text.trim();
  const parsed = parseCommand(text);
  await cleanupIncomingUserMessage({ user, message, db, telegram });
  user = (await db.getUser(message.from.id)) || user;
  const language = getUserLanguage(user, config.defaultLanguage);
  const state = user?.state;

  if (state?.mode === STATE_AWAITING_LINK_EMAIL) {
    if (isCancelInput(inputText)) {
      const clearedUser = await db.clearUserState(message.from.id);
      const updatedLanguage = getUserLanguage(clearedUser, config.defaultLanguage);
      await sendMainMenu({
        db,
        telegram,
        chatId: message.chat.id,
        telegramUserId: message.from.id,
        user: clearedUser,
        config,
        textOverride: t("session_cancelled", updatedLanguage),
      });
      return;
    }

    if (!inputText || parsed) {
      await sendTrackedMessage({
        db,
        telegram,
        telegramUserId: message.from.id,
        chatId: message.chat.id,
        text: t("link_enter_email", language),
        options: {
          reply_markup: buildCancelKeyboard(language),
        },
      });
      return;
    }

    await handleLinkEmailInput({
      email: inputText,
      chatId: message.chat.id,
      telegramUserId: message.from.id,
      db,
      telegram,
      config,
    });
    return;
  }

  if (state?.mode === STATE_AWAITING_LINK_PASSWORD) {
    if (isCancelInput(inputText)) {
      const clearedUser = await db.clearUserState(message.from.id);
      const updatedLanguage = getUserLanguage(clearedUser, config.defaultLanguage);
      await sendMainMenu({
        db,
        telegram,
        chatId: message.chat.id,
        telegramUserId: message.from.id,
        user: clearedUser,
        config,
        textOverride: t("session_cancelled", updatedLanguage),
      });
      return;
    }

    if (!inputText || parsed) {
      await sendTrackedMessage({
        db,
        telegram,
        telegramUserId: message.from.id,
        chatId: message.chat.id,
        text: t("link_waiting_password", language),
        options: {
          reply_markup: buildCancelKeyboard(language),
        },
      });
      return;
    }

    user = await db.getUser(message.from.id);
    await handleLinkPasswordInput({
      user,
      password: inputText,
      chatId: message.chat.id,
      telegramUserId: message.from.id,
      db,
      billing,
      telegram,
      config,
    });
    return;
  }

  if (state?.mode === STATE_AWAITING_BILLING_PASSWORD) {
    if (isCancelInput(inputText)) {
      const clearedUser = await db.clearUserState(message.from.id);
      const updatedLanguage = getUserLanguage(clearedUser, config.defaultLanguage);
      await sendMainMenu({
        db,
        telegram,
        chatId: message.chat.id,
        telegramUserId: message.from.id,
        user: clearedUser,
        config,
        textOverride: t("session_cancelled", updatedLanguage),
      });
      return;
    }

    if (!inputText || parsed) {
      await sendTrackedMessage({
        db,
        telegram,
        telegramUserId: message.from.id,
        chatId: message.chat.id,
        text: t("session_waiting_password", language),
        options: {
          reply_markup: buildCancelKeyboard(language),
        },
      });
      return;
    }

    user = await db.getUser(message.from.id);
    await handleSessionPasswordInput({
      user,
      password: inputText,
      chatId: message.chat.id,
      telegramUserId: message.from.id,
      db,
      billing,
      telegram,
      config,
    });
    return;
  }

  if (!parsed) {
    await sendMainMenu({
      db,
      telegram,
      chatId: message.chat.id,
      telegramUserId: message.from.id,
      user,
      config,
      textOverride: t("command_unknown", language),
    });
    return;
  }

  if (parsed.command === "start") {
    await sendMainMenu({
      db,
      telegram,
      chatId: message.chat.id,
      telegramUserId: message.from.id,
      user,
      config,
    });
    return;
  }

  if (parsed.command === "help") {
    await sendHelp({
      db,
      telegram,
      chatId: message.chat.id,
      telegramUserId: message.from.id,
      user,
      config,
    });
    return;
  }

  if (parsed.command === "settings") {
    await sendSettings({
      db,
      telegram,
      chatId: message.chat.id,
      telegramUserId: message.from.id,
      user,
      config,
    });
    return;
  }

  if (parsed.command === "language") {
    await handleLanguageCommand({ message, db, telegram, config });
    return;
  }

  if (parsed.command === "timezone") {
    await handleTimezoneCommand({ parsed, message, db, telegram, config });
    return;
  }

  if (parsed.command === "link") {
    await handleLinkCommand({ parsed, message, db, billing, telegram, config });
    return;
  }

  if (parsed.command === "cancel") {
    const clearedUser = await db.clearUserState(message.from.id);
    const updatedLanguage = getUserLanguage(clearedUser, config.defaultLanguage);
    await sendMainMenu({
      db,
      telegram,
      chatId: message.chat.id,
      telegramUserId: message.from.id,
      user: clearedUser,
      config,
      textOverride: t("session_cancelled", updatedLanguage),
    });
    return;
  }

  if (parsed.command === "unlink") {
    const updatedUser = await db.unlinkBilling(message.from.id);
    const updatedLanguage = getUserLanguage(updatedUser, config.defaultLanguage);
    await sendMainMenu({
      db,
      telegram,
      chatId: message.chat.id,
      telegramUserId: message.from.id,
      user: updatedUser,
      config,
      textOverride: t("unlink_success", updatedLanguage),
    });
    return;
  }

  if (parsed.command === "services") {
    await handleServicesCommand({ message, db, billing, telegram, config });
    return;
  }

  if (parsed.command === "invoices") {
    await handleInvoicesCommand({ message, db, billing, telegram, config });
    return;
  }

  if (parsed.command === "tickets") {
    await handleTicketsCommand({ message, db, billing, telegram, config });
    return;
  }

  if (parsed.command === "account") {
    await handleAccountCommand({ message, db, billing, telegram, config });
    return;
  }

  if (parsed.command === "renew") {
    const orderId = parsed.argList[0];
    if (!orderId) {
      await sendTrackedMessage({
        db,
        telegram,
        telegramUserId: message.from.id,
        chatId: message.chat.id,
        text: t("renew_usage", language),
        options: {
          reply_markup: buildMainMenu(language, Boolean(user?.billing)),
        },
      });
      return;
    }
    await handleRenewOrder({
      chatId: message.chat.id,
      telegramUserId: message.from.id,
      orderId,
      db,
      billing,
      telegram,
      config,
    });
    return;
  }

  await sendMainMenu({
    db,
    telegram,
    chatId: message.chat.id,
    telegramUserId: message.from.id,
    user,
    config,
    textOverride: t("command_unknown", language),
  });
}

async function handleCallbackQuery({ callbackQuery, db, billing, telegram, config }) {
  const userId = callbackQuery?.from?.id;
  if (!userId) {
    return;
  }

  let user = await db.upsertTelegramUser(callbackQuery.from);
  await db.touchUser(userId);
  const language = getUserLanguage(user, config.defaultLanguage);
  const data = String(callbackQuery.data || "");
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = Number(callbackQuery.message?.message_id);

  if (!chatId) {
    await telegram.answerCallbackQuery(
      callbackQuery.id,
      t("callback_failed", language),
      false,
    );
    return;
  }

  if (isNumericMessageId(messageId)) {
    await db.setLatestBotMessage(userId, chatId, messageId);
  }

  if (data === "state:cancel") {
    const clearedUser = await db.clearUserState(userId);
    const updatedLanguage = getUserLanguage(clearedUser, config.defaultLanguage);
    await editCallbackMessageText({
      callbackQuery,
      db,
      telegram,
      telegramUserId: userId,
      text: t("session_cancelled", updatedLanguage),
      replyMarkup: buildMainMenu(updatedLanguage, Boolean(clearedUser?.billing)),
    });
    await telegram.answerCallbackQuery(
      callbackQuery.id,
      t("callback_done", updatedLanguage),
      false,
    );
    return;
  }

  if (user?.state?.mode === STATE_AWAITING_LINK_EMAIL) {
    await telegram.answerCallbackQuery(
      callbackQuery.id,
      t("link_enter_email", language),
      true,
    );
    return;
  }

  if (user?.state?.mode === STATE_AWAITING_LINK_PASSWORD) {
    await telegram.answerCallbackQuery(
      callbackQuery.id,
      t("link_waiting_password", language),
      true,
    );
    return;
  }

  if (user?.state?.mode === STATE_AWAITING_BILLING_PASSWORD) {
    await telegram.answerCallbackQuery(
      callbackQuery.id,
      t("session_waiting_password", language),
      true,
    );
    return;
  }

  try {
    if (data === "menu:services") {
      await handleServicesCommand({
        callbackQuery,
        db,
        billing,
        telegram,
        config,
      });
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", language),
        false,
      );
      return;
    }

    if (data === "menu:invoices") {
      await handleInvoicesCommand({
        callbackQuery,
        db,
        billing,
        telegram,
        config,
      });
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", language),
        false,
      );
      return;
    }

    if (data === "menu:tickets") {
      await handleTicketsCommand({
        callbackQuery,
        db,
        billing,
        telegram,
        config,
      });
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", language),
        false,
      );
      return;
    }

    if (data === "menu:account") {
      await handleAccountCommand({
        callbackQuery,
        db,
        billing,
        telegram,
        config,
      });
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", language),
        false,
      );
      return;
    }

    if (data === "menu:link") {
      await startLinkFlow({
        telegramUserId: userId,
        chatId,
        callbackQuery,
        db,
        telegram,
        config,
        reason: "inline_link_start",
      });
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", language),
        false,
      );
      return;
    }

    if (data === "menu:unlink") {
      const updatedUser = await db.unlinkBilling(userId);
      const updatedLanguage = getUserLanguage(updatedUser, config.defaultLanguage);
      await editCallbackMessageText({
        callbackQuery,
        db,
        telegram,
        telegramUserId: userId,
        text: t("unlink_success", updatedLanguage),
        replyMarkup: buildMainMenu(updatedLanguage, false),
      });
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", updatedLanguage),
        false,
      );
      return;
    }

    if (data === "menu:home") {
      await editCallbackMessageText({
        callbackQuery,
        db,
        telegram,
        telegramUserId: userId,
        text: t(user?.billing ? "welcome_linked" : "welcome_unlinked", language),
        replyMarkup: buildMainMenu(language, Boolean(user?.billing)),
      });
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", language),
        false,
      );
      return;
    }

    if (data === "menu:settings") {
      await editCallbackMessageText({
        callbackQuery,
        db,
        telegram,
        telegramUserId: userId,
        text: t("settings_title", language),
        replyMarkup: buildSettingsKeyboard(
          language,
          getUserTimeZone(user, config.defaultTimezone),
        ),
      });
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", language),
        false,
      );
      return;
    }

    if (data === "menu:help") {
      await editCallbackMessageText({
        callbackQuery,
        db,
        telegram,
        telegramUserId: userId,
        text: t("help", language),
        replyMarkup: buildMainMenu(language, Boolean(user?.billing)),
      });
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", language),
        false,
      );
      return;
    }

    if (data === "menu:language") {
      await editCallbackMessageText({
        callbackQuery,
        db,
        telegram,
        telegramUserId: userId,
        text: t("language_prompt", language),
        replyMarkup: buildLanguageKeyboard(language),
      });
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", language),
        false,
      );
      return;
    }

    if (data === "menu:timezone") {
      await editCallbackMessageText({
        callbackQuery,
        db,
        telegram,
        telegramUserId: userId,
        text: t("timezone_prompt", language),
        replyMarkup: buildTimezoneKeyboard(
          getUserTimeZone(user, config.defaultTimezone),
          language,
        ),
      });
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", language),
        false,
      );
      return;
    }

    if (data.startsWith("lang:")) {
      const selected = data.slice("lang:".length);
      const nextLanguage = normalizeLanguage(selected, config.defaultLanguage);
      const updatedUser = await db.setLanguage(userId, nextLanguage);
      user = updatedUser || user;
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", nextLanguage),
        false,
      );
      await editCallbackMessageText({
        callbackQuery,
        db,
        telegram,
        telegramUserId: userId,
        text: t("language_saved", nextLanguage),
        replyMarkup: buildSettingsKeyboard(
          nextLanguage,
          getUserTimeZone(updatedUser, config.defaultTimezone),
        ),
      });
      return;
    }

    if (data.startsWith("tzp:")) {
      const key = data.slice("tzp:".length);
      const preset = getTimezonePresetByKey(key);
      if (!preset) {
        await telegram.answerCallbackQuery(
          callbackQuery.id,
          t("timezone_invalid", language),
          true,
        );
        return;
      }

      const updatedUser = await db.setTimezone(userId, preset.id);
      const updatedLanguage = getUserLanguage(updatedUser, config.defaultLanguage);
      user = updatedUser || user;
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", updatedLanguage),
        false,
      );
      await editCallbackMessageText({
        callbackQuery,
        db,
        telegram,
        telegramUserId: userId,
        text: t("timezone_saved", updatedLanguage, { timezone: preset.id }),
        replyMarkup: buildSettingsKeyboard(updatedLanguage, preset.id),
      });
      return;
    }

    if (data.startsWith("renew:")) {
      const orderId = data.slice("renew:".length);
      if (!orderId) {
        await telegram.answerCallbackQuery(
          callbackQuery.id,
          t("renew_usage", language),
          true,
        );
        return;
      }
      await telegram.answerCallbackQuery(
        callbackQuery.id,
        t("callback_done", language),
        false,
      );
      await handleRenewOrder({
        chatId,
        telegramUserId: userId,
        orderId,
        callbackQuery,
        db,
        billing,
        telegram,
        config,
      });
      return;
    }

    await telegram.answerCallbackQuery(
      callbackQuery.id,
      t("callback_failed", language),
      false,
    );
  } catch (error) {
    await telegram.answerCallbackQuery(
      callbackQuery.id,
      t("callback_failed", language),
      true,
    );
    console.error("[callback] Failed:", error);
  }
}

async function handleTelegramUpdate(update, context) {
  if (!update || typeof update !== "object") {
    return;
  }

  if (update.message?.from) {
    await handleTextMessage({
      message: update.message,
      ...context,
    });
    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery({
      callbackQuery: update.callback_query,
      ...context,
    });
  }
}

module.exports = {
  handleTelegramUpdate,
};

},
"src/index.js": function(module, exports, __require, __filename, __dirname, require) {
const http = require("node:http");

const { config } = __require("src/config.js");
const { JsonDatabase } = __require("src/database.js");
const { TelegramClient } = __require("src/telegram.js");
const { FossBillingClient } = __require("src/fossbilling.js");
const { handleTelegramUpdate } = __require("src/bot.js");

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

    // Accept any other POST to prevent 404 errors
    if (method === "POST") {
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  });

  await new Promise((resolve) => {
    server.listen(config.port, () => {
      const mode = config.usePolling ? "polling" : "webhook";
      const msg = config.usePolling
        ? `[startup] Bot server listening on port ${config.port}, mode=polling`
        : `[startup] Bot server listening on port ${config.port}, mode=webhook at ${config.webhookPath}`;
      console.log(msg);
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

},
"src/main.js": function(module, exports, __require, __filename, __dirname, require) {

const { startServer } = __require("src/index.js");

startServer().catch((error) => {
  console.error("[startup] Fatal error:", error);
  process.exit(1);
});

}
  };
  const __cache = {};

  function __require(id) {
    if (__cache[id]) {
      return __cache[id].exports;
    }
    if (!__modules[id]) {
      if (__nativeRequire) {
        return __nativeRequire(id);
      }
      throw new Error("Module not found: " + id);
    }

    const module = { exports: {} };
    __cache[id] = module;
    const __filename = id;
    const __dirname = id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : ".";
    __modules[id](module, module.exports, __require, __filename, __dirname, __nativeRequire || __require);
    return module.exports;
  }

  __require("src/main.js");
})();
