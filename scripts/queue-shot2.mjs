import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://localhost:8080/auth', { waitUntil: 'networkidle' });
await page.fill('#signin-email', process.env.QA_LOGIN_EMAIL);
await page.fill('#signin-password', process.env.QA_LOGIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL('**/queue', { timeout: 15000 });
await page.waitForTimeout(3000);
await page.keyboard.press('Escape');
await page.screenshot({ path: '/tmp/nq1-comfortable.png' });
// compact mode
await page.click('[title="Compact rows — see everything"]');
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/nq2-compact.png' });
// back to comfortable, expand first row
await page.click('[title="Comfortable rows"]');
await page.waitForTimeout(400);
const row = page.locator('.row-tile').first();
const box = await row.boundingBox();
await page.mouse.click(box.x + box.width - 14, box.y + box.height / 2);
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/nq3-expanded.png' });
await browser.close();
console.log('done');
