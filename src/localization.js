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
