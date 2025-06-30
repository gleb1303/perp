const axios = require('axios');
const fetchLighterData = require('./lighter_fetch_test'); // Обязательно корректное имя и экспорт

const SYMBOL_EXT = 'HYPE-USD';
const SYMBOL_HL = 'HYPE';

const EXT_API = 'https://api.extended.exchange/api/v1/public/markets';
const HL_API = 'https://api.hyperliquid.xyz/info';

function formatFunding(value) {
  return `${value.toFixed(4)}% (${(value * 24 * 365).toFixed(2)}% APY)`;
}

function formatSpread(v) {
  const percent = (v * 100).toFixed(4);
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

async function fetchExtended() {
  try {
    const res = await axios.get(EXT_API);
    const market = res.data[SYMBOL_EXT];
    if (!market) throw new Error(`Market ${SYMBOL_EXT} not found`);

    const { bidPrice, askPrice, fundingRate } = market.marketStats;

    return {
      source: 'extended',
      bid: parseFloat(bidPrice),
      ask: parseFloat(askPrice),
      funding: parseFloat(fundingRate) * 100
    };
  } catch (err) {
    console.error('❌ Extended fetch error:', err.message);
    return { source: 'extended', bid: null, ask: null, funding: null };
  }
}

async function fetchHyperliquid() {
  try {
    const res = await axios.post(HL_API, {
      type: 'metaAndAssetMetadata'
    });

    const assets = res.data?.universe || [];
    const market = assets.find(a => a.name === SYMBOL_HL);
    if (!market) throw new Error(`Market ${SYMBOL_HL} not found`);

    return {
      source: 'hyperliquid',
      bid: parseFloat(market.markets.bid),
      ask: parseFloat(market.markets.ask),
      funding: parseFloat(market.markets.fundingRate) * 100
    };
  } catch (err) {
    console.error('❌ Hyperliquid fetch error:', err.message);
    return { source: 'hyperliquid', bid: null, ask: null, funding: null };
  }
}

function calculateComparison(source1, source2) {
  const deltaFunding = source1.funding - source2.funding;
  const spreadEntry = (source2.ask - source1.bid) / source2.ask;
  const spreadExit = (source1.ask - source2.bid) / source1.ask;

  return {
    fundingDelta: formatSpread(deltaFunding),
    entrySpread: formatSpread(spreadEntry),
    exitSpread: formatSpread(spreadExit)
  };
}

async function main() {
  const [ext, hl, lighter] = await Promise.all([
    fetchExtended(),
    fetchHyperliquid(),
    fetchLighterData()
  ]);

  // Display Lighter
  console.log(`📊 HYPE-USD (Lighter)`);
  console.log(`🟢 Bid: ${lighter.bid ?? '–'}`);
  console.log(`🔴 Ask: ${lighter.ask ?? '–'}`);
  console.log(`💸 Funding: ${formatFunding(lighter.funding || 0)}`);
  console.log();

  // Compare vs Extended
  const compExt = calculateComparison(lighter, ext);
  console.log(`📐 Lighter vs Extended`);
  console.log(`💸 Funding Δ: ${compExt.fundingDelta}`);
  console.log(`🔄 Entry Spread: ${compExt.entrySpread}`);
  console.log(`🔄 Exit Spread: ${compExt.exitSpread}`);
  console.log();

  // Compare vs Hyperliquid
  const compHl = calculateComparison(lighter, hl);
  console.log(`📐 Lighter vs Hyperliquid`);
  console.log(`💸 Funding Δ: ${compHl.fundingDelta}`);
  console.log(`🔄 Entry Spread: ${compHl.entrySpread}`);
  console.log(`🔄 Exit Spread: ${compHl.exitSpread}`);
}

main();
