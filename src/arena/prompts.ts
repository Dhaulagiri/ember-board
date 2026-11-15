import type Anthropic from "@anthropic-ai/sdk"

type Arm = "plain" | "sdk"

const patterns = [
  "tabs",
  "listbox",
  "combobox",
  "disclosure",
  "accordion",
  "radio-group",
  "toolbar",
  "tree",
  "slider",
  "switch",
  "checkbox",
  "menubar",
]

const shared = `You write one Ember component as a single .gts file: a Glimmer component with a template tag.

- The default export renders the whole interface the person describes, with realistic sample data inline. Keep state in @tracked fields.
- Make it work fully with a keyboard and a screen reader.
- Put its styles in a <style> element at the top of the template, scoped under one root class. Keep them short.
- On the root element of every interactive widget that follows one of these WAI-ARIA patterns, put data-widget with the pattern's name: ${patterns.join(", ")}. A grader checks each one against its pattern with real key presses.
- Today is 2026-11-14.
- Reply with the file only, in one \`\`\`gts block.`

const plainSystem = `${shared}
- Import only from @glimmer/component, @glimmer/tracking, @ember/modifier, @ember/helper, @ember/template and @ember/object. No other packages and no icon libraries.`

const sdkSystem = (index: string) => `${shared}
- Build it with @ui-sdk/ember. Import only from @ui-sdk/ember/*, @glimmer/component, @glimmer/tracking, @ember/modifier, @ember/helper, @ember/template and @ember/object. No other packages and no icon libraries.
- Before using a component, call read_docs for its page. Ask for one section by name when that's all you need.

The package's docs index, llms.txt:

${index}`

const readDocsTool: Anthropic.Tool = {
  name: "read_docs",
  description:
    "Reads a @ui-sdk/ember component's docs page, like \"select\" or \"date-picker\". Without section, returns its overview, composition and usage, and lists its other sections. With section, returns that section, like \"Forms\" or \"Controlled\".",
  input_schema: {
    type: "object",
    properties: {
      component: { type: "string" },
      section: { type: "string" },
    },
    required: ["component"],
  },
}

const models = {
  "claude-sonnet-5-5": { label: "Sonnet 5.5", prices: [2, 10] },
  "claude-haiku-5-5": { label: "Haiku 5.5", prices: [0.1, 0.5] },
} as const

type Model = keyof typeof models

function buildParams({
  arm,
  model,
  messages,
  index,
}: {
  arm: Arm
  model: Model
  messages: Anthropic.Beta.BetaMessageParam[]
  index: string
}): Anthropic.Beta.MessageCreateParamsNonStreaming {
  const sonnet = model === "claude-sonnet-5-5"
  return {
    model,
    max_tokens: 32000,
    cache_control: { type: "ephemeral" },
    output_config: { effort: "medium" },
    system: arm === "sdk" ? sdkSystem(index) : plainSystem,
    tools: arm === "sdk" ? [readDocsTool] : undefined,
    messages,
    ...(sonnet
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
      : {}),
  }
}

export { type Arm, buildParams, type Model, models, patterns }
