const { t } = require("./translations");
const {
  SUPPORTED_LANGUAGES,
  TIMEZONE_PRESETS,
  normalizeLanguage,
  normalizeTimeZone,
  isValidTimeZone,
  formatDateTime,
  getTimezonePresetByKey,
} = require("./localization");

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
