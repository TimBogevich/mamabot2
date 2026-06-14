# Deployment Guide

This document describes how to deploy the MamaBot Telegram bot Firebase Functions to production, including required secrets, manual steps, and CI/CD automation.

---

## Prerequisites

- **Node.js 20+** — the Functions runtime is `nodejs20` (see [`firebase.json`](../firebase.json))
- **Firebase CLI** — install globally if not already present:

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

---

## Manual Deployment

From the `functions/` directory, run:

```bash
npm run deploy
```

This executes `firebase deploy --only functions`, which deploys only the Cloud Functions defined in `functions/index.js`. The `--only functions` flag prevents accidental deployment of other Firebase products (Firestore rules, Hosting, etc.).

**Equivalent one-liner** (from repo root):

```bash
cd functions && npm run deploy
```

**Direct command** (if not using npm scripts):

```bash
firebase deploy --only functions
```

### What gets deployed

The Functions source directory is `functions/` as declared in [`firebase.json`](../firebase.json). The deploy process:
1. Installs production dependencies (`npm ci --production`)
2. Bundles the source
3. Uploads to Firebase Cloud Functions (runtime: `nodejs20`)
4. Makes the functions available at Firebase-assigned HTTPS endpoints

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

### Deploy fails with "unauthenticated"

Run `firebase login` again to refresh your credentials.

### Function returns 500 after deploy

Check the runtime config is set:

```bash
firebase functions:config:get
```

Then check function logs:

```bash
firebase functions:log
```

### Webhook registration fails

Ensure the function is fully deployed and the URL is correct. Verify the region in the curl command matches the function's deployment region.