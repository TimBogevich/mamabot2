const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret} = require("firebase-functions/params");
const {TELEGRAM_API, getTelegramToken, sendMessage} = require("./src/utils/telegram");
const { routeCallback } = require('./src/handlers/router');
const languageDialog = require("./src/handlers/onboarding/languageDialog");
const { getUser } = require('./src/collections/users');

// ---------------------------------------------------------------------------
// Graceful degradation — FN-007 (editEdd handler) may not be merged yet
// ---------------------------------------------------------------------------

/** @type {((chatId: number|string, text: string) => Promise<Object>)|null} */
let _handleEditEddInput = null;
try {
  _handleEditEddInput = require('./src/handlers/onboarding/editEdd').handleEditEddInput;
} catch (_err) {
  // FN-007 ещё не смержен — текстовый ввод ПДР будет обработан как echo
}

const TELEGRAM_TOKEN = defineSecret("TELEGRAM_TOKEN");

// ---------------------------------------------------------------------------
// Graceful degradation — sendWeeklyNotifications handler may not be ready
// ---------------------------------------------------------------------------

/** @type {(() => Promise<{checked: number, notified: number}>)|null} */
let _sendWeeklyNotifications = null;
try {
  _sendWeeklyNotifications = require('./src/handlers/notifications/sendWeekly').sendWeeklyNotifications;
} catch (_err) {
  // FN-020 handler not yet available — scheduled function will log a warning
}

exports.webhook = onRequest(
  {
    invoker: "public",
    secrets: [TELEGRAM_TOKEN],
  },
  async (req, res) => {
    if (req.method === "GET") {
      return registerWebhook(req, res);
    }
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const update = req.body;

      // 1. Обработка callback_query (inline-кнопки)
      if (update.callback_query) {
        const chatId = update.callback_query.message.chat.id;
        const callbackData = update.callback_query.data;
        const from = update.callback_query.from;

        await routeCallback(chatId, callbackData, {
          callbackQueryId: update.callback_query.id,
          from: from,
        });

        res.sendStatus(200);
        return;
      }

      // 2. Ранний выход для не-сообщений
      if (!update || !update.message || !update.message.text) {
        res.sendStatus(200);
        return;
      }

      const chatId = update.message.chat.id;
      const text = update.message.text;

      // 3. Handle /start command
      if (update.message.text === '/start') {
        await languageDialog.askLanguage(chatId);
        res.sendStatus(200);
        return;
      }

      // 3.5: Route text messages based on onboarding state
      if (_handleEditEddInput) {
        try {
          const user = await getUser(chatId);
          if (user && user.onboardingState === 'awaiting_edd') {
            await _handleEditEddInput(chatId, text);
            res.sendStatus(200);
            return;
          }
        } catch (_err) {
          // Firestore read failed or handler threw — fall through to echo
          console.warn('[webhook] onboardingState routing error:', _err.message);
        }
      }

      // 4. Echo fallback for all other text messages
      await sendMessage(chatId, text);

      res.sendStatus(200);
    } catch (err) {
      console.error("Error processing update:", err);
      res.sendStatus(200);
    }
  },
);



// ---------------------------------------------------------------------------
// Scheduled: weekly notification check
// ---------------------------------------------------------------------------

exports.sendWeeklyNotifications = onSchedule(
  {
    schedule: 'every day 09:00',
    timeZone: 'Europe/Moscow',
  },
  async (_event) => {
    if (!_sendWeeklyNotifications) {
      console.warn('[sendWeeklyNotifications] Handler not loaded — skipping run');
      return;
    }

    try {
      const result = await _sendWeeklyNotifications();
      console.log('[sendWeeklyNotifications] Completed:', JSON.stringify(result));
      return result;
    } catch (err) {
      console.error('[sendWeeklyNotifications] Error:', err.message);
    }
  },
);

async function registerWebhook(req, res) {
  const webhookUrl = `https://${req.headers.host}/webhook`;

  try {
    const url = `${TELEGRAM_API}/bot${getTelegramToken()}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
    const response = await fetch(url);
    const data = await response.json();

    res.json({success: data.ok, description: data.description, webhookUrl});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
}

module.exports.registerWebhook = registerWebhook;
