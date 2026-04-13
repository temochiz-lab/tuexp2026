const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  try {
    await page.goto('http://localhost:8766/index.html?task=1&timeLimit=60', { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    console.log('Navigation note:', e.message);
  }

  await new Promise(r => setTimeout(r, 3000));

  const bodyHTML = await page.evaluate(() => document.body.innerHTML);
  console.log('--- Body HTML (first 3000 chars) ---');
  console.log(bodyHTML.substring(0, 3000));

  await browser.close();
})();
