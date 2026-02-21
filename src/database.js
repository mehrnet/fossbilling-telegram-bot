const fs = require("node:fs/promises");
const path = require("node:path");

const {
  detectLanguage,
  normalizeLanguage,
  normalizeTimeZone,
  DEFAULT_LANGUAGE,
  DEFAULT_TIMEZONE,
} = require("./localization");

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
