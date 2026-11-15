import plain from "./plain.gts?raw"
import sdk from "./sdk.gts?raw"
import "./spike.css"

type Result = {
  widgets: { widget: string; pattern: string; label: string; problems: string[] }[]
  unreachable: string[]
}

const arena = document.getElementById("arena")!

function column(title: string, source: string) {
  const section = document.createElement("section")
  section.innerHTML = `
    <h2>${title}</h2>
    <textarea spellcheck="false"></textarea>
    <div class="actions"><button type="button" data-run>Compile and render</button><button type="button" data-score>Score</button><span data-status></span></div>
    <iframe sandbox="allow-scripts" allow="focus-without-user-activation *" src="/runtime/frame.html" title="${title} preview"></iframe>
    <ol data-results></ol>`
  const textarea = section.querySelector("textarea")!
  const frame = section.querySelector("iframe")!
  const status = section.querySelector<HTMLElement>("[data-status]")!
  const results = section.querySelector<HTMLElement>("[data-results]")!
  textarea.value = source
  let ready: Promise<void> = new Promise((resolve) => {
    const onReady = (event: MessageEvent) => {
      if (event.source === frame.contentWindow && event.data?.type === "ready") {
        window.removeEventListener("message", onReady)
        resolve()
      }
    }
    window.addEventListener("message", onReady)
  })
  const reply = (type: string) =>
    new Promise<any>((resolve, reject) => {
      const listen = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow) {
          return
        }
        if (event.data?.type === type || event.data?.type === "error") {
          window.removeEventListener("message", listen)
          event.data.type === "error"
            ? reject(new Error(event.data.message))
            : resolve(event.data)
        }
      }
      window.addEventListener("message", listen)
    })

  const run = async () => {
    status.textContent = "Compiling…"
    results.replaceChildren()
    const started = performance.now()
    const response = await fetch("/api/compile", { method: "POST", body: textarea.value })
    const compiled = await response.json()
    if (!response.ok) {
      status.textContent = `Compile error: ${compiled.error}`
      return
    }
    await ready
    const rendered = reply("rendered")
    frame.contentWindow!.postMessage({ type: "render", code: compiled.code }, "*")
    try {
      await rendered
      status.textContent = `Rendered in ${Math.round(performance.now() - started)} ms`
    } catch (error) {
      status.textContent = `Runtime error: ${(error as Error).message}`
    }
  }

  const score = async () => {
    status.textContent = "Scoring…"
    const scored = reply("scored")
    frame.contentWindow!.postMessage({ type: "score" }, "*")
    try {
      const { result } = (await scored) as { result: Result }
      const failing = result.widgets.reduce((n, w) => n + w.problems.length, 0)
      status.textContent = `${failing} pattern problems, ${result.unreachable.length} unreachable`
      results.replaceChildren(
        ...result.widgets.map((w) => {
          const li = document.createElement("li")
          li.dataset.ok = String(!w.problems.length)
          li.innerHTML = `<strong>${w.pattern}</strong> ${w.problems.length ? `${w.problems.length} problems` : "passes"}<ul>${w.problems.map((p) => `<li>${p.replace(/</g, "&lt;")}</li>`).join("")}</ul>`
          return li
        }),
        ...result.unreachable.map((label) => {
          const li = document.createElement("li")
          li.dataset.ok = "false"
          li.textContent = `Keyboard can't reach "${label}"`
          return li
        })
      )
    } catch (error) {
      status.textContent = `Score error: ${(error as Error).message}`
    }
  }

  section.querySelector("[data-run]")!.addEventListener("click", run)
  section.querySelector("[data-score]")!.addEventListener("click", score)
  section.dataset.column = title
  Object.assign(section, { run, score })
  return section
}

arena.append(column("Ember", plain), column("Ember + @ui-sdk/ember", sdk))
