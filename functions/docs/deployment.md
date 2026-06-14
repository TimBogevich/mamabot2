# Deployment Configuration — MamaBot Telegram Bot

> Дата: 2026-06-15
> Проект: mamabot-97d22

---

## Telegram Bot Token Configuration

The Telegram bot token is resolved at module load time with the following priority:

1. **Primary:** `functions.config().telegram.token` (Firebase Functions Config)
2. **Fallback:** `process.env.TELEGRAM_TOKEN` (environment variable for local development)

If neither source provides a token, the module throws a clear startup error:

> `TELEGRAM_TOKEN not configured. Set via firebase functions:config:set telegram.token or TELEGRAM_TOKEN env var.`

### Production Deployment

Set the token via Firebase Functions Config:

```bash
firebase functions:config:set telegram.token="YOUR_BOT_TOKEN"
firebase deploy --only functions
```

> **⚠️ Security warning:** The old hardcoded token value `8780361867:AAEdAFfH380PXAAz3wKjFXVE0v95DKGgq-c` was exposed in the repository history and is **compromised**. It **must be rotated** (regenerated via [@BotFather](https://t.me/BotFather)) before deploying this configuration to production.

### Local Development

Set the `TELEGRAM_TOKEN` environment variable when running functions locally:

```bash
# Option 1: Inline when running
TELEGRAM_TOKEN="your_bot_token" node index.js

# Option 2: Using a .env file (gitignored)
echo "TELEGRAM_TOKEN=your_bot_token" > .env
source .env && node index.js

# Option 3: Via Firebase Local Emulator Suite
TELEGRAM_TOKEN="your_bot_token" firebase emulators:start --only functions
```

> **Note:** If both `functions.config().telegram.token` and `TELEGRAM_TOKEN` are set, the Firebase Config value takes priority. The environment variable is a development convenience fallback only.

### Post-Deployment Verification

After deploying, verify that the webhook is registered correctly by sending a GET request to:

```
https://<your-project-region>-<project-id>.cloudfunctions.net/webhook
```

A successful response looks like:

```json
{
  "success": true,
  "description": "Webhook was set",
  "webhookUrl": "https://<region>-<project>.cloudfunctions.net/webhook"
}
```

---

## Firestore Security Rules (firestore.rules)

Deploy security rules together with functions:

```bash
firebase deploy --only firestore:rules
```

---

## Environment Variables Reference

| Variable             | Required | Description                              | Source                      |
|----------------------|----------|------------------------------------------|-----------------------------|
| `TELEGRAM_TOKEN`     | Yes      | Telegram bot API token (fallback)        | `process.env`               |
| `FIREBASE_PROJECT_ID`| Yes*     | Firebase project ID for local development| `process.env`               |
| `FIRESTORE_EMULATOR_HOST` | No | Firestore emulator host:port            | `process.env`               |

> *`FIREBASE_PROJECT_ID` is required for local development outside the Firebase emulator suite.

---

## Related Documentation

- [Firestore Schemas](./schemas.md) — collection structure, validation, and indexes
- [Firestore Schema (Russian)](../../docs/firestore-schema.md) — users collection schema
