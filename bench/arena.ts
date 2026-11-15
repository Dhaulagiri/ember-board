import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { chromium } from "playwright"

const prompts = [
  "A settings page with tabs for Profile, Notifications and Billing: a timezone picker, notification switches, and a plan chooser.",
  "A support ticket triage view: filter tickets by status and priority, and assign one with a searchable people picker.",
  "A file browser with a folder tree, a toolbar for new, rename and delete, and an accordion of file details.",
  "A checkout form: shipping method as radio buttons, a country picker you can type into, and an agree-to-terms checkbox.",
  "An FAQ page with an accordion of eight questions and a search box that filters them.",
  "A music player: play and pause, a volume slider, a seek slider, and a playlist you can pick a track from.",
  "A text editor toolbar with bold, italic and underline toggles, a font size picker, and an alignment group.",
  "A project dashboard with tabs for Overview, Tasks and Team, and a filter for task status.",
  "A notification preferences panel: a switch per channel, and a quiet hours start and end time picker.",
  "An org chart explorer: a tree of teams and people you can expand and collapse, and a details disclosure for the selected person.",
]

const { values: flags } = parseArgs({
  options: {
    model: { type: "string", default: "claude-sonnet-5-5" },
    runs: { type: "string", default: "3" },
    prompts: { type: "string", default: String(prompts.length) },
    url: { type: "string", default: "http://localhost:5320" },
    replay: { type: "string" },
    rescore: { type: "string" },
    headed: { type: "boolean", default: false },
  },
})

type Arm = "plain" | "sdk"

type Outcome = {
  code: string
  error?: string
  stats: {
    seconds: number
    cost: number
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    docsRead: string[]
    repaired: boolean
  } | null
  score?: {
    widgets: { pattern: string; problems: string[] }[]
    unreachable: string[]
  }
}

type Run = {
  prompt: number
  run: number
  arm: Arm
  expected: { pattern: string }[] | null
} & Outcome

// One found widget per asked-for one, so four switches asked for need four.
const builtOf = (run: Run) => {
  if (!run.expected || !run.score) {
    return null
  }
  const left = run.score.widgets.map((widget) => widget.pattern)
  let built = 0
  for (const want of run.expected) {
    const index = left.indexOf(want.pattern)
    if (index !== -1) {
      left.splice(index, 1)
      built++
    }
  }
  return { built, of: run.expected.length }
}

const median = (values: number[]) => {
  if (!values.length) {
    return NaN
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const problemsOf = (outcome: Outcome) =>
  outcome.score
    ? outcome.score.widgets.reduce((total, widget) => total + widget.problems.length, 0) +
      outcome.score.unreachable.length
    : NaN

// Builds from an earlier run's .jsonl, scored again instead of built again.
// One the dev server dropped mid-build is left out, so it runs live.
function savedBuilds(file: string | undefined) {
  const saved = new Map<string, any>()
  if (!file) {
    return saved
  }
  for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
    const build = JSON.parse(line)
    const dropped = Object.values(build.outcomes).some((outcome: any) =>
      /Failed to fetch|ERR_CONNECTION/.test(outcome.error ?? "")
    )
    if (!dropped) {
      saved.set(`${build.index}.${build.run}`, build)
    }
  }
  return saved
}

async function main() {
  const key = process.env.ANTHROPIC_API_KEY ?? ""
  const chosen = prompts.slice(0, Number(flags.prompts))
  const runs = Number(flags.runs)
  const saved = savedBuilds(flags.rescore)
  const live = chosen.length * runs - saved.size
  if (!key && !flags.replay && live > 0) {
    throw new Error(
      `${live} builds need Claude: set ANTHROPIC_API_KEY, or pass --replay <name> to test the runner.`
    )
  }
  if (flags.rescore) {
    console.log(`Scoring ${saved.size} saved builds again, and building ${live} live.`)
  }
  const browser = await chromium.launch({ headless: !flags.headed })
  const all: Run[] = []
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  mkdirSync("bench/results", { recursive: true })
  const log = `bench/results/arena-${stamp}.jsonl`
  console.log(`Saving each build to ${log} as it finishes.`)

  for (const [index, text] of chosen.entries()) {
    for (let run = 1; run <= runs; run++) {
      const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } })
      await page.addInitScript((value) => {
        try {
          sessionStorage.setItem("ember-board:anthropic-key", value)
        } catch {}
      }, key)
      const earlier = saved.get(`${index + 1}.${run}`)
      if (earlier) {
        await page.addInitScript((replay) => {
          Object.assign(window, { __arenaReplay: replay })
        }, {
          prompt: earlier.prompt,
          model: earlier.model,
          note: "A saved build, scored again.",
          expected: earlier.expected ?? null,
          arms: {
            plain: { code: earlier.outcomes.plain.code, stats: earlier.outcomes.plain.stats },
            sdk: { code: earlier.outcomes.sdk.code, stats: earlier.outcomes.sdk.stats },
          },
        })
      }
      const replayName = earlier ? "saved" : flags.replay
      await page.goto(`${flags.url}/arena.html${replayName ? `?replay=${replayName}` : ""}`)
      if (!replayName) {
        await page.getByLabel("What should Claude build?").fill(text)
        await page.getByLabel("Model").selectOption(flags.model!)
      }
      await page.getByRole("button", { name: "Build both" }).click()
      await page.waitForFunction(() => (window as any).__arenaResult, null, {
        timeout: 15 * 60_000,
      })
      const result = await page.evaluate(() => (window as any).__arenaResult)
      await page.close()
      appendFileSync(log, `${JSON.stringify({ index: index + 1, run, ...result })}\n`)
      for (const arm of ["plain", "sdk"] as Arm[]) {
        const outcome: Outcome = result.outcomes[arm]
        all.push({ prompt: index + 1, run, arm, expected: result.expected ?? null, ...outcome })
        console.log(
          `#${index + 1}.${run} ${arm.padEnd(5)} ${outcome.error ? `FAILED ${outcome.error.split("\n")[0].slice(0, 80)}` : `${problemsOf(outcome)} problems, ${outcome.score?.widgets.length ?? 0} widgets`}${outcome.stats ? `, ${outcome.stats.seconds.toFixed(1)}s, $${outcome.stats.cost.toFixed(4)}${outcome.stats.repaired ? ", repaired" : ""}` : ""}`
        )
      }
    }
  }
  await browser.close()

  const summary = (["plain", "sdk"] as Arm[]).map((arm) => {
    const mine = all.filter((run) => run.arm === arm)
    const scored = mine.filter((run) => run.score)
    const widgets = scored.flatMap((run) => run.score!.widgets)
    const stats = mine.flatMap((run) => (run.stats ? [run.stats] : []))
    return {
      arm,
      builds: mine.length,
      failed: mine.filter((run) => run.error).length,
      coverage: (() => {
        const counts = mine.flatMap((run) => {
          const built = builtOf(run)
          return built ? [built] : []
        })
        const of = counts.reduce((total, count) => total + count.of, 0)
        return of ? counts.reduce((total, count) => total + count.built, 0) / of : NaN
      })(),
      repaired: stats.filter((s) => s.repaired).length,
      problems: median(scored.map(problemsOf)),
      widgets: median(scored.map((run) => run.score!.widgets.length)),
      passing: widgets.length
        ? widgets.filter((widget) => !widget.problems.length).length / widgets.length
        : NaN,
      unreachable: median(scored.map((run) => run.score!.unreachable.length)),
      lines: median(mine.map((run) => run.code.split("\n").length)),
      seconds: median(stats.map((s) => s.seconds)),
      cost: median(stats.map((s) => s.cost)),
      tokens: median(stats.map((s) => s.input + s.output + s.cacheRead + s.cacheWrite)),
      docs: median(stats.map((s) => s.docsRead.length)),
    }
  })

  const fmt = (value: number, digits = 0, unit = "") =>
    Number.isNaN(value)
      ? "—"
      : unit === "$"
        ? `$${value.toFixed(digits)}`
        : `${value.toFixed(digits)}${unit}`
  const [plain, sdk] = summary
  const lines = [
    "# Arena benchmark",
    "",
    `${flags.replay ? `Replay "${flags.replay}" (not live builds)` : flags.model}, ${chosen.length} prompts × ${runs} runs. Medians per build unless noted.`,
    "",
    "| | Ember | Ember + @ui-sdk/ember |",
    "| --- | --- | --- |",
    `| Asked-for widgets built (all builds) | ${fmt(plain.coverage * 100, 0, "%")} | ${fmt(sdk.coverage * 100, 0, "%")} |`,
    `| Builds that failed to render | ${plain.failed}/${plain.builds} | ${sdk.failed}/${sdk.builds} |`,
    `| Needed a repair turn | ${plain.repaired} | ${sdk.repaired} |`,
    `| Pattern and keyboard problems | ${fmt(plain.problems)} | ${fmt(sdk.problems)} |`,
    `| Widgets checked | ${fmt(plain.widgets)} | ${fmt(sdk.widgets)} |`,
    `| Widgets passing (all builds) | ${fmt(plain.passing * 100, 0, "%")} | ${fmt(sdk.passing * 100, 0, "%")} |`,
    `| Unreachable by keyboard | ${fmt(plain.unreachable)} | ${fmt(sdk.unreachable)} |`,
    `| Lines of code | ${fmt(plain.lines)} | ${fmt(sdk.lines)} |`,
    `| Build time | ${fmt(plain.seconds, 1, "s")} | ${fmt(sdk.seconds, 1, "s")} |`,
    `| Tokens | ${fmt(plain.tokens)} | ${fmt(sdk.tokens)} |`,
    `| Cost | ${fmt(plain.cost, 4, "$")} | ${fmt(sdk.cost, 4, "$")} |`,
    `| Docs pages read | ${fmt(plain.docs)} | ${fmt(sdk.docs)} |`,
    "",
    "Widgets count only what each build marked with data-widget, so check the widgets row before comparing passing rates.",
  ]
  const report = lines.join("\n")
  console.log(`\n${report}`)
  writeFileSync(`bench/results/arena-${stamp}.json`, JSON.stringify({ flags, summary, all }, null, 2))
  writeFileSync(`bench/results/arena-${stamp}.md`, `${report}\n`)
}

await main()
