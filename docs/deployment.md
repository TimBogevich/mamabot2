# Deployment Guide

Last updated: 2026-06-17

This document describes how to deploy the MamaBot Telegram bot Firebase Functions to production, including required secrets, manual steps, and CI/CD automation.

---

## Prerequisites

- **Node.js 20+** — the Functions runtime is `nodejs20` (see [`firebase.json`](../firebase.json))
- **Firebase CLI** — available via devDependencies (`npx firebase`) or install globally:

  ```bash
  npm install -g firebase-tools
  ```

  Verify installation:

  ```bash
  firebase --version
  ```

- **Firebase authentication** — log in to the Firebase project:

  ```bash
  firebase login
  ```

- **Project access** — ensure your account has access to the default project (`mamabot-97d22` as configured in [`.firebaserc`](../.firebaserc)). Verify with:

  ```bash
  firebase projects:list
  ```

- **Telegram token configured** — see [Telegram Bot Token Configuration](#telegram-bot-token-configuration) below

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

### Legacy Config: `TELEGRAM_BOT_TOKEN`

The token was previously stored under the key `telegram.bot_token` in Firebase Functions Config. As of [FN-014](https://github.com/mamabot/mamabot3/issues/FN-014), the bot token extraction is being consolidated. Ensure your config uses `telegram.token` (the current primary key).

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

### Automated Verification

Unit tests in [`functions/src/__tests__/webhook.test.js`](functions/src/__tests__/webhook.test.js) validate the webhook registration flow:

- Success response shape (`success`, `description`, `webhookUrl`)
- Correct URL construction using the config-sourced Telegram bot token
- Request host header derived webhook URL
- Error handling for Telegram API failures and network errors
- URL encoding of special characters
- Integration test confirming the GET handler wiring to `registerWebhook`

Run the tests locally:

```bash
cd functions
pnpm test
```

---

## Manual Deployment

From the `functions/` directory, run:

```bash
npm run deploy
```

This executes `firebase deploy --only functions,firestore:rules`, which deploys both Cloud Functions and Firestore security rules atomically. The `--only functions,firestore:rules` flag ensures both products are updated together while preventing accidental deployment of other Firebase products (Hosting, Storage, etc.).

**Equivalent one-liner** (from repo root):

```bash
cd functions && npm run deploy
```

**Direct command** (if not using npm scripts):

```bash
firebase deploy --only functions,firestore:rules
```

### What gets deployed

| Artifact | Source | Deployment Command |
|----------|--------|--------------------|
| Cloud Functions | `functions/index.js` (runtime `nodejs20`) | `npm run deploy` (from `functions/`) |
| Firestore rules | `firestore.rules` | `firebase deploy --only firestore:rules` |

The Functions source directory is `functions/` as declared in [`firebase.json`](../firebase.json). The Functions deploy process:

1. Installs production dependencies (`npm ci --production`)
2. Bundles the source
3. Uploads to Firebase Cloud Functions (runtime: `nodejs20`)
4. Makes the functions available at Firebase-assigned HTTPS endpoints

### Deployed Functions

| Function | Type | Trigger | Description |
|----------|------|---------|-------------|
| `webhook` | HTTPS | HTTP request | Handles incoming Telegram updates (messages, callbacks) |
| `sendWeeklyNotifications` | Scheduled | `every day 09:00` Europe/Moscow | Queries users with LMP date, computes pregnancy week, fetches pregnancy development data from `pregnancy_data` collection and sends locale-aware notification via Telegram |

> **Note:** The `sendWeeklyNotifications` function depends on the `pregnancy_data` Firestore collection being seeded with weekly pregnancy development data. Seed the collection by running `pnpm seed:pregnancy-data` from the repo root. The function also requires locale keys `notifications.new_week_full` in both `functions/src/locales/ru.json` and `functions/src/locales/en.json`.

---

## Security Rules Deployment

[`firebase.json`](../firebase.json) includes a `firestore` config block that references [`firestore.rules`](../firestore.rules) — the Firestore security rules file. Without deploying these rules, Firestore has **no access control** in production: all authenticated users can read and write any collection.

### Why it matters

- The `firestore.rules` file defines per-collection access policies (see [`docs/firestore-schema.md`](firestore-schema.md))
- If the rules are not deployed, Firestore falls back to the default (or previously deployed) rules — which may be too permissive or too restrictive
- The `npm run deploy` script now deploys both Functions **and** Firestore rules atomically

### Deploy Firestore rules only

From the repo root:

```bash
firebase deploy --only firestore:rules
```

### Selective deploys

```bash
# Deploy only Cloud Functions
cd functions && firebase deploy --only functions

# Deploy only Firestore rules
firebase deploy --only firestore:rules
```

### Full deployment (Functions + Firestore rules)

From the repo root:

```bash
firebase deploy
```

This deploys both Cloud Functions and Firestore security rules in a single command.

### Recommended workflow

`npm run deploy` now deploys both Cloud Functions and Firestore security rules in a single command.

```bash
cd functions && npm run deploy
```

---

## Required Secrets

### `TELEGRAM_BOT_TOKEN`

The Telegram bot token is required at runtime. It is stored in Firebase Functions runtime config.

**Setting the token:**

```bash
firebase functions:config:set telegram.bot_token="<your-bot-token>"
```

> **Note:** As of [FN-014](https://github.com/mamabot/mamabot3/issues/FN-014), the bot token is being extracted from hardcoded source into runtime config. Until FN-014 is complete, the token may still be present in source code. Once FN-014 is delivered, the config variable will be the sole source.

**Verifying the config:**

```bash
firebase functions:config:get
```

Expected output includes:

```json
{
  "telegram": {
    "bot_token": "..."
  }
}
```

> **Important:** Secrets must be configured **before** deployment, or the functions will fail at runtime when attempting to read `functions.config().telegram.bot_token`.

See [Telegram Bot Token Configuration](#telegram-bot-token-configuration) for the token resolution priority and the current primary config key (`telegram.token`).

---

## Webhook Verification

After deployment completes, register the Telegram webhook by sending a GET request to the deployed function's webhook endpoint:

```bash
curl https://<region>-mamabot-97d22.cloudfunctions.net/webhook
```

Replace `<region>` with the Cloud Functions region (default: `us-central1`).

If successful, the function registers itself with Telegram's Bot API and begins receiving updates.

### Monitoring function execution

Use the Firebase CLI to tail function logs:

```bash
firebase functions:log
```

This streams recent log entries. For real-time monitoring, use the [Google Cloud Console](https://console.cloud.google.com/logs) or the Firebase Console dashboard.

---

## Firestore Emulator Usage

The Firestore emulator lets you run and test the application locally without touching the production Firestore database. It auto-routes Admin SDK calls when `FIRESTORE_EMULATOR_HOST` is set, avoiding the need for cloud credentials.

### Prerequisites

- **Java Runtime (JRE) 17+** — required by the Firestore emulator. On `ubuntu-latest` (GitHub Actions), Java is pre-installed. For local development:

  ```bash
  # Ubuntu / Debian
  sudo apt-get install openjdk-17-jdk

  # macOS (Homebrew)
  brew install --cask temurin@17
  ```

  Verify:

  ```bash
  java -version
  ```

- **`firebase-tools`** — listed as a devDependency in `functions/package.json`. Install with:

  ```bash
  cd functions && npm install
  ```

### Emulator Configuration

The emulator is configured in [`firebase.json`](../firebase.json):

```json
{
  "emulators": {
    "firestore": {
      "port": 8080
    },
    "ui": {
      "enabled": false
    }
  }
}
```

The emulator runs on port **8080** with the Emulator Suite UI disabled.

### Starting the Emulator (Standalone)

```bash
cd functions && npx firebase emulators:start --only firestore
```

This starts the Firestore emulator in the foreground. Stop it with `Ctrl+C`.

### Running a One-Shot Command with the Emulator

Use `emulators:exec` to start the emulator, run a single command, and automatically shut down when the command exits:

```bash
cd functions && npx firebase emulators:exec --only firestore --project mamabot-97d22 "<command>"
```

This pattern:

- Starts the emulator and waits for it to be ready
- Exports the `FIRESTORE_EMULATOR_HOST` environment variable
- Runs `<command>`
- Shuts down the emulator after the command exits
- Propagates the exit code of `<command>`

### How the Admin SDK Auto-Routes to the Emulator

The [`functions/src/firestore.js`](functions/src/firestore.js) module detects `FIRESTORE_EMULATOR_HOST` at load time and configures the Firestore client to connect to it:

```js
if (process.env.FIRESTORE_EMULATOR_HOST) {
  db.settings({
    host: process.env.FIRESTORE_EMULATOR_HOST,
    ssl: false,
  });
}
```

When this environment variable is set, all Admin SDK reads, writes, and queries operate against the local emulator instead of the production database. **No Google Cloud credentials are needed** — the emulator accepts all calls without authentication.

### Stopping the Emulator

- **`emulators:start`** — press `Ctrl+C` in the terminal
- **`emulators:exec`** — stops automatically when the wrapped command finishes

---

## Verify Scripts

Two standalone verification scripts validate Firestore schema compliance by writing, reading, verifying, and deleting test documents. They are useful for confirming that the Firestore setup (emulator, credentials, or network) is working correctly.

### `verify:users-schema`

Validates the `users` collection schema. Runs as an npm script:

```bash
cd functions && npm run verify:users-schema
```

Creates a test document with `chatId: 999999999`, reads it back, validates every field (firstName, lastName, language, lmpDate, currentWeek, partnerCode, role, etc.), and then deletes it.

**Authentication methods** (tried in priority order):

1. **Emulator** — if `FIRESTORE_EMULATOR_HOST` is set, uses the Admin SDK against the local emulator (full validation including `serverTimestamp`)
2. **Service account** — if `GOOGLE_APPLICATION_CREDENTIALS` points to a valid key, uses the Admin SDK against production Firestore
3. **ADC** (`gcloud auth application-default login`) — uses Application Default Credentials with the Admin SDK
4. **Firebase CLI token** — reads the cached token from `~/.config/configstore/firebase-tools.json` and uses the Firestore REST API directly. **Note:** When using the REST API fallback, `serverTimestamp` fields (`createdAt`, `updatedAt`) are skipped — the REST API cannot set Firestore `FieldValue.serverTimestamp()`.

### `verify-pregnancy-data`

Validates the `pregnancy_data` collection schema. Runs directly with Node:

```bash
cd functions && node scripts/verify-pregnancy-data.js
```

Creates a test document with `docId: "1_ru"` (week 1, Russian locale), reads it back, validates fields (weekNumber, language, babyDevelopment, motherChanges, nutritionTips, etc.), and cleans up.

**Authentication:** emulator or ADC only — there is no REST API fallback for this script. It always requires `FIRESTORE_EMULATOR_HOST` or `GOOGLE_APPLICATION_CREDENTIALS`.

### Running with the Emulator

**Recommended approach** — use `emulators:exec` which starts the emulator, runs the script, and shuts down automatically:

```bash
cd functions && npx firebase emulators:exec --only firestore --project mamabot-97d22 "npm run verify:users-schema"
```

**Alternative approach** — start the emulator manually in one terminal, then run in another:

```bash
# Terminal 1:
cd functions && npx firebase emulators:start --only firestore

# Terminal 2:
FIRESTORE_EMULATOR_HOST=localhost:8080 npm run verify:users-schema
```

### CI Coverage

The `verify:users-schema` step runs in CI on every push and pull request to `main`. See `.github/workflows/test.yml`:

```yaml
- name: Verify users schema (emulator)
  run: npx firebase emulators:exec --only firestore --project mamabot-97d22 "npm run verify:users-schema"
  working-directory: functions
```

Note: `verify-pregnancy-data.js` does **not** run in CI yet.

### Expected Output

A successful run produces:

```
  🔍 Verifying users schema…

  Collection: users
  Document:   users/999999999
  ...
  ✅ ALL CHECKS PASSED
```

The script exits with code `0` on success or `1` on failure.

---

## Environment Variables Reference

| Variable | Required | Description | Source |
|----------|----------|-------------|--------|
| `TELEGRAM_TOKEN` | Yes | Telegram bot API token (fallback for local development) | `process.env` |
| `FIREBASE_PROJECT_ID` | Yes* | Firebase project ID for local development | `process.env` |
| `FIRESTORE_EMULATOR_HOST` | No | Firestore emulator host:port (e.g., `localhost:8080`) | `process.env` |

> *`FIREBASE_PROJECT_ID` is required for local development outside the Firebase emulator suite.

---

## CI/CD

This project uses **GitHub Actions** for continuous integration. The workflow is defined in [`.github/workflows/test.yml`](../.github/workflows/test.yml).

### Workflow: `CI`

| Trigger | Branch | Events |
|---------|--------|--------|
| `push` | `main` | Every commit |
| `pull_request` | `main` | Every PR opened or updated |

### Job: `test`

Runs on `ubuntu-latest` with Node.js 20:

1. **Checkout** — clones the repository
2. **Setup Node.js 20** — configures Node.js via `actions/setup-node@v4`
3. **Install dependencies** — `npm ci` in `functions/`
4. **Run lint** — `npm run lint` (ESLint with flat config, CommonJS + ESM source types)
5. **Run tests** — `npm test` (Vitest with `globals: true`, Node environment)

### Integration tests in CI

Integration tests (e.g., `src/schemas/__tests__/pregnancy_data.integration.test.js`) gracefully **skip** when no Firestore backend is available. The CI environment does not run a Firestore emulator, so these tests are automatically skipped — they produce no failures. Unit tests run as normal and must all pass for the workflow to succeed.

### Merge gate

The workflow status check must pass before merging to `main`. PRs with failing lint or unit tests cannot be merged.

---

## Data Layer

For information about the Firestore schema and collections deployed alongside the Functions, see [`docs/firestore-schema.md`](firestore-schema.md).

---

## Troubleshooting

### `401 UNAUTHENTICATED` on Verify Scripts

The script cannot authenticate with Firestore. Use the emulator to run locally without credentials:

```bash
cd functions && npx firebase emulators:exec --only firestore --project mamabot-97d22 "npm run verify:users-schema"
```

Or set a service account key:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

### `firebase: command not found`

`firebase-tools` is listed as a devDependency — prefer using `npx`:

```bash
cd functions && npx firebase --version
```

If you installed globally and still get this error:

```bash
npm install -g firebase-tools
```

### Deploy fails with "unauthenticated"

Run `firebase login` again to refresh your credentials.

### Function returns 500 after deploy

1. Check runtime config is set:

   ```bash
   firebase functions:config:get
   ```

2. Check function logs:

   ```bash
   firebase functions:log
   ```

### Webhook registration fails

- Ensure the function is fully deployed (wait for the deploy command to complete)
- Verify the region in the curl command matches the function's deployment region (default: `us-central1`)
- Confirm the Telegram token is configured (see [Telegram Bot Token Configuration](#telegram-bot-token-configuration))

### Emulator Won't Start ("Java not found")

The Firestore emulator requires Java 17+. Install it:

```bash
# Ubuntu / Debian
sudo apt-get install openjdk-17-jdk

# macOS (Homebrew)
brew install --cask temurin@17
```

### `FIRESTORE_EMULATOR_HOST` Not Set

When running scripts manually (without `emulators:exec`), export the variable explicitly:

```bash
export FIRESTORE_EMULATOR_HOST=localhost:8080
npm run verify:users-schema
```

### Port 8080 Already in Use

Kill the process occupying port 8080, or change the emulator port in [`firebase.json`](../firebase.json):

```json
{
  "emulators": {
    "firestore": {
      "port": 8081
    }
  }
}
```

Then update `FIRESTORE_EMULATOR_HOST` to match:

```bash
export FIRESTORE_EMULATOR_HOST=localhost:8081
```

### Timestamp Validation Skipped (REST API Mode)

When `verify:users-schema` falls back to the Firebase CLI REST API path (no emulator, no service account), `serverTimestamp` fields (`createdAt`, `updatedAt`) are skipped because the Firestore REST API cannot set `FieldValue.serverTimestamp()`. This is expected and non-blocking. Use the emulator for full timestamp validation:

```bash
cd functions && npx firebase emulators:exec --only firestore --project mamabot-97d22 "npm run verify:users-schema"
```

---

## Related Documentation

- [Firestore Schema](firestore-schema.md) — collection structure, validation, and indexes
- [Internationalization (i18n)](i18n.md) — locale files and translation functions
