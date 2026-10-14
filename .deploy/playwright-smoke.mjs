import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("data:text/html,ok");
console.log(await page.textContent("body"));
await browser.close();
