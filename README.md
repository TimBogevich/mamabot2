# MamaBot — Telegram Pregnancy Bot

Telegram bot for pregnancy week-by-week tracking, mood logging, nutrition tracking, and partner linking, powered by Firebase Cloud Functions and Firestore.

## Documentation

| Document | Description |
|----------|-------------|
| [Deployment Guide](docs/deployment.md) | Prerequisites, manual deployment, CI/CD, secrets, emulator usage, verify scripts |
| [Firestore Schema](docs/firestore-schema.md) | Collections: pregnancy_data, users, mood_logs, nutrition_logs, partners; security rules; indexes |
| [Internationalization](docs/i18n.md) | Locale files, t()/setLanguage() API, key contracts |

## Quick Start

- See [AGENTS.md](AGENTS.md) for project overview and agent instructions
- CI pipeline: [`.github/workflows/test.yml`](.github/workflows/test.yml)
- Functions package: `functions/` directory