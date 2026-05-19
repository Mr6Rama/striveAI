// Run once to register the Telegram webhook URL with the Bot API.
// Usage: node scripts/set-telegram-webhook.js
// Reads APP_BASE_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET from environment.
// Never prints the bot token or webhook secret.

require('dotenv').config();

const BASE_URL       = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
const BOT_TOKEN      = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

function fail(msg) {
  console.error(`[set-telegram-webhook] ERROR: ${msg}`);
  process.exit(1);
}

if (!BOT_TOKEN)      fail('TELEGRAM_BOT_TOKEN is not set in environment');
if (!BASE_URL)       fail('APP_BASE_URL is not set in environment');
if (!WEBHOOK_SECRET) fail('TELEGRAM_WEBHOOK_SECRET is not set in environment');

if (!BASE_URL.startsWith('https://')) {
  fail(`APP_BASE_URL must start with https:// (got: ${BASE_URL.replace(/^https?:\/\//, 'https://...')})`);
}

const webhookUrl = `${BASE_URL}/api/telegram/webhook`;
const apiUrl     = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;

console.log(`[set-telegram-webhook] Setting webhook to: ${webhookUrl}`);

fetch(apiUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url:          webhookUrl,
    secret_token: WEBHOOK_SECRET,
    // Only receive message updates — reduces noise.
    allowed_updates: ['message'],
  }),
})
  .then((resp) => {
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  })
  .then((data) => {
    if (data.ok) {
      console.log(`[set-telegram-webhook] OK: ${data.description || 'webhook set'}`);
    } else {
      console.error(`[set-telegram-webhook] Telegram error: ${data.description || JSON.stringify(data)}`);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error(`[set-telegram-webhook] Request failed: ${err.message}`);
    process.exit(1);
  });
