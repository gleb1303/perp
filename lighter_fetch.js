
const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

async function extractTextFromImage(imagePath) {
  const { data: { text } } = await Tesseract.recognize(
    imagePath,
    'eng',
    { logger: m => {} }
  );
  return text;
}

// Вставляет точку после двух первых цифр, если она отсутствует
function normalizePrice(str) {
  if (!str.includes('.') && /^\d{6}$/.test(str)) {
    return parseFloat(str.slice(0, 2) + '.' + str.slice(2));
  }
  return parseFloat(str);
}

// Funding
function parseFunding(text) {
  const match = text.match(/([0\.]{0,2}\d{1,5})%/);
  return match ? parseFloat(match[1].replace(/^0+/, '0')) / 100 : null;
}

// Bid/Ask от Spread с фильтрацией + нормализацией
function parsePricesAroundSpread(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const i = lines.findIndex(l => /spread/i.test(l));
  if (i <= 0 || i >= lines.length - 1) return { bid: null, ask: null };

  const askLine = lines[i - 1].match(/\d{2}\.\d{4}|\d{6}/);
  const bidLine = lines[i + 1].match(/\d{2}\.\d{4}|\d{6}/);

  const ask = askLine ? normalizePrice(askLine[0]) : null;
  const bid = bidLine ? normalizePrice(bidLine[0]) : null;

  if (ask && bid && Math.abs(ask - bid) > 0.1) {
    return { bid, ask: null };
  }

  return { ask, bid };
}

(async () => {
  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('https://app.lighter.xyz/trade/HYPE', { waitUntil: 'networkidle2' });

  await new Promise(resolve => setTimeout(resolve, 8000));

  const fundingPath = path.join(screenshotDir, 'lighter_crop_top.png');
  await page.screenshot({
    path: fundingPath,
    clip: { x: 500, y: 40, width: 1000, height: 90 }
  });

  const spreadPath = path.join(screenshotDir, 'lighter_crop_spread.png');
  await page.screenshot({
    path: spreadPath,
    clip: { x: 1270, y: 420, width: 260, height: 140 }
  });

  await browser.close();

  const ocrFunding = await extractTextFromImage(fundingPath);
  const ocrSpread = await extractTextFromImage(spreadPath);

  const funding = parseFunding(ocrFunding);
  const { bid, ask } = parsePricesAroundSpread(ocrSpread);

  const result = {
    source: "lighter",
    funding,
    bid,
    ask
  };

  fs.writeFileSync(path.join(screenshotDir, 'lighter_data.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(screenshotDir, 'raw_funding.txt'), ocrFunding);
  fs.writeFileSync(path.join(screenshotDir, 'raw_spread.txt'), ocrSpread);

  console.log("✅ Extracted from Lighter:", result);
})();
