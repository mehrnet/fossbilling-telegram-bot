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
