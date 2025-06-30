require('dotenv').config();
const fetch = require('node-fetch');

const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

const SYMBOL_EXT = 'HYPE-USD';
const SYMBOL_HL = 'HYPE';

const EXT_API = 'https://api.extended.exchange/api/v1/info/markets';
const HL_API = 'https://api.hyperliquid.xyz/info';

async function sendTelegram(text) {
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: 'Markdown' })
  });
  const json = await res.json();
  if (!json.ok) console.error('❌ Telegram error', json);
}

async function fetchExtData() {
  const res = await fetch(EXT_API);
  const raw = await res.json();
  const markets = Array.isArray(raw) ? raw : raw.markets || raw.data;
  const m = markets.find(x => x.name === SYMBOL_EXT);
  if (!m?.marketStats) return null;

  const s = m.marketStats;
  const bid = parseFloat(s.bidPrice);
  const ask = parseFloat(s.askPrice);
  const fr = parseFloat(s.fundingRate);
  const frPct = (fr * 100).toFixed(4);
  const frAPY = (fr * 8760 * 100).toFixed(2);

  return {
    bid,
    ask,
    fr,
    text: `📊 *${SYMBOL_EXT}* (Extended)\n` +
          `🟢 Bid: *${bid.toFixed(3)}*\n` +
          `🔴 Ask: *${ask.toFixed(3)}*\n` +
          `💸 Funding: *${frPct}%* (${frAPY}% APY)`
  };
}

async function fetchHLData() {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' })
  });
  const [meta, assetCtxs] = await res.json();
  const i = meta.universe.findIndex(a => a.name === SYMBOL_HL);
  if (i < 0 || !assetCtxs[i]) return null;

  const ctx = assetCtxs[i];
  const mid = parseFloat(ctx.midPx);
  const bid = mid - 0.01;
  const ask = mid + 0.01;
  const fr = parseFloat(ctx.funding);
  const frPct = (fr * 100).toFixed(4);
  const frAPY = (fr * 8760 * 100).toFixed(2);

  return {
    bid,
    ask,
    fr,
    text: `📊 *${SYMBOL_HL}* (Hyperliquid)\n` +
          `🟢 Bid: *${bid.toFixed(3)}*\n` +
          `🔴 Ask: *${ask.toFixed(3)}*\n` +
          `💸 Funding: *${frPct}%* (${frAPY}% APY)`
  };
}

function fmtPercent(val) {
  const num = parseFloat(val);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(4)}%`;
}

function fmtColorArrow(value, side) {
  const color = value < 0 ? '🟩' : '🟥';
  const label = side === 'long'
    ? 'EXT (🟢⬆️) / HL (🔴⬇️)'
    : 'EXT (🔴⬇️) / HL (🟢⬆️)';
  return `${color} ${label}: ${fmtPercent(value)}`;
}

async function tick() {
  try {
    const [ext, hl] = await Promise.all([fetchExtData(), fetchHLData()]);
    if (!ext || !hl) return;

    const fundingSpreadHr = ext.fr - hl.fr;
    const fundingSpreadAPY = fundingSpreadHr * 8760 * 100;

    const fundingText = `📐 *Funding Spread:*\n` +
      `🟢 EXT Long / HL Short: ${fmtPercent(fundingSpreadHr * 100)} (${fmtPercent(fundingSpreadAPY)} APY)`;

    const spreadLongPct = ((hl.bid - ext.ask) / ext.ask) * 100;
    const spreadShortPct = ((ext.bid - hl.ask) / hl.ask) * 100;

    const entryText = `📈 *Entry/Exit Spread (%):*\n` +
      fmtColorArrow(spreadLongPct, 'long') + '\n' +
      fmtColorArrow(spreadShortPct, 'short');

    const finalMessage = [ext.text, hl.text, fundingText, entryText].join('\n\n');
    await sendTelegram(finalMessage);

  } catch (e) {
    console.error('❌ tick() error:', e.message);
  }
}

tick();
setInterval(tick, 10000); // каждые 10 секунд
