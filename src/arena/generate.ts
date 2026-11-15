import type Anthropic from "@anthropic-ai/sdk"
import { buildParams, models, type Arm, type Model } from "./prompts"

type Stats = {
  seconds: number
  turns: number
  docsRead: string[]
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
  lines: number
  repaired: boolean
}

type BuildEvent =
  | { type: "text"; text: string }
  | { type: "docs"; component: string; section?: string }
  | { type: "turn"; stats: Stats }

type Build = {
  arm: Arm
  model: Model
  code: string
  stats: Stats
  messages: Anthropic.Beta.BetaMessageParam[]
}

let index: Promise<string> | undefined
const docsIndex = () =>
  (index ??= fetch("/docs/ember/llms.txt").then((response) => response.text()))

async function readDocs({
  component,
  section,
}: {
  component: string
  section?: string
}) {
  const name = component.toLowerCase().trim().replace(/\s+/g, "-")
  const response = await fetch(`/docs/ember/components/${name}.md`)
  if (!response.ok || response.headers.get("content-type")?.includes("html")) {
    return `No page for "${component}". The index lists every component.`
  }
  const page = await response.text()
  const parts = page.split(/^(?=## )/m)
  const titleOf = (part: string) => part.match(/^## (.+)$/m)?.[1]?.trim() ?? ""
  if (section) {
    const match = parts.find(
      (part) => titleOf(part).toLowerCase() === section.toLowerCase()
    )
    return match ?? `No section "${section}". Sections: ${parts.slice(1).map(titleOf).join(", ")}.`
  }
  const head = parts.filter((part, i) => i === 0 || ["Composition", "Usage"].includes(titleOf(part)))
  const rest = parts.slice(1).map(titleOf).filter((title) => !["Installation", "Composition", "Usage"].includes(title))
  return `${head.join("")}\nOther sections: ${rest.join(", ")}.`
}

const extractCode = (text: string) => {
  const blocks = [...text.matchAll(/```(?:gts|glimmer-ts|ts|typescript)?\n([\s\S]*?)```/g)]
  return blocks.at(-1)?.[1]?.trim() ?? ""
}

const emptyStats = (): Stats => ({
  seconds: 0,
  turns: 0,
  docsRead: [],
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  lines: 0,
  repaired: false,
})

async function clientFor(apiKey: string) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk")
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

// Runs turns until the model stops calling read_docs, then takes the last
// gts block of its reply as the file.
async function converse(
  build: Build,
  apiKey: string,
  onEvent: (event: BuildEvent) => void
) {
  const client = await clientFor(apiKey)
  const [inPrice, outPrice] = models[build.model].prices
  for (let turn = 0; turn < 12; turn++) {
    const started = performance.now()
    const stream = client.beta.messages.stream(
      buildParams({
        arm: build.arm,
        model: build.model,
        messages: build.messages,
        index: await docsIndex(),
      })
    )
    stream.on("text", (text) => onEvent({ type: "text", text }))
    let message: Anthropic.Beta.BetaMessage
    try {
      message = await stream.finalMessage()
    } catch (error) {
      const status = (error as { status?: number }).status
      throw new Error(
        status === 401
          ? "Anthropic didn't accept that API key."
          : status === 429
            ? "Rate limited by Anthropic. Wait a moment and try again."
            : (error as Error).message
      )
    }
    const { stats } = build
    stats.turns++
    stats.input += message.usage.input_tokens
    stats.output += message.usage.output_tokens
    stats.cacheRead += message.usage.cache_read_input_tokens ?? 0
    stats.cacheWrite += message.usage.cache_creation_input_tokens ?? 0
    stats.cost =
      (stats.input * inPrice +
        stats.cacheRead * inPrice * 0.1 +
        stats.cacheWrite * inPrice * 1.25 +
        stats.output * outPrice) /
      1_000_000
    stats.seconds += (performance.now() - started) / 1000
    onEvent({ type: "turn", stats })
    build.messages.push({ role: "assistant", content: message.content })
    if (message.stop_reason === "refusal") {
      throw new Error("Claude declined to build this.")
    }
    const calls = message.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use"
    )
    if (message.stop_reason !== "tool_use" || !calls.length) {
      const text = message.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
      build.code = extractCode(text)
      build.stats.lines = build.code ? build.code.split("\n").length : 0
      if (!build.code) {
        throw new Error("The reply had no gts block.")
      }
      return build
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const call of calls) {
      const input = call.input as { component: string; section?: string }
      onEvent({ type: "docs", ...input })
      stats.docsRead.push(input.section ? `${input.component}#${input.section}` : input.component)
      results.push({ type: "tool_result", tool_use_id: call.id, content: await readDocs(input) })
    }
    build.messages.push({ role: "user", content: results })
  }
  throw new Error("The build took too many turns.")
}

function startBuild(
  arm: Arm,
  prompt: string,
  options: { apiKey: string; model: Model; onEvent: (event: BuildEvent) => void }
) {
  const build: Build = {
    arm,
    model: options.model,
    code: "",
    stats: emptyStats(),
    messages: [{ role: "user", content: prompt }],
  }
  return converse(build, options.apiKey, options.onEvent)
}

function repairBuild(
  build: Build,
  error: string,
  options: { apiKey: string; onEvent: (event: BuildEvent) => void }
) {
  build.stats.repaired = true
  build.messages.push({
    role: "user",
    content: `That file failed:\n\n${error.slice(0, 2000)}\n\nFix it and reply with the whole file again.`,
  })
  return converse(build, options.apiKey, options.onEvent)
}

export { type Build, type BuildEvent, extractCode, readDocs, repairBuild, startBuild, type Stats }
