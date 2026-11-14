import Component from "@glimmer/component"
import { tracked } from "@glimmer/tracking"
import { fn } from "@ember/helper"
import { on } from "@ember/modifier"
import { Sparkles, Square } from "lucide"
import type { createAgent } from "@ui-sdk/ember/agent"
import { costOf, runAgent, type AgentEvent, type Usage } from "./agent-loop"
import { icon } from "./icon"

type Signature = {
  Args: { agent: ReturnType<typeof createAgent> }
}

type Line = {
  kind: "call" | "result" | "reply" | "error"
  title: string
  body: string
  ok?: boolean
}

const suggestions = [
  "Move “Fix login redirect loop” to In Progress and give it to Maya.",
  "Assign every unassigned high or urgent issue to Leo.",
  "Create a bug “Search returns stale results”, urgent, for Priya, due Nov 20.",
  "Push “Billing export to CSV” due date to December 5 and mark it In Review.",
]

const models = [
  { value: "claude-haiku-5-5", label: "Haiku 5.5" },
  { value: "claude-sonnet-5-5", label: "Sonnet 5.5" },
]

export default class AgentPanel extends Component<Signature> {
  suggestions = suggestions
  models = models
  @tracked task = suggestions[0]
  @tracked model = "claude-haiku-5-5"
  @tracked lines: Line[] = []
  @tracked running = false
  @tracked calls = 0
  @tracked tokens = 0
  @tracked cost = 0
  @tracked seconds = 0

  get stats() {
    return [
      { label: "Tool calls", value: String(this.calls) },
      { label: "Screenshots", value: "0" },
      { label: "Tokens", value: this.tokens.toLocaleString() },
      { label: "Cost", value: `$${this.cost.toFixed(4)}` },
      { label: "Time", value: `${this.seconds.toFixed(1)}s` },
    ]
  }

  setTask = (event: Event) =>
    (this.task = (event.target as HTMLTextAreaElement).value)
  setModel = (event: Event) =>
    (this.model = (event.target as HTMLSelectElement).value)
  pick = (task: string) => (this.task = task)

  record = (event: AgentEvent) => {
    if (event.type === "usage") {
      this.tokens += tokensOf(event.usage)
      this.cost += costOf(event.model, event.usage)
      return
    }
    if (event.type === "call") {
      this.calls += 1
      this.lines = [
        ...this.lines,
        { kind: "call", title: event.name, body: JSON.stringify(event.input, null, 1) },
      ]
    } else if (event.type === "result") {
      this.lines = [
        ...this.lines,
        { kind: "result", title: event.ok ? "ok" : "failed", body: event.summary, ok: event.ok },
      ]
    } else {
      this.lines = [
        ...this.lines,
        { kind: event.type, title: event.type === "reply" ? "Agent" : "Error", body: event.text },
      ]
    }
  }

  run = async (event: Event) => {
    event.preventDefault()
    if (this.running || !this.task.trim()) {
      return
    }
    this.running = true
    this.lines = []
    this.calls = 0
    this.tokens = 0
    this.cost = 0
    const started = performance.now()
    const timer = setInterval(
      () => (this.seconds = (performance.now() - started) / 1000),
      100
    )
    try {
      await runAgent(this.args.agent, this.task, {
        model: this.model,
        onEvent: this.record,
      })
    } catch (error) {
      this.record({ type: "error", text: String(error) })
    } finally {
      clearInterval(timer)
      this.seconds = (performance.now() - started) / 1000
      this.running = false
    }
  }

  <template>
    <aside data-slot="agent-panel" data-agent-hidden aria-label="Agent">
      <header>
        <h2>{{icon Sparkles}} Agent</h2>
        <select aria-label="Model" {{on "change" this.setModel}}>
          {{#each this.models as |model|}}
            <option value={{model.value}}>{{model.label}}</option>
          {{/each}}
        </select>
      </header>
      <form {{on "submit" this.run}}>
        <textarea
          aria-label="Task"
          rows="3"
          value={{this.task}}
          {{on "input" this.setTask}}
        ></textarea>
        <button type="submit" data-variant="solid" disabled={{this.running}}>
          {{#if this.running}}{{icon Square}} Working…{{else}}Run task{{/if}}
        </button>
      </form>
      <div data-slot="suggestions">
        {{#each this.suggestions as |suggestion|}}
          <button type="button" {{on "click" (fn this.pick suggestion)}}>
            {{suggestion}}
          </button>
        {{/each}}
      </div>
      <dl data-slot="stats">
        {{#each this.stats as |stat|}}
          <div><dt>{{stat.label}}</dt><dd>{{stat.value}}</dd></div>
        {{/each}}
      </dl>
      <ol data-slot="log">
        {{#each this.lines as |line|}}
          <li data-kind={{line.kind}}>
            <strong>{{line.title}}</strong>
            <pre>{{line.body}}</pre>
          </li>
        {{/each}}
      </ol>
    </aside>
  </template>
}

const tokensOf = (usage: Usage) =>
  usage.input_tokens +
  usage.output_tokens +
  (usage.cache_read_input_tokens ?? 0) +
  (usage.cache_creation_input_tokens ?? 0)
