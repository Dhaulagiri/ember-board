import { explainRenderError } from "./diagnose"
import { coverage, expectedWidgets, type Expected } from "./expected"
import { createFrame, problemCount, type Score } from "./frame"
import { repairBuild, startBuild, type Build, type Stats } from "./generate"
import { models, type Arm, type Model } from "./prompts"
import "./arena.css"

type Replay = {
  prompt: string
  model: string
  note: string
  expected?: Expected | null
  arms: Record<Arm, { code: string; stats: Stats | null }>
}

type Outcome = { code: string; stats: Stats | null; score?: Score; error?: string }

const keyStorage = "ember-board:anthropic-key"
const suggestions = [
  "A settings page with tabs for Profile, Notifications and Billing: a timezone picker, notification switches, and a plan chooser.",
  "A support ticket triage view: filter tickets by status and priority, and assign one with a searchable people picker.",
  "A file browser with a folder tree, a toolbar for new, rename and delete, and an accordion of file details.",
]
const arms: { arm: Arm; title: string }[] = [
  { arm: "plain", title: "Ember" },
  { arm: "sdk", title: "Ember + @ui-sdk/ember" },
]

const read = (key: string) => {
  try {
    return sessionStorage.getItem(key) ?? ""
  } catch {
    return ""
  }
}
const write = (key: string, value: string) => {
  try {
    if (value) {
      sessionStorage.setItem(key, value)
    } else {
      sessionStorage.removeItem(key)
    }
  } catch {}
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {},
  ...children: (Node | string)[]
) => {
  const node = document.createElement(tag)
  const { dataset, ...rest } = props
  Object.assign(node, rest)
  Object.assign(node.dataset, dataset ?? {})
  node.append(...children)
  return node
}

const replayName = new URLSearchParams(location.search).get("replay")

const key = el("input", {
  type: "password",
  placeholder: "Anthropic API key (sk-ant-…)",
  autocomplete: "off",
  value: read(keyStorage),
})
key.setAttribute("aria-label", "Anthropic API key")
key.addEventListener("input", () => write(keyStorage, key.value.trim()))

const model = el("select")
model.setAttribute("aria-label", "Model")
for (const [value, { label }] of Object.entries(models)) {
  model.append(el("option", { value, textContent: label }))
}

const prompt = el("textarea", { rows: 3, value: suggestions[0] })
prompt.setAttribute("aria-label", "What should Claude build?")
const go = el("button", { type: "button", className: "primary", textContent: "Build both" })
const download = el("button", { type: "button", textContent: "Download replay", hidden: true })
const status = el("p", { className: "status" })

const header = el(
  "header",
  {},
  el("h1", { textContent: "One prompt, two Ember builds" }),
  el("p", {
    className: "lede",
    textContent:
      "Claude builds what you describe twice, with the same model and instructions: once in plain Ember, once with @ui-sdk/ember and its docs. Both run in sandboxed frames, and a grader presses keys against each widget's WAI-ARIA pattern.",
  }),
  replayName
    ? el("p", { className: "replay", textContent: `Replay "${replayName}": recorded output, not built live.` })
    : el("div", { className: "row" }, key, model),
  prompt,
  el(
    "div",
    { className: "suggestions" },
    ...suggestions.map((text) => {
      const button = el("button", { type: "button", textContent: text })
      button.addEventListener("click", () => (prompt.value = text))
      return button
    })
  ),
  el("div", { className: "row" }, go, download),
  status
)

const columns = Object.fromEntries(
  arms.map(({ arm, title }) => {
    const code = el("pre", { className: "code" })
    const state = el("p", { className: "state", textContent: "Waiting" })
    const host = el("div", { className: "frame-host" })
    const section = el(
      "section",
      { dataset: { arm } },
      el("h2", { textContent: title }),
      state,
      host,
      el("details", {}, el("summary", { textContent: "Code" }), code)
    )
    return [arm, { section, code, state, host }]
  })
) as unknown as Record<Arm, { section: HTMLElement; code: HTMLElement; state: HTMLElement; host: HTMLElement }>

const scorecard = el("table", { className: "scorecard", hidden: true })

document.getElementById("arena")!.append(
  header,
  el("div", { className: "columns" }, columns.plain.section, columns.sdk.section),
  scorecard
)

const outcomes: Partial<Record<Arm, Outcome>> = {}
let expected: Expected | null = null

const coverageOf = (outcome: Outcome) =>
  expected && outcome.score ? coverage(expected, outcome.score.widgets) : null

function renderScorecard() {
  const rows: [string, (outcome: Outcome) => string][] = [
    [
      "Asked-for widgets built",
      (o) => {
        const built = coverageOf(o)
        return built ? `${built.built} of ${built.of}` : "—"
      },
    ],
    ["Pattern and keyboard problems", (o) => (o.score ? String(problemCount(o.score)) : "—")],
    ["Widgets checked", (o) => (o.score ? String(o.score.widgets.length) : "—")],
    [
      "Widgets passing",
      (o) => (o.score ? String(o.score.widgets.filter((w) => !w.problems.length).length) : "—"),
    ],
    ["Unreachable by keyboard", (o) => (o.score ? String(o.score.unreachable.length) : "—")],
    ["Lines of code", (o) => String(o.code.split("\n").length)],
    ["Build time", (o) => (o.stats ? `${o.stats.seconds.toFixed(1)}s` : "—")],
    ["Tokens", (o) => (o.stats ? (o.stats.input + o.stats.output + o.stats.cacheRead + o.stats.cacheWrite).toLocaleString() : "—")],
    ["Cost", (o) => (o.stats ? `$${o.stats.cost.toFixed(4)}` : "—")],
    ["Docs pages read", (o) => (o.stats ? String(o.stats.docsRead.length) : "—")],
    ["Needed a repair turn", (o) => (o.stats ? (o.stats.repaired ? "yes" : "no") : "—")],
    ["Result", (o) => o.error ?? "rendered"],
  ]
  scorecard.replaceChildren(
    el(
      "thead",
      {},
      el("tr", {}, el("th", { textContent: "" }), ...arms.map(({ title }) => el("th", { textContent: title })))
    ),
    el(
      "tbody",
      {},
      ...rows.map(([label, value]) =>
        el(
          "tr",
          {},
          el("th", { textContent: label }),
          ...arms.map(({ arm }) => el("td", { textContent: outcomes[arm] ? value(outcomes[arm]!) : "…" }))
        )
      )
    )
  )
  const details = arms.flatMap(({ arm, title }) => [
    ...(outcomes[arm] ? (coverageOf(outcomes[arm]!)?.missing ?? []) : []).map((want) =>
      el(
        "li",
        { dataset: { ok: "false" } },
        `${title} · missing ${want.pattern} “${want.what}”: asked for, but not built.`
      )
    ),
    ...(outcomes[arm]?.score?.widgets ?? []).map((widget) =>
      el(
        "li",
        { dataset: { ok: String(!widget.problems.length) } },
        `${title} · ${widget.pattern}${widget.label ? ` “${widget.label}”` : ""}${widget.native ? " (native element)" : widget.marked ? "" : " (found by role)"}: `,
        widget.problems.length ? widget.problems.join(" ") : widget.native ? "built in, not pattern-checked" : "passes"
      )
    ),
  ])
  scorecard.after(el("ul", { className: "problems" }, ...details))
  document.querySelector(".problems + .problems")?.remove()
  scorecard.hidden = false
}

async function runArm(
  arm: Arm,
  frame: ReturnType<typeof createFrame>,
  produce: () => Promise<{ code: string; stats: Stats | null; build?: Build }>
) {
  const column = columns[arm]
  column.code.textContent = ""
  column.state.textContent = "Building…"
  const { code, stats, build } = await produce()
  column.code.textContent = code
  column.state.textContent = "Rendering…"
  try {
    await frame.render(code)
  } catch (error) {
    if (!build) {
      throw new Error(explainRenderError(code, (error as Error).message))
    }
    column.state.textContent = "Render failed, asking for one repair…"
    column.code.textContent = ""
    await repairBuild(build, explainRenderError(code, (error as Error).message), {
      apiKey: key.value.trim(),
      onEvent: (event) => event.type === "text" && column.code.append(event.text),
    })
    column.code.textContent = build.code
    try {
      await frame.render(build.code)
    } catch (repaired) {
      throw new Error(explainRenderError(build.code, (repaired as Error).message))
    }
    return { code: build.code, stats: build.stats }
  }
  return { code, stats }
}

async function run() {
  Object.assign(window, { __arenaResult: undefined })
  go.disabled = true
  download.hidden = true
  status.textContent = ""
  for (const { arm } of arms) {
    delete outcomes[arm]
  }
  scorecard.hidden = true
  const frames = Object.fromEntries(
    arms.map(({ arm, title }) => {
      const frame = createFrame(`${title} preview`)
      columns[arm].host.replaceChildren(frame.frame)
      return [arm, frame]
    })
  ) as Record<Arm, ReturnType<typeof createFrame>>

  let replay: Replay | undefined
  if (replayName) {
    replay = await (await fetch(`/arena/replays/${replayName}.json`)).json()
    prompt.value = replay!.prompt
  } else if (!key.value.trim()) {
    status.textContent = "Paste an Anthropic API key first. It stays in this tab and goes only to api.anthropic.com."
    go.disabled = false
    return
  }

  const chosen = model.value as Model
  const builds: Partial<Record<Arm, Build>> = {}
  expected = null
  const asked = replay
    ? Promise.resolve(replay.expected ?? null)
    : expectedWidgets(prompt.value, key.value.trim()).catch(() => null)
  await Promise.all(
    arms.map(async ({ arm }) => {
      const column = columns[arm]
      try {
        const result = await runArm(arm, frames[arm], async () => {
          if (replay) {
            return replay.arms[arm]
          }
          const build = await startBuild(arm, prompt.value, {
            apiKey: key.value.trim(),
            model: chosen,
            onEvent: (event) => {
              if (event.type === "text") {
                column.code.append(event.text)
              } else if (event.type === "docs") {
                column.state.textContent = `Reading the ${event.component} docs${event.section ? ` (${event.section})` : ""}…`
              } else {
                column.state.textContent = `Building… ${event.stats.seconds.toFixed(1)}s, $${event.stats.cost.toFixed(4)}`
              }
            },
          })
          builds[arm] = build
          return { code: build.code, stats: build.stats, build }
        })
        outcomes[arm] = { ...result }
        column.state.textContent = "Rendered"
      } catch (error) {
        outcomes[arm] = { code: column.code.textContent ?? "", stats: builds[arm]?.stats ?? null, error: (error as Error).message.slice(0, 300) }
        column.state.textContent = (error as Error).message.slice(0, 300)
      }
    })
  )

  for (const { arm } of arms) {
    if (outcomes[arm] && !outcomes[arm]!.error) {
      columns[arm].state.textContent = "Scoring…"
      try {
        outcomes[arm]!.score = await frames[arm].score()
        const count = problemCount(outcomes[arm]!.score!)
        columns[arm].state.textContent = `${count} ${count === 1 ? "problem" : "problems"}`
      } catch (error) {
        outcomes[arm]!.error = `Scoring failed: ${(error as Error).message}`
      }
    }
  }
  expected = await asked
  renderScorecard()
  Object.assign(window, {
    __arenaResult: {
      prompt: prompt.value,
      model: model.value,
      expected,
      outcomes: structuredClone(outcomes),
    },
  })
  if (!replay) {
    download.hidden = false
  }
  go.disabled = false
}

download.addEventListener("click", () => {
  const replay: Replay = {
    prompt: prompt.value,
    model: model.value,
    note: `Recorded ${new Date().toISOString()}`,
    expected,
    arms: Object.fromEntries(
      arms.map(({ arm }) => [arm, { code: outcomes[arm]?.code ?? "", stats: outcomes[arm]?.stats ?? null }])
    ) as Replay["arms"],
  }
  const link = el("a", {
    href: URL.createObjectURL(new Blob([JSON.stringify(replay, null, 2)], { type: "application/json" })),
    download: "arena-replay.json",
  })
  link.click()
  URL.revokeObjectURL(link.href)
})

go.addEventListener("click", run)
