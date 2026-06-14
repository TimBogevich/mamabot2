const {onRequest} = require("firebase-functions/v2/https");

const TELEGRAM_API = "https://api.telegram.org";
const TELEGRAM_TOKEN = "8780361867:AAEdAFfH380PXAAz3wKjFXVE0v95DKGgq-c";

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

      await sendMessage(chatId, text);

      res.sendStatus(200);
    } catch (err) {
      console.error("Error processing update:", err);
      res.sendStatus(200);
    }
  },
);

async function sendMessage(chatId, text) {
  const url = `${TELEGRAM_API}/bot${TELEGRAM_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id: chatId,
    text: text,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${err}`);
  }

  return response.json();
}

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
