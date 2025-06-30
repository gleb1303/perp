require('dotenv').config();
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

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
  const frAPY = fr * 8760 * 100;

  return {
    bid,
    ask,
    fr,
    frAPY,
    text: `📈 *${SYMBOL_EXT}* (Extended)\n` +
          `🟢 Bid: *${bid.toFixed(3)}*\n` +
          `🔴 Ask: *${ask.toFixed(3)}*\n` +
          `💸 Funding: *${(fr * 100).toFixed(4)}%* (${frAPY.toFixed(2)}% APY)`
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
  const frAPY = fr * 8760 * 100;

  return {
    bid,
    ask,
    fr,
    frAPY,
    text: `📈 *${SYMBOL_HL}* (Hyperliquid)\n` +
          `🟢 Bid: *${bid.toFixed(3)}*\n` +
          `🔴 Ask: *${ask.toFixed(3)}*\n` +
          `💸 Funding: *${(fr * 100).toFixed(4)}%* (${frAPY.toFixed(2)}% APY)`
  };
}

function fmtPercent(val) {
  const num = parseFloat(val);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(4)}%`;
}

function normalizePrice(str) {
  if (!str.includes('.') && /^\d{6}$/.test(str)) {
    return parseFloat(str.slice(0, 2) + '.' + str.slice(2));
  }
  return parseFloat(str);
}

function parseFunding(text) {
  const match = text.match(/([0\.]{0,2}\d{1,5})%/);
  return match ? parseFloat(match[1].replace(/^0+/, '0')) : null;
}

function parsePricesAroundSpread(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const i = lines.findIndex(l => /spread/i.test(l));
  if (i <= 0 || i >= lines.length - 1) return { bid: null, ask: null };

  const askLine = lines[i - 1].match(/\d{2}\.\d{4}|\d{6}/);
  const bidLine = lines[i + 1].match(/\d{2}\.\d{4}|\d{6}/);

  const ask = askLine ? normalizePrice(askLine[0]) : null;
  const bid = bidLine ? normalizePrice(bidLine[0]) : null;

  if (ask && bid && Math.abs(ask - bid) > 0.1) return { bid, ask: null };
  return { ask, bid };
}

async function extractTextFromImage(imagePath) {
  const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', { logger: m => {} });
  return text;
}

async function fetchLighterData() {
  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  await page.goto('https://app.lighter.xyz/trade/HYPE', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 8000));

  const fundingPath = path.join(screenshotDir, 'lighter_crop_top_test.png');
  await page.screenshot({ path: fundingPath, clip: { x: 500, y: 40, width: 1000, height: 90 } });
  const spreadPath = path.join(screenshotDir, 'lighter_crop_spread_test.png');
  await page.screenshot({ path: spreadPath, clip: { x: 1270, y: 420, width: 260, height: 140 } });
  await browser.close();

  const ocrFunding = await extractTextFromImage(fundingPath);
  const ocrSpread = await extractTextFromImage(spreadPath);

  const funding = parseFunding(ocrFunding);
  const { bid, ask } = parsePricesAroundSpread(ocrSpread);
  const frAPY = funding * 8760;

  return {
    bid,
    ask,
    fr: funding / 100,
    frAPY,
    text: `📈 *HYPE-USD* (Lighter)\n` +
          `🟢 Bid: *${bid ?? '-'}*\n` +
          `🔴 Ask: *${ask ?? '-'}*\n` +
          `💸 Funding: *${funding?.toFixed(4) ?? '0.0000'}%* (${frAPY.toFixed(2)}% APY)`
  };
}

async function tick() {
  try {
    const [ext, hl, lighter] = await Promise.all([
      fetchExtData(),
      fetchHLData(),
      fetchLighterData()
    ]);
    if (!ext || !hl || !lighter) return;

    const spreadL_Ext = ((ext.bid - lighter.ask) / lighter.ask) * 100;
    const spreadS_Ext = ((lighter.bid - ext.ask) / ext.ask) * 100;

    const spreadL_HL = ((hl.bid - lighter.ask) / lighter.ask) * 100;
    const spreadS_HL = ((lighter.bid - hl.ask) / hl.ask) * 100;

    const msg = [
      lighter.text,
      ext.text,
      hl.text,

      `\n\n📀 *Lighter vs EXT*` +
      `\n🟩 Lighter (🟢⬆️) / EXT(🔴⬇️): ${fmtPercent(spreadL_Ext)} (${fmtPercent(ext.frAPY - lighter.frAPY)} APY)` +
      `\n🔵 Lighter (🔴⬇️) / EXT(🟢⬆️): ${fmtPercent(spreadS_Ext)} (${fmtPercent(lighter.frAPY - ext.frAPY)} APY)`,

      `\n📀 *Lighter vs HL*` +
      `\n🟩 Lighter (🟢⬆️) / HL(🔴⬇️): ${fmtPercent(spreadL_HL)} (${fmtPercent(hl.frAPY - lighter.frAPY)} APY)` +
      `\n🔵 Lighter (🔴⬇️) / HL(🟢⬆️): ${fmtPercent(spreadS_HL)} (${fmtPercent(lighter.frAPY - hl.frAPY)} APY)`
    ].join('\n\n');

    await sendTelegram(msg);
  } catch (e) {
    console.error('❌ tick() error:', e);
  }
}

tick();
setInterval(tick, 30000);
