import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1512, height: 920 }, deviceScaleFactor: 2 });
await page.goto('file:///workspace/design-to-email-flow/mock/queue-v3.html');
await page.waitForTimeout(1800);
await page.screenshot({ path: '/tmp/queue-v3-mock.png' });
await browser.close();
