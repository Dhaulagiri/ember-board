import type Anthropic from "@anthropic-ai/sdk"
import type { createAgent } from "ember-ui-sdk/agent"
import { agentTools } from "ember-ui-sdk/agent"
import { agentParams, type AgentRequest } from "../shared/agent-request"

type Agent = ReturnType<typeof createAgent>

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: string; [key: string]: unknown }

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

type AgentEvent =
  | { type: "call"; name: string; input: unknown; ms: number }
  | { type: "result"; name: string; ok: boolean; summary: string }
  | { type: "reply"; text: string }
  | { type: "error"; text: string }
  | { type: "usage"; usage: Usage; model: string }

const prices: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
}

const costOf = (model: string, usage: Usage) => {
  const [input, output] = prices[model] ?? [0, 0]
  return (
    (usage.input_tokens * input +
      (usage.cache_read_input_tokens ?? 0) * input * 0.1 +
      (usage.cache_creation_input_tokens ?? 0) * input * 1.25 +
      usage.output_tokens * output) /
    1_000_000
  )
}

const summarize = (result: unknown) => {
  const text = JSON.stringify(result)
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
}

let browserClient: { key: string; client: Anthropic } | undefined

async function ask(request: AgentRequest, apiKey: string) {
  if (apiKey) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    if (browserClient?.key !== apiKey) {
      browserClient = {
        key: apiKey,
        client: new Anthropic({ apiKey, dangerouslyAllowBrowser: true }),
      }
    }
    try {
      return await browserClient.client.messages.create(agentParams(request))
    } catch (error) {
      throw new Error(
        error instanceof Anthropic.AuthenticationError
          ? "Anthropic didn't accept that API key."
          : error instanceof Error
            ? error.message
            : String(error)
      )
    }
  }
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  })
  const message = await response.json()
  if (!response.ok) {
    throw new Error(message.error ?? response.statusText)
  }
  return message
}

async function runAgent(
  agent: Agent,
  task: string,
  {
    model,
    apiKey,
    onEvent,
  }: { model: string; apiKey: string; onEvent: (event: AgentEvent) => void }
) {
  const messages: { role: "user" | "assistant"; content: unknown }[] = [
    { role: "user", content: task },
  ]
  for (let turn = 0; turn < 20; turn++) {
    const started = performance.now()
    let message
    try {
      message = await ask(
        { model, messages, tools: agentTools } as AgentRequest,
        apiKey
      )
    } catch (error) {
      onEvent({ type: "error", text: (error as Error).message })
      return
    }
    onEvent({ type: "usage", usage: message.usage, model })
    messages.push({ role: "assistant", content: message.content })
    const calls = (message.content as Block[]).filter(
      (block): block is Extract<Block, { type: "tool_use" }> =>
        block.type === "tool_use"
    )
    for (const block of message.content as Block[]) {
      if (block.type === "text" && typeof block.text === "string") {
        onEvent({ type: "reply", text: block.text })
      }
    }
    if (message.stop_reason !== "tool_use" || !calls.length) {
      if (message.stop_reason === "refusal") {
        onEvent({ type: "error", text: "The model declined this task." })
      }
      return
    }
    const ms = Math.round(performance.now() - started)
    const results = []
    for (const call of calls) {
      onEvent({ type: "call", name: call.name, input: call.input, ms })
      let content: string
      let ok = true
      try {
        const result = await (
          agent[call.name as "act"] as (input: unknown) => unknown
        )(call.input)
        content = JSON.stringify(result)
        onEvent({ type: "result", name: call.name, ok, summary: summarize(result) })
      } catch (error) {
        ok = false
        content = String(error)
        onEvent({ type: "result", name: call.name, ok, summary: content })
      }
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content,
        is_error: !ok || undefined,
      })
    }
    messages.push({ role: "user", content: results })
  }
}

export { type AgentEvent, costOf, runAgent, type Usage }
