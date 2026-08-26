const TelegramModule = require('node-telegram-bot-api');
const TelegramBot = TelegramModule.default || TelegramModule;
const db = require('../db/db');
require('dotenv').config();

const token = process.env.TELEGRAM_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// Skip polling when running locally alongside another instance (e.g., VPS)
// to avoid Telegram 409 Conflict errors. Usage: node src/index.js --no-telegram
const TELEGRAM_ENABLED = !process.argv.includes('--no-telegram');

const bot = new TelegramBot(token, { polling: TELEGRAM_ENABLED });

function sendTelegramMessage(text) {
    if (!token || !chatId) {
        console.warn('⚠️ Telegram Token or Chat ID is missing in .env');
        return;
    }
    if (!TELEGRAM_ENABLED) return;
    bot.sendMessage(chatId, text, { parse_mode: 'HTML' })
        .catch(err => console.error('[TELEGRAM ERROR]', err.message));
}

// Escape karakter yang dianggap entitas HTML oleh Telegram (fail-safe format)
function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

if (TELEGRAM_ENABLED) {
    bot.onText(/\/balance/, (msg) => {
        if (msg.chat.id.toString() !== chatId) return;

        try {
            const wallet = db.prepare('SELECT * FROM wallet').all();
            let reply = '💰 *Current Dummy Wallet*\n\n';

            wallet.forEach(w => {
                reply += `- *${w.asset}*: ${w.balance.toFixed(4)}\n`;
            });

            bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
        } catch (error) {
            bot.sendMessage(chatId, `❌ Error reading balance: ${error.message}`);
        }
    });

    bot.onText(/\/status/, (msg) => {
        if (msg.chat.id.toString() !== chatId) return;

        try {
            const positions = db.prepare("SELECT * FROM active_positions WHERE status = 'OPEN'").all();

            if (positions.length === 0) {
                return bot.sendMessage(chatId, '🟢 *No active positions right now.*', { parse_mode: 'Markdown' });
            }

            let reply = '📊 *Active Positions*\n';
            positions.forEach(p => {
                reply += `\n*${p.pair}*\n`;
                reply += `Buy Price: ${p.buy_price}\n`;
                reply += `Target TP: ${p.target_tp} 🎯\n`;
                reply += `Target SL: ${p.target_sl} 🛑\n`;
                reply += `Coin Amount: ${p.amount_coin.toFixed(6)}\n`;
            });

            bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
        } catch (error) {
            bot.sendMessage(chatId, `❌ Error reading status: ${error.message}`);
        }
    });
}

module.exports = {
    sendTelegramMessage,
    escapeHtml
};
