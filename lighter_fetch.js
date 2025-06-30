
const fs = require('fs');
const Tesseract = require('tesseract.js');

module.exports = async function fetchLighter() {
  const parseFunding = (text) => {
    const fundingMatch = text.match(/(\d\.\d{4})%/);
    return fundingMatch ? parseFloat(fundingMatch[1]) : null;
  };

  const parseSpreadPrices = (text) => {
    const lines = text.split(/\r?\n/).filter(l => /\d/.test(l));
    const spreadIndex = lines.findIndex(line => line.toLowerCase().includes('spread'));
    if (spreadIndex === -1 || spreadIndex < 1 || spreadIndex + 1 >= lines.length) return {};

    const fixNumber = (str) => {
      const cleaned = str.replace(/[^\d]/g, '');
      if (cleaned.length < 5) return null;
      return parseFloat(cleaned.slice(0, 2) + '.' + cleaned.slice(2));
    };

    const ask = fixNumber(lines[spreadIndex - 1]);
    const bid = fixNumber(lines[spreadIndex + 1]);

    return { ask, bid };
  };

  try {
    const image = './lighter_crop_spread.png';
    const result = await Tesseract.recognize(image, 'eng');
    const text = result.data.text;
    const funding = parseFunding(text);
    const { bid, ask } = parseSpreadPrices(text);
    return { source: 'lighter', funding, bid, ask };
  } catch (err) {
    console.error("OCR Error:", err);
    return { source: 'lighter', funding: null, bid: null, ask: null };
  }
};
