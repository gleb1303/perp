
const axios = require('axios');

const BOT_TOKEN = '7745428995:AAF--CkAninhKlgLnaHKVRaS8OU5F95gXv4';
const CHAT_ID = '-1002289744801';

module.exports = async function sendToTelegram(text) {
  try {
    const res = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      text,
      chat_id: CHAT_ID,
      parse_mode: 'Markdown',
    });
    console.log("✅ Sent to Telegram");
  } catch (error) {
    console.error("❌ Failed to send:", error.message);
  }
}
