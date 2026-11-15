import { chromium } from "playwright"
const base = process.argv[2] ?? "http://localhost:5320"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1300, height: 1400 } })
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
await page.goto(`${base}/arena.html?replay=sample`)
await page.getByRole("button", { name: "Build both" }).click()
await page.locator(".scorecard:not([hidden])").waitFor({ timeout: 60000 })
const card = await page.locator(".scorecard").innerText()
const problems = await page.locator(".problems").innerText()
await page.screenshot({ path: process.argv[3], fullPage: true })
console.log(JSON.stringify({ errors }), "\n" + card, "\n---\n" + problems)
await browser.close()
