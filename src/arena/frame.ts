type Score = {
  widgets: {
    widget: string
    pattern: string
    label: string
    marked: boolean
    problems: string[]
  }[]
  unreachable: string[]
}

let runtime: Promise<string> | undefined
const runtimeSource = () =>
  (runtime ??= fetch("/runtime/runtime.js").then((response) => {
    if (!response.ok) {
      throw new Error(`The runtime didn't load (${response.status}).`)
    }
    return response.text()
  }))

async function compile(source: string) {
  const response = await fetch("/api/compile", { method: "POST", body: source })
  const body = await response.json()
  if (!response.ok) {
    throw new Error(`Compile error: ${body.error}`)
  }
  return body.code as string
}

// A sandboxed iframe that runs one compiled component: `allow-scripts` only,
// so its code can't reach this page, its storage or its key.
function createFrame(title: string) {
  const frame = document.createElement("iframe")
  frame.setAttribute("sandbox", "allow-scripts")
  frame.setAttribute("allow", "focus-without-user-activation *")
  frame.title = title
  frame.src = "/runtime/frame.html"

  const reply = <T>(type: string) =>
    new Promise<T>((resolve, reject) => {
      const listen = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow) {
          return
        }
        if (event.data?.type === type || event.data?.type === "error") {
          window.removeEventListener("message", listen)
          if (event.data.type === "error") {
            reject(new Error(event.data.message))
          } else {
            resolve(event.data)
          }
        }
      }
      window.addEventListener("message", listen)
    })

  const ready = new Promise<void>((resolve) => {
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) {
        return
      }
      if (event.data?.type === "loaded") {
        frame.contentWindow!.postMessage(
          { type: "boot", code: await runtimeSource() },
          "*"
        )
      } else if (event.data?.type === "ready") {
        window.removeEventListener("message", onMessage)
        resolve()
      }
    }
    window.addEventListener("message", onMessage)
  })

  const send = async <T>(message: object, answer: string) => {
    await ready
    const answered = reply<T>(answer)
    frame.contentWindow!.postMessage(message, "*")
    return answered
  }

  return {
    frame,
    async render(source: string) {
      const code = await compile(source)
      await send({ type: "render", code }, "rendered")
    },
    async score() {
      const { result } = await send<{ result: Score }>({ type: "score" }, "scored")
      return result
    },
  }
}

const problemCount = (score: Score) =>
  score.widgets.reduce((total, widget) => total + widget.problems.length, 0) +
  score.unreachable.length

export { createFrame, problemCount, type Score }
