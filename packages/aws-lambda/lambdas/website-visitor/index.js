/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

const puppeteer = require('puppeteer');
const dotenv = require('dotenv');

dotenv.config();

const websiteUrl = process.env.WEBSITE_URL;

if (!websiteUrl) {
  console.error('Please provide the WEBSITE_URL via .env or environment variable.');
  process.exit(1);
}
console.log(`Using remote URL: ${websiteUrl}`);

// The default delay between calls is 3 minutes.
let delay = 3 * 60 * 1000;
if (process.env.DELAY) {
  if (!isNaN(parseInt(process.env.DELAY, 10))) {
    delay = parseInt(process.env.DELAY, 10);
  } else {
    console.error(`Could not parse DELAY ${process.env.DELAY}, using default value.`);
  }
}
console.log(`Using delay between calls: ${delay} ms`);

(async () => {
  await loop();
})();

async function loop() {
  try {
    await accessPage();
  } catch (e) {
    console.error(e);
  } finally {
    // access page every three minutes
    setTimeout(loop, Math.round(delay));
  }
}

async function accessPage() {
  const browser = await puppeteer.launch({
    ignoreHTTPSErrors: true,
    args: process.env.DOCKER === 'true' ? ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox'] : []
  });

  try {
    const page = await browser.newPage();
    await page.goto(`${websiteUrl}`);
    await asyncSleep(5000);
  } finally {
    // close browser
    await browser.close();
  }
}

function asyncSleep(duration) {
  return new Promise(resolve => setTimeout(resolve, duration));
}
