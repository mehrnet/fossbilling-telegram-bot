# MehrNet Hosting Telegram Bot

Zero-dependency Node.js Telegram bot for FOSSBilling hosting workflows:
- Parse Telegram webhooks directly with native `http`.
- Read/write app state to `./database.json` through `src/database.js`.
- Multilingual + multi-timezone user preferences (currently `en`, `fa`).
- Inline-only UX: link account, view services/invoices/tickets/account, renew, and pay from Telegram.
- Supports system proxies via `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` / `NO_PROXY` (HTTP/HTTPS/SOCKS5).

## Requirements

- Node.js `>=18`
- Telegram bot token
- FOSSBilling API key

## Environment variables

Copy `.env.example` to `.env` and set values:

- `BOT_TOKEN` Telegram Bot token.
- `WEBHOOK_URL` Public webhook URL (leave empty to use polling mode).
- `BILLING_API_KEY` FOSSBilling API key.
- `BILLING_BASE_URL` FOSSBilling base URL (example: `https://dash.mehrnet.com`).
- Optional: `WEBHOOK_SECRET`, `DATABASE_FILE`, `WEBHOOK_LOCK_FILE`, `DEFAULT_LANGUAGE`, `DEFAULT_TIMEZONE`, `PORT`, `POLLING_TIMEOUT_SEC`, `POLLING_IDLE_DELAY_MS`, `POLLING_ERROR_DELAY_MS`.
- Proxy envs are supported automatically: `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`.
- Proxy fallback is automatic if the first proxy is unreachable.
- To force direct connections even when proxy vars exist, set `DISABLE_SYSTEM_PROXY=true`.

## Run

```bash
npm run dev
```

or

```bash
npm run build
npm start
```

Health endpoint:

```text
GET /health
```

Webhook endpoint:

- Automatically uses the path from `WEBHOOK_URL`.
- Example: if `WEBHOOK_URL=https://bot.example.com/telegram/webhook`, then incoming webhook route is `POST /telegram/webhook`.

Polling mode:

- If `WEBHOOK_URL` is empty, the bot uses Telegram `getUpdates` polling automatically.
- On startup in polling mode, the bot calls `deleteWebhook` to avoid webhook/polling conflicts.

## cPanel deployment

1. Upload project files.
2. Set environment variables in cPanel Node.js app settings.
3. Set **Application Startup File** to `app.js`.
4. Start or restart the app.

Source entry is `src/main.js`, and deploy artifact is root `app.js`.

`webhook.lock` behavior:
- On startup, if `WEBHOOK_URL` is set and `webhook.lock` does not exist, the app calls Telegram `setWebhook` and writes `webhook.lock`.
- If you need to reset webhook registration, delete `webhook.lock` and restart the app.

## Interaction

- Main flow is inline-keyboard-driven (no slash commands required):
  - Tap `Connect Account` / `Relink Account`
  - Enter email
  - Enter password
  - Bot verifies and logs you in
  - If billing session expires later, bot asks for password and continues the pending request automatically
- Section submenus are context-aware:
  - `Services`, `Invoices`, `Tickets`, and `Account` each open their own submenu
  - Each submenu includes section actions plus `Back to Main Menu`
- Chat cleanup behavior:
  - Bot tracks latest bot message id/chat id per user in `database.json`
  - On user text input, bot deletes the user message and previous bot message, then sends the next state/menu message
  - On inline button taps, bot updates the same message via `editMessageText`
- Slash commands are still supported as optional fallback:
  - `/start`, `/help`, `/link`, `/unlink`, `/services`, `/invoices`, `/tickets`, `/account`, `/renew <order_id>`, `/cancel`, `/settings`, `/language`, `/timezone <IANA timezone>`

## Single-file build

Bundle all local source files into one portable startup file:

```bash
npm run build
```

Output:

```text
app.js
```

That bundled file still uses Node.js built-ins only.
