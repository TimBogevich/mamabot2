const {onRequest} = require("firebase-functions/v2/https");
const {TELEGRAM_API, TELEGRAM_TOKEN, sendMessage} = require("./src/utils/telegram");

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
      if (!update || !update.message || !update.message.text) {
        res.sendStatus(200);
        return;
      }

      const chatId = update.message.chat.id;
      const text = update.message.text;

      // Echo the user's message back (will be replaced by router in Step 6)
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
