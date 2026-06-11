import { chromium } from '@playwright/test';

const [, , url, out, storage] = process.argv;
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  ...(storage ? { storageState: storage } : {}),
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
