const {onRequest} = require("firebase-functions/v2/https");
const {TELEGRAM_API, TELEGRAM_TOKEN, sendMessage} = require("./src/utils/telegram");
const languageDialog = require("./src/handlers/onboarding/languageDialog");

exports.webhook = onRequest(
  {
    invoker: "public",
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

      // 1. Handle callback queries (inline button presses)
      if (update.callback_query) {
        const chatId = update.callback_query.message.chat.id;
        const data = update.callback_query.data;
        const from = update.callback_query.from;

        if (data === 'lang_ru' || data === 'lang_en') {
          const userInfo = {
            userId: String(from.id),
            firstName: from.first_name || '',
            lastName: from.last_name || '',
            username: from.username || '',
          };
          await languageDialog.handleLanguageChoice(chatId, data, userInfo);
        }

        res.sendStatus(200);
        return;
      }

      // 2. Early return for non-message updates
      if (!update.message || !update.message.text) {
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
    const url = `${TELEGRAM_API}/bot${TELEGRAM_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
    const response = await fetch(url);
    const data = await response.json();

    res.json({success: data.ok, description: data.description, webhookUrl});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
}

module.exports.registerWebhook = registerWebhook;
