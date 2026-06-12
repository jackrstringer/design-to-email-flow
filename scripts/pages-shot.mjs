import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://localhost:8080/auth', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/p-auth.png' });
await page.fill('#signin-email', process.env.QA_LOGIN_EMAIL);
await page.fill('#signin-password', process.env.QA_LOGIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL('**/queue', { timeout: 15000 });
for (const p of ['brands','segments','analytics','settings']) {
  await page.goto('http://localhost:8080/'+p, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/p-${p}.png` });
}
await browser.close();
console.log('done');
