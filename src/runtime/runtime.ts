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
  marked: boolean
  native: boolean
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
// no tab stop of their own, and no focusable element around them. Text in a
// label that holds a control is fine, since the label's click goes to it.
function unreachable() {
  const focusable =
    "a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])"
  return [...document.querySelectorAll<HTMLElement>("#root *")].filter(
    (el) =>
      getComputedStyle(el).cursor === "pointer" &&
      !el.matches(focusable) &&
      !el.closest(focusable) &&
      !el.querySelector(focusable) &&
      !el.closest("label")?.querySelector(focusable) &&
      el.getClientRects().length > 0
  )
}

// Widgets a build didn't mark are still found by their role, so leaving out
// data-widget doesn't skip the check.
const roles: [string, Pattern, (el: HTMLElement) => HTMLElement][] = [
  ["[role=tablist]", "tabs", (el) => el.parentElement ?? el],
  ["[role=combobox]", "combobox", (el) => el.parentElement ?? el],
  ["[role=switch]", "switch", (el) => el],
  ["[role=radiogroup]", "radio-group", (el) => el],
  ["[role=slider]", "slider", (el) => el],
  ["[role=checkbox]", "checkbox", (el) => el],
  ["[role=tree]", "tree", (el) => el],
  ["[role=toolbar]", "toolbar", (el) => el],
  ["[role=menubar]", "menubar", (el) => el],
]

// Native controls count as the widget they stand for, with the browser's own
// keyboard and screen reader support, so they're built but not pattern-checked.
// A component's aria-hidden form input isn't one.
const natives: [string, Pattern][] = [
  ["select:not([multiple])", "combobox"],
  ["input[type=checkbox]:not([role])", "checkbox"],
  ["input[type=range]:not([role])", "slider"],
  ["input[type=radio]:not([role])", "radio-group"],
]

const isOwnControl = (el: HTMLElement) =>
  el.getAttribute("aria-hidden") !== "true" && el.tabIndex >= 0

const shown = (el: Element) => el.getClientRects().length > 0

const frames = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  )

function candidates() {
  const found: { el: HTMLElement; pattern: Pattern; marked: boolean; native?: boolean }[] = []
  const marked = [...document.querySelectorAll<HTMLElement>("#root [data-widget]")]
  for (const el of marked.filter(shown)) {
    found.push({ el, pattern: el.dataset.widget as Pattern, marked: true })
  }
  const radioNames = new Set<string>()
  for (const [selector, pattern] of natives) {
    for (const el of document.querySelectorAll<HTMLInputElement>(`#root ${selector}`)) {
      if (!shown(el) || !isOwnControl(el)) {
        continue
      }
      if (pattern === "radio-group") {
        if (radioNames.has(el.name)) {
          continue
        }
        radioNames.add(el.name)
      }
      const root =
        pattern === "radio-group" ? (el.closest("fieldset") ?? el.parentElement ?? el) : el
      const mark = marked.find((m) => m.dataset.widget === pattern && m.contains(el))
      if (mark) {
        found.splice(found.findIndex((f) => f.el === mark), 1)
      }
      found.push({ el: root as HTMLElement, pattern, marked: !!mark, native: true })
    }
  }
  for (const [selector, pattern, rootOf] of roles) {
    for (const el of document.querySelectorAll<HTMLElement>(`#root ${selector}`)) {
      const covered = marked.some(
        (mark) => mark.dataset.widget === pattern && (mark === el || mark.contains(el) || el.contains(mark))
      )
      if (shown(el) && !covered) {
        found.push({ el: rootOf(el), pattern, marked: false })
      }
    }
  }
  return found
}

// Scores what's on screen, then opens every tab in turn and scores what each
// shows, so widgets behind a closed tab are checked too.
async function score() {
  const scores: Score[] = []
  const seen = new Set<string>()
  const stranded = new Map<Element, string>()
  // A check presses keys that can switch tabs and redraw a widget, so the
  // list is read again after each one, and a widget is known by its pattern,
  // label and place among its twins rather than by its element.
  const nameOf = (el: HTMLElement, pattern: Pattern) => {
    const list =
      pattern === "tabs" ? el.closest("[role=tablist]") ?? el.querySelector("[role=tablist]") : null
    return list
      ? list.getAttribute("aria-label") ??
          [...list.querySelectorAll("[role=tab]")].map((tab) => tab.textContent?.trim()).join(" ")
      : labelOf(el)
  }
  const next = () => {
    const counts = new Map<string, number>()
    for (const candidate of candidates()) {
      const name = `${candidate.pattern}|${nameOf(candidate.el, candidate.pattern)}`
      const n = (counts.get(name) ?? 0) + 1
      counts.set(name, n)
      if (!seen.has(`${name}|${n}`) && candidate.el.isConnected) {
        seen.add(`${name}|${n}`)
        return candidate
      }
    }
  }
  const visit = async () => {
    for (let found = next(); found; found = next()) {
      const { el, pattern, marked, native } = found
      const result: Score = {
        widget: `${scores.length + 1}`,
        pattern,
        label: nameOf(el, pattern),
        marked,
        native: !!native,
        problems: [],
      }
      try {
        if (!native) {
          await checkPattern(el, pattern)
        }
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
      await frames()
    }
    for (const el of unreachable()) {
      stranded.set(el, labelOf(el))
    }
  }
  await visit()
  // Found again each time: a build that redraws its tabs replaces the buttons.
  const tabCount = document.querySelectorAll("#root [role=tab]").length
  for (let index = 0; index < tabCount; index++) {
    document.querySelectorAll<HTMLElement>("#root [role=tab]")[index]?.click()
    await frames()
    await visit()
  }
  return { widgets: scores, unreachable: [...stranded.values()] }
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
