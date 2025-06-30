
const fetchLighter = require('./lighter_fetch');
const fetchExtended = require('./extended_fetch');
const fetchHyperliquid = require('./hyperliquid_fetch');
const sendToTelegram = require('./telegram');

(async () => {
  const lighter = await fetchLighter();
  const extended = await fetchExtended();
  const hyper = await fetchHyperliquid();

  const fundingDelta = (a, b) => (a && b ? ((a - b) * 100).toFixed(2) : 'null');

  const lighterExtended = fundingDelta(lighter.funding, extended.funding);
  const extendedLighter = fundingDelta(extended.funding, lighter.funding);
  const lighterHyper = fundingDelta(lighter.funding, hyper.funding);
  const hyperLighter = fundingDelta(hyper.funding, lighter.funding);

  const message = `
📊 *HYPE-USD Lighter*
🟢 Bid: ${lighter.bid ?? '–'}
🔴 Ask: ${lighter.ask ?? '–'}
💸 Funding: ${(lighter.funding ?? 0).toFixed(4)}% (${((lighter.funding ?? 0) * 8760 / 100).toFixed(2)}% APY)

📐 *Lighter vs Extended*
💸 Funding Δ: ${fundingDelta(lighter.funding, extended.funding)}%
🔴⬇️ Lighter → Extended: ${lighterExtended}%
🔴⬇️ Extended → Lighter: ${extendedLighter}%

📐 *Lighter vs Hyperliquid*
💸 Funding Δ: ${fundingDelta(lighter.funding, hyper.funding)}%
🔴⬇️ Lighter → Hyperliquid: ${lighterHyper}%
🔴⬇️ Hyperliquid → Lighter: ${hyperLighter}%
`.trim();

  console.log("📨 Sending message...");
  await sendToTelegram(message);
})();
