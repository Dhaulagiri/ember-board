import Component from "@glimmer/component"
import { tracked } from "@glimmer/tracking"
import { fn } from "@ember/helper"
import { on } from "@ember/modifier"
import { htmlSafe } from "@ember/template"
import { Plus, SignalHigh, SignalLow, SignalMedium, TriangleAlert } from "lucide"
import {
  Board,
  columns,
  labelOf,
  labels,
  people,
  personOf,
  priorities,
  type Issue,
  type Label,
  type Priority,
  type Status,
} from "../data"
import { icon } from "../icon"
import Dropdown from "./Dropdown.gts"
import DueDate from "./DueDate.gts"

const priorityIcons = {
  urgent: TriangleAlert,
  high: SignalHigh,
  medium: SignalMedium,
  low: SignalLow,
}

type Signature = { Args: { board: Board } }

export default class BaselineApp extends Component<Signature> {
  columns = columns
  priorities = priorities
  labels = labels
  people = people
  @tracked editing: string | null | undefined = undefined
  @tracked title = ""
  @tracked status: Status = "todo"
  @tracked priority: Priority = "medium"
  @tracked assignee: string | null = null
  @tracked label: Label = "feature"
  @tracked due: string | null = null
  dragging: string | null = null

  get board() {
    return this.args.board
  }

  get modalOpen() {
    return this.editing !== undefined
  }

  get heading() {
    return this.editing ? `Edit ${this.editing}` : "New issue"
  }

  cards = (status: string) =>
    (this.board.lists[status] ?? []).map((id) => this.board.issues[id])
  count = (status: string) => this.board.lists[status]?.length ?? 0
  person = (value: string | null) => personOf(value)
  labelName = (value: string) => labelOf(labels, value)
  priorityIcon = (issue: Issue) => priorityIcons[issue.priority]
  tone = (tone: string) => htmlSafe(`--tone: ${tone}`)

  open = (id: string | null) => {
    const issue = id ? this.board.issues[id] : null
    this.editing = id
    this.title = issue?.title ?? ""
    this.status = id ? this.board.statusOf(id) : "todo"
    this.priority = issue?.priority ?? "medium"
    this.assignee = issue?.assignee ?? null
    this.label = issue?.label ?? "feature"
    this.due = issue?.due ?? null
  }

  close = () => (this.editing = undefined)
  setTitle = (event: Event) =>
    (this.title = (event.target as HTMLInputElement).value)
  setStatus = (value: string) => (this.status = value as Status)
  setPriority = (value: string) => (this.priority = value as Priority)
  setAssignee = (value: string) => (this.assignee = value)
  setLabel = (value: string) => (this.label = value as Label)
  setDue = (value: string) => (this.due = value)

  save = () => {
    const issue = {
      title: this.title.trim() || "Untitled",
      priority: this.priority,
      assignee: this.assignee,
      label: this.label,
      due: this.due,
    }
    if (this.editing) {
      this.board.update(this.editing, { ...issue, status: this.status })
    } else {
      this.board.create(issue, this.status)
    }
    this.close()
  }

  remove = () => {
    if (this.editing && window.confirm(`Delete ${this.editing}?`)) {
      this.board.remove(this.editing)
      this.close()
    }
  }

  dragStart = (id: string) => (this.dragging = id)
  dragOver = (event: DragEvent) => event.preventDefault()
  drop = (status: Status, event: DragEvent) => {
    event.preventDefault()
    if (this.dragging) {
      this.board.update(this.dragging, { status })
      this.dragging = null
    }
  }

  <template>
    <div data-slot="app" class="baseline">
      <main data-slot="workspace">
        <header data-slot="topbar">
          <div data-slot="brand">
            <span data-slot="logo">A</span>
            <div>
              <h1>Acme · Sprint 24</h1>
              <p>Built with Ember, hand-rolled</p>
            </div>
          </div>
          <button type="button" class="primary" {{on "click" (fn this.open null)}}>
            {{icon Plus}}
            New issue
          </button>
        </header>
        <div class="board-root">
          <div data-slot="board">
            {{#each this.columns as |column|}}
              <section
                data-slot="lane"
                {{on "dragover" this.dragOver}}
                {{on "drop" (fn this.drop column.value)}}
              >
                <h2>
                  <span data-slot="status" data-status={{column.value}}></span>
                  {{column.label}}
                  <span data-slot="count">{{this.count column.value}}</span>
                </h2>
                <div class="cards">
                  {{#each (this.cards column.value) as |issue|}}
                    <div
                      class="card"
                      draggable="true"
                      {{on "dragstart" (fn this.dragStart issue.id)}}
                      {{on "click" (fn this.open issue.id)}}
                    >
                      <div data-slot="card-head">
                        <span data-slot="id">{{issue.id}}</span>
                        {{#let (this.person issue.assignee) as |person|}}
                          {{#if person}}
                            <span
                              data-slot="avatar"
                              style={{this.tone person.tone}}
                              title={{person.label}}
                            >{{person.initials}}</span>
                          {{else}}
                            <span data-slot="avatar" data-empty>?</span>
                          {{/if}}
                        {{/let}}
                      </div>
                      <p data-slot="title">{{issue.title}}</p>
                      <div data-slot="card-foot">
                        <span data-slot="priority" data-priority={{issue.priority}}>
                          {{icon (this.priorityIcon issue)}}
                        </span>
                        <span data-slot="tag" data-label={{issue.label}}>{{this.labelName
                            issue.label
                          }}</span>
                        {{#if issue.due}}
                          <span data-slot="due">{{issue.due}}</span>
                        {{/if}}
                      </div>
                    </div>
                  {{/each}}
                </div>
              </section>
            {{/each}}
          </div>
        </div>
      </main>

      {{#if this.modalOpen}}
        <div class="modal-backdrop" {{on "click" this.close}}></div>
        <div class="modal">
          <div class="modal-title">{{this.heading}}</div>
          <div class="dd">
            <div class="dd-label">Title</div>
            <input value={{this.title}} {{on "input" this.setTitle}} />
          </div>
          <div data-slot="grid">
            <Dropdown
              @label="Status"
              @value={{this.status}}
              @options={{this.columns}}
              @onChange={{this.setStatus}}
            />
            <Dropdown
              @label="Priority"
              @value={{this.priority}}
              @options={{this.priorities}}
              @onChange={{this.setPriority}}
            />
            <Dropdown
              @label="Type"
              @value={{this.label}}
              @options={{this.labels}}
              @onChange={{this.setLabel}}
            />
            <Dropdown
              @label="Assignee"
              @value={{this.assignee}}
              @options={{this.people}}
              @onChange={{this.setAssignee}}
              @placeholder="Unassigned"
              @searchable={{true}}
            />
            <DueDate @value={{this.due}} @onChange={{this.setDue}} />
          </div>
          <div data-slot="dialog-actions">
            {{#if this.editing}}
              <button type="button" class="danger" {{on "click" this.remove}}>Delete issue</button>
            {{/if}}
            <span data-slot="spacer"></span>
            <button type="button" {{on "click" this.close}}>Cancel</button>
            <button type="button" class="primary" {{on "click" this.save}}>Save issue</button>
          </div>
        </div>
      {{/if}}
    </div>
  </template>
}
