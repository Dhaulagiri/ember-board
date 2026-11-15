import { chromium } from "playwright"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
await page.goto("http://localhost:5320/arena.html")
const docs = await page.evaluate(async () => {
  const { readDocs } = await import("/src/arena/generate.ts")
  const overview = await readDocs({ component: "Select" })
  const section = await readDocs({ component: "select", section: "forms" })
  const missing = await readDocs({ component: "kanban" })
  const badSection = await readDocs({ component: "tabs", section: "Nope" })
  return {
    overviewChars: overview.length,
    overviewHasUsage: overview.includes("## Usage"),
    overviewTail: overview.slice(-160),
    sectionStart: section.slice(0, 40),
    missing,
    badSection: badSection.slice(0, 120),
  }
})
await page.getByLabel("Anthropic API key").fill("sk-ant-invalid-demo-key")
await page.getByRole("button", { name: "Build both" }).click()
await page.locator(".scorecard:not([hidden])").waitFor({ timeout: 60000 })
const states = await page.locator(".state").allInnerTexts()
console.log(JSON.stringify({ errors, docs, states }, null, 1))
await browser.close()
