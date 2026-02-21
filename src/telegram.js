const { postJson } = require("./http-client");

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
