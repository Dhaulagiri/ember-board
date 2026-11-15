import { patterns } from "./prompts"

type Expected = { pattern: string; what: string }[]

const schema = {
  type: "object",
  properties: {
    widgets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pattern: { type: "string", enum: patterns },
          what: { type: "string" },
        },
        required: ["pattern", "what"],
        additionalProperties: false,
      },
    },
  },
  required: ["widgets"],
  additionalProperties: false,
}

const instructions = `List the interactive widgets this interface request asks for, one entry per widget, each with the WAI-ARIA pattern a correct build would use and a few words naming it, like "timezone picker". Use only these patterns: ${patterns.join(", ")}. A picker with a fixed list of choices is a combobox, a set of on/off settings is one switch each, and choosing one of a few options shown at once is a radio-group. Leave out plain buttons, text fields and links. List only what the request names or clearly implies.`

// One cheap call per run, shared by both builds, so the scorecard can say
// whether each build made what the prompt asked for.
async function expectedWidgets(prompt: string, apiKey: string): Promise<Expected> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk")
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const message = await client.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 2000,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system: instructions,
    messages: [{ role: "user", content: prompt }],
  })
  const text = message.content.find((block) => block.type === "text")
  return text && text.type === "text" ? JSON.parse(text.text).widgets : []
}

// Matches what was asked for against what was scored, one found widget per
// expected one, so asking for four switches needs four.
const families = [
  ["combobox", "listbox", "radio-group"],
  ["switch", "checkbox", "toggle button"],
]

const sameFamily = (a: string, b: string) => families.some((family) => family.includes(a) && family.includes(b))

function coverage(expected: Expected, found: { pattern: string }[]) {
  const left = found.map((widget) => widget.pattern)
  const missing: Expected = []
  const unmatched: Expected = []
  for (const want of expected) {
    const index = left.indexOf(want.pattern)
    if (index === -1) {
      unmatched.push(want)
    } else {
      left.splice(index, 1)
    }
  }
  for (const want of unmatched) {
    const index = left.findIndex((pattern) => sameFamily(pattern, want.pattern))
    if (index === -1) {
      missing.push(want)
    } else {
      left.splice(index, 1)
    }
  }
  return { built: expected.length - missing.length, of: expected.length, missing }
}

export { coverage, type Expected, expectedWidgets }
