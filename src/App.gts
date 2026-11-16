import Component from "@glimmer/component"
import { tracked } from "@glimmer/tracking"
import { fn } from "@ember/helper"
import { htmlSafe } from "@ember/template"
import {
  Plus,
  Redo2,
  Search,
  SignalHigh,
  SignalLow,
  SignalMedium,
  TriangleAlert,
  Undo2,
} from "lucide"
import type { TransferLists } from "@ui-sdk/core"
import type { createAgent } from "ember-ui-sdk/agent"
import { Button } from "ember-ui-sdk/button"
import { Command } from "ember-ui-sdk/command"
import { Dialog } from "ember-ui-sdk/dialog"
import { createParts } from "ember-ui-sdk/primitive"
import { createToaster, ToastRegion } from "ember-ui-sdk/toast"
import AgentPanel from "./AgentPanel.gts"
import { Board, columns, labelOf, labels, personOf, type Issue } from "./data"
import { icon } from "./icon"
import { Draft, IssueDialog } from "./IssueDialog.gts"
import { kanban, type KanbanListsChangeReason } from "./kanban"

const { Root: Kanban } = createParts(kanban, {
  root: "div",
  column: "div",
  card: "div",
  undo: "button",
  redo: "button",
  instructions: "div",
})

const priorityIcons = {
  urgent: TriangleAlert,
  high: SignalHigh,
  medium: SignalMedium,
  low: SignalLow,
}

const commands = [
  { value: "new", label: "New issue" },
  { value: "undo", label: "Undo last move" },
  { value: "redo", label: "Redo move" },
]

type Signature = {
  Args: { board: Board; agent: ReturnType<typeof createAgent> }
}

export default class App extends Component<Signature> {
  columns = columns
  commands = commands
  toast = createToaster()
  @tracked draft = new Draft(this.args.board, null)
  @tracked editorOpen = false
  @tracked paletteOpen = false

  get board() {
    return this.args.board
  }

  get columnLabels() {
    return Object.fromEntries(columns.map((column) => [column.value, column.label]))
  }

  get cardLabels() {
    return Object.fromEntries(
      Object.values(this.board.issues).map((issue) => [
        issue.id,
        `${issue.id} ${issue.title}`,
      ])
    )
  }

  issue = (id: string) => this.board.issues[id]
  person = (value: string | null) => personOf(value)
  assigneeName = (value: string | null) => personOf(value)?.label ?? "no one"
  labelName = (value: string) => labelOf(labels, value)
  priorityIcon = (issue: Issue) => priorityIcons[issue.priority]
  tone = (tone: string) => htmlSafe(`--tone: ${tone}`)
  count = (lists: TransferLists, key: string) => lists[key]?.length ?? 0
  editLabel = (issue: Issue) => `Edit ${issue.title}`

  onListsChange = (
    lists: TransferLists,
    details: { reason: KanbanListsChangeReason; source?: string }
  ) => {
    this.board.setLists(lists)
    if (details.source === "agent") {
      this.toast("Board updated by the agent")
    }
  }

  edit = (id: string | null) => {
    this.draft = new Draft(this.board, id)
    this.editorOpen = true
  }

  setEditorOpen = (open: boolean) => (this.editorOpen = open)
  setPaletteOpen = (open: boolean) => (this.paletteOpen = open)
  saved = (message: string) => this.toast(message)

  runCommand = (value: string) => {
    this.paletteOpen = false
    if (value === "new") {
      this.edit(null)
    } else {
      document
        .querySelector<HTMLButtonElement>(`[data-command="${value}"]`)
        ?.click()
    }
  }

  <template>
    <div data-slot="app">
      <main data-slot="workspace">
        <header data-slot="topbar">
          <div data-slot="brand">
            <span data-slot="logo">A</span>
            <div>
              <h1>Acme · Sprint 24</h1>
              <p>Built with Ember and ember-ui-sdk</p>
            </div>
          </div>
          <Dialog
            @open={{this.paletteOpen}}
            @onOpenChange={{this.setPaletteOpen}}
            as |d|
          >
            <d.Trigger @shortcut="mod+k" class="search">
              {{icon Search}}
              Search or run a command
              <kbd aria-hidden="true">⌘K</kbd>
            </d.Trigger>
            <d.Backdrop />
            <d.Content class="palette">
              <d.Title class="visually-hidden">Command palette</d.Title>
              <Command @onAction={{this.runCommand}} as |c|>
                <c.Input
                  aria-label="Search commands"
                  placeholder="Type a command…"
                />
                <c.Empty>No results.</c.Empty>
                <c.List>
                  {{#each this.commands key="value" as |command|}}
                    <c.Item @value={{command.value}}>{{command.label}}</c.Item>
                  {{/each}}
                </c.List>
              </Command>
            </d.Content>
          </Dialog>
          <a href="/arena.html" data-slot="nav-link">Arena</a>
          <Button @onClick={{fn this.edit null}} class="primary">
            {{icon Plus}}
            New issue
          </Button>
        </header>

        <Kanban
          @lists={{this.board.lists}}
          @onListsChange={{this.onListsChange}}
          @labels={{this.columnLabels}}
          @cardLabels={{this.cardLabels}}
          aria-label="Sprint board"
          class="board-root"
          as |k|
        >
          <div data-slot="board-tools">
            <k.Undo data-command="undo" aria-label="Undo">{{icon Undo2}}</k.Undo>
            <k.Redo data-command="redo" aria-label="Redo">{{icon Redo2}}</k.Redo>
          </div>
          <div data-slot="board">
            {{#each this.columns key="value" as |column|}}
              <section data-slot="lane" aria-labelledby="lane-{{column.value}}">
                <h2 id="lane-{{column.value}}">
                  <span data-slot="status" data-status={{column.value}}></span>
                  {{column.label}}
                  <span data-slot="count">{{this.count
                      k.state.lists
                      column.value
                    }}</span>
                </h2>
                <k.Column
                  @value={{column.value}}
                  aria-labelledby="lane-{{column.value}}"
                  class="cards"
                  as |col|
                >
                  {{#each col.state.cards key="@identity" as |id|}}
                    {{#let (this.issue id) as |issue|}}
                      {{#if issue}}
                        <k.Card @value={{id}} class="card">
                          <div data-slot="card-head">
                            <span data-slot="id">{{issue.id}}</span>
                            {{#let (this.person issue.assignee) as |person|}}
                              {{#if person}}
                                <span
                                  data-slot="avatar"
                                  style={{this.tone person.tone}}
                                  title={{person.label}}
                                  aria-hidden="true"
                                >{{person.initials}}</span>
                              {{else}}
                                <span
                                  data-slot="avatar"
                                  data-empty
                                  title="Unassigned"
                                  aria-hidden="true"
                                >?</span>
                              {{/if}}
                            {{/let}}
                          </div>
                          <p data-slot="title">{{issue.title}}</p>
                          <span class="visually-hidden">{{column.label}},
                            {{issue.priority}}
                            priority, assigned to
                            {{this.assigneeName issue.assignee}}</span>
                          <div data-slot="card-foot">
                            <span data-slot="priority" data-priority={{issue.priority}}>
                              {{icon (this.priorityIcon issue)}}
                            </span>
                            <span data-slot="tag" data-label={{issue.label}}>{{this.labelName issue.label}}</span>
                            {{#if issue.due}}
                              <span data-slot="due">{{issue.due}}</span>
                            {{/if}}
                            <Button
                              @onClick={{fn this.edit issue.id}}
                              aria-label={{this.editLabel issue}}
                              class="edit"
                            >Edit</Button>
                          </div>
                        </k.Card>
                      {{/if}}
                    {{/let}}
                  {{/each}}
                </k.Column>
              </section>
            {{/each}}
          </div>
          <k.Instructions>
            Arrow keys move between cards. Space picks a card up, arrows move
            it, Space drops it and Escape puts it back.
          </k.Instructions>
        </Kanban>
      </main>

      <AgentPanel @agent={{@agent}} />

      <IssueDialog
        @board={{this.board}}
        @draft={{this.draft}}
        @open={{this.editorOpen}}
        @onOpenChange={{this.setEditorOpen}}
        @onSaved={{this.saved}}
      />

      <ToastRegion @toaster={{this.toast}} data-agent-hidden as |toast item t|>
        <t.Toast>
          <t.Title />
        </t.Toast>
      </ToastRegion>
    </div>
  </template>
}
