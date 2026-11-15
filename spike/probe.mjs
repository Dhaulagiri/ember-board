import { chromium } from "playwright"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
await page.goto("http://localhost:5320/spike.html")
const out = {}
for (const name of ["Ember", "Ember + @ui-sdk/ember"]) {
  const section = page.locator(`section[data-column="${name}"]`)
  await section.locator("[data-run]").click()
  await page.waitForFunction((n) => /Rendered|error/.test(document.querySelector(`section[data-column="${n}"] [data-status]`).textContent), name, { timeout: 20000 })
  const rendered = await section.locator("[data-status]").textContent()
  await section.locator("[data-score]").click()
  await page.waitForFunction((n) => /problems|error/.test(document.querySelector(`section[data-column="${n}"] [data-status]`).textContent), name, { timeout: 30000 })
  out[name] = { rendered, scored: await section.locator("[data-status]").textContent(), results: (await section.locator("[data-results]").innerText()).slice(0, 1500) }
}
await page.screenshot({ path: process.argv[2], fullPage: true })
console.log(JSON.stringify({ errors, ...out }, null, 1))
await browser.close()
