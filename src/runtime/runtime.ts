import * as glimmerComponent from "@glimmer/component"
import * as glimmerTracking from "@glimmer/tracking"
import * as emberComponent from "@ember/component"
import * as templateOnly from "@ember/component/template-only"
import * as emberHelper from "@ember/helper"
import * as emberModifier from "@ember/modifier"
import * as emberObject from "@ember/object"
import { renderComponent } from "@ember/renderer"
import * as emberRenderer from "@ember/renderer"
import * as emberTemplate from "@ember/template"
import * as templateFactory from "@ember/template-factory"
import { checkPattern, type Pattern } from "@ui-sdk/core/testing"
import * as decoratorRuntime from "decorator-transforms/runtime"
import emberPackage from "../../vendor/@ui-sdk/ember/package.json"

const entries = import.meta.glob<Record<string, unknown>>(
  "../../vendor/@ui-sdk/ember/src/*.ts",
  { eager: true }
)

const modules: Record<string, unknown> = {
  "@glimmer/component": glimmerComponent,
  "@glimmer/tracking": glimmerTracking,
  "@ember/component": emberComponent,
  "@ember/component/template-only": templateOnly,
  "@ember/helper": emberHelper,
  "@ember/modifier": emberModifier,
  "@ember/object": emberObject,
  "@ember/renderer": emberRenderer,
  "@ember/template": emberTemplate,
  "@ember/template-factory": templateFactory,
  "decorator-transforms/runtime": decoratorRuntime,
}

for (const [name, path] of Object.entries(
  emberPackage.exports as Record<string, string>
)) {
  const entry = entries[`../../vendor/@ui-sdk/ember/${path.slice(2)}`]
  if (entry) {
    modules[`@ui-sdk/ember/${name.slice(2)}`] = entry
  }
}

const require = (id: string) => {
  if (!(id in modules)) {
    throw new Error(
      `"${id}" isn't available here. Use @glimmer/*, @ember/* and @ui-sdk/ember/* only.`
    )
  }
  return { __esModule: true, ...(modules[id] as object) }
}

type Message =
  | { type: "render"; code: string }
  | { type: "score" }

type Score = {
  widget: string
  pattern: string
  label: string
  problems: string[]
}

const post = (message: object) => window.parent.postMessage(message, "*")

let teardown: { destroy: () => void } | undefined

function render(code: string) {
  teardown?.destroy()
  const root = document.getElementById("root")!
  root.replaceChildren()
  const module = { exports: {} as { default?: unknown } }
  new Function("require", "module", "exports", code)(
    require,
    module,
    module.exports
  )
  const component = module.exports.default
  if (!component) {
    throw new Error("The module has no default export.")
  }
  teardown = renderComponent(component as never, { into: root }) as never
}

const labelOf = (el: Element) =>
  el.getAttribute("aria-label") ??
  el.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) ??
  ""

// Clickable-looking elements a keyboard can never reach: a pointer cursor,
// no tab stop of their own, and no focusable element around them.
function unreachable() {
  const focusable =
    "a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])"
  return [...document.querySelectorAll<HTMLElement>("#root *")].filter(
    (el) =>
      getComputedStyle(el).cursor === "pointer" &&
      !el.matches(focusable) &&
      !el.closest(focusable) &&
      !el.querySelector(focusable) &&
      el.getClientRects().length > 0
  )
}

async function score() {
  const scores: Score[] = []
  const widgets = [...document.querySelectorAll<HTMLElement>("[data-widget]")]
  for (const [index, el] of widgets.entries()) {
    const pattern = el.dataset.widget as Pattern
    const result: Score = {
      widget: `${index + 1}`,
      pattern,
      label: labelOf(el),
      problems: [],
    }
    try {
      await checkPattern(el, pattern)
    } catch (error) {
      result.problems = String((error as Error).message ?? error)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !/^checkPattern found/i.test(line))
    }
    scores.push(result)
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  }
  return {
    widgets: scores,
    unreachable: unreachable().map(labelOf),
  }
}

window.addEventListener("message", async (event: MessageEvent<Message>) => {
  const message = event.data
  try {
    if (message?.type === "render") {
      render(message.code)
      await new Promise((resolve) => requestAnimationFrame(resolve))
      post({ type: "rendered" })
    } else if (message?.type === "score") {
      post({ type: "scored", result: await score() })
    }
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
})

window.addEventListener("error", (event) =>
  post({ type: "error", message: event.message })
)

post({ type: "ready" })
