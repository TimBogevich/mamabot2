const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {TELEGRAM_API, getTelegramToken, sendMessage} = require("./src/utils/telegram");
const { routeCallback } = require('./src/handlers/router');
const languageDialog = require("./src/handlers/onboarding/languageDialog");

const TELEGRAM_TOKEN = defineSecret("TELEGRAM_TOKEN");

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

      // 4. Echo fallback for all other text messages
      await sendMessage(chatId, text);

      res.sendStatus(200);
    } catch (err) {
      console.error("Error processing update:", err);
      res.sendStatus(200);
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
