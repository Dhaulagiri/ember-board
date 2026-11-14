import Component from "@glimmer/component"
import { tracked } from "@glimmer/tracking"
import { Check, ChevronDown, Calendar, ChevronLeft, ChevronRight } from "lucide"
import type { DatePickerValue } from "@ui-sdk/core/date-picker"
import { Button } from "@ui-sdk/ember/button"
import { Combobox } from "@ui-sdk/ember/combobox"
import { DatePicker } from "@ui-sdk/ember/date-picker"
import { Dialog } from "@ui-sdk/ember/dialog"
import { Field } from "@ui-sdk/ember/field"
import { Input } from "@ui-sdk/ember/input"
import { Select } from "@ui-sdk/ember/select"
import {
  columns,
  labelOf,
  labels,
  people,
  priorities,
  type Board,
  type Label,
  type Priority,
  type Status,
} from "./data"
import { icon } from "./icon"

class Draft {
  @tracked title: string
  @tracked status: Status
  @tracked priority: Priority
  @tracked assignee: string | null
  @tracked assigneeQuery: string
  @tracked label: Label
  @tracked due: DatePickerValue

  id: string | null

  constructor(board: Board, id: string | null) {
    this.id = id
    const issue = id ? board.issues[id] : null
    this.title = issue?.title ?? ""
    this.status = id ? board.statusOf(id) : "todo"
    this.priority = issue?.priority ?? "medium"
    this.assignee = issue?.assignee ?? null
    this.assigneeQuery = personLabel(this.assignee ?? "")
    this.label = issue?.label ?? "feature"
    this.due = issue?.due ?? null
  }
}

type Signature = {
  Args: {
    board: Board
    draft: Draft
    open: boolean
    onOpenChange: (open: boolean) => void
    onSaved: (message: string) => void
  }
}

const personLabel = (value: string) => labelOf(people, value)

class IssueDialog extends Component<Signature> {
  columns = columns
  priorities = priorities
  labels = labels
  people = people
  personLabel = personLabel

  get draft() {
    return this.args.draft
  }

  get heading() {
    return this.draft.id ? `Edit ${this.draft.id}` : "New issue"
  }

  get deleteNote() {
    return `Deletes ${this.draft.id} "${this.draft.title}" for everyone`
  }

  setTitle = (value: string) => (this.draft.title = value)
  setStatus = (value: string | null) => (this.draft.status = value as Status)
  setPriority = (value: string | null) =>
    (this.draft.priority = value as Priority)
  setLabel = (value: string | null) => (this.draft.label = value as Label)
  setDue = (value: DatePickerValue) => (this.draft.due = value)
  setAssignee = (value: string | null) => {
    this.draft.assignee = value
    this.draft.assigneeQuery = personLabel(value ?? "")
  }
  setAssigneeQuery = (value: string) => (this.draft.assigneeQuery = value)

  save = () => {
    const { draft } = this
    const issue = {
      title: draft.title.trim() || "Untitled",
      priority: draft.priority,
      assignee: draft.assignee,
      label: draft.label,
      due: typeof draft.due === "string" ? draft.due : null,
    }
    if (draft.id) {
      this.args.board.update(draft.id, { ...issue, status: draft.status })
      this.args.onSaved(`Updated ${draft.id}`)
    } else {
      this.args.onSaved(`Created ${this.args.board.create(issue, draft.status)}`)
    }
    this.args.onOpenChange(false)
  }

  remove = () => {
    const id = this.draft.id!
    this.args.board.remove(id)
    this.args.onSaved(`Deleted ${id}`)
    this.args.onOpenChange(false)
  }

  <template>
    <Dialog @open={{@open}} @onOpenChange={{@onOpenChange}} as |d|>
      <d.Backdrop />
      <d.Content @keepMounted={{true}} class="issue-dialog">
        <d.Title>{{this.heading}}</d.Title>
        <Field as |f|>
          <f.Label>Title</f.Label>
          <Input
            @field={{f.field}}
            @value={{this.draft.title}}
            @onValueChange={{this.setTitle}}
            placeholder="What needs doing?"
          />
        </Field>
        <div data-slot="grid">
          <Field as |f|>
            <f.Label>Status</f.Label>
            <Select
              @value={{this.draft.status}}
              @onValueChange={{this.setStatus}}
              as |s|
            >
              <s.Trigger @field={{f.field}}>
                <s.Value />
                {{icon ChevronDown}}
              </s.Trigger>
              <s.Content>
                {{#each this.columns key="value" as |column|}}
                  <s.Item @value={{column.value}} as |item|>
                    {{column.label}}
                    <item.Indicator>{{icon Check}}</item.Indicator>
                  </s.Item>
                {{/each}}
              </s.Content>
            </Select>
          </Field>
          <Field as |f|>
            <f.Label>Priority</f.Label>
            <Select
              @value={{this.draft.priority}}
              @onValueChange={{this.setPriority}}
              as |s|
            >
              <s.Trigger @field={{f.field}}>
                <s.Value />
                {{icon ChevronDown}}
              </s.Trigger>
              <s.Content>
                {{#each this.priorities key="value" as |priority|}}
                  <s.Item @value={{priority.value}} as |item|>
                    {{priority.label}}
                    <item.Indicator>{{icon Check}}</item.Indicator>
                  </s.Item>
                {{/each}}
              </s.Content>
            </Select>
          </Field>
          <Field as |f|>
            <f.Label>Type</f.Label>
            <Select
              @value={{this.draft.label}}
              @onValueChange={{this.setLabel}}
              as |s|
            >
              <s.Trigger @field={{f.field}}>
                <s.Value />
                {{icon ChevronDown}}
              </s.Trigger>
              <s.Content>
                {{#each this.labels key="value" as |label|}}
                  <s.Item @value={{label.value}} as |item|>
                    {{label.label}}
                    <item.Indicator>{{icon Check}}</item.Indicator>
                  </s.Item>
                {{/each}}
              </s.Content>
            </Select>
          </Field>
          <Combobox
            @value={{this.draft.assignee}}
            @onValueChange={{this.setAssignee}}
            @query={{this.draft.assigneeQuery}}
            @onQueryChange={{this.setAssigneeQuery}}
            @itemToLabel={{this.personLabel}}
            as |c|
          >
            <div data-slot="field">
              <c.Label>Assignee</c.Label>
              <div data-slot="input-row">
                <c.Input placeholder="Unassigned" />
                <c.Trigger aria-label="Show people">{{icon
                    ChevronDown
                  }}</c.Trigger>
              </div>
            </div>
            <c.Content>
              <c.Empty>No one matches.</c.Empty>
              <c.List>
                {{#each this.people key="value" as |person|}}
                  <c.Item
                    @value={{person.value}}
                    @label={{person.label}}
                    as |item|
                  >
                    {{person.label}}
                    <item.Indicator>{{icon Check}}</item.Indicator>
                  </c.Item>
                {{/each}}
              </c.List>
            </c.Content>
          </Combobox>
          <DatePicker
            @value={{this.draft.due}}
            @onValueChange={{this.setDue}}
            as |dp|
          >
            <div data-slot="field">
              <span data-slot="label">Due date</span>
              <div data-slot="input-row">
                <dp.Input aria-label="Due date" />
                <dp.Trigger aria-label="Pick a due date">{{icon
                    Calendar
                  }}</dp.Trigger>
              </div>
            </div>
            <dp.Content>
              <div data-slot="calendar-head">
                <dp.Previous aria-label="Previous month">{{icon
                    ChevronLeft
                  }}</dp.Previous>
                <dp.Heading />
                <dp.Next aria-label="Next month">{{icon ChevronRight}}</dp.Next>
              </div>
              <dp.Grid />
            </dp.Content>
          </DatePicker>
        </div>
        <div data-slot="dialog-actions">
          {{#if this.draft.id}}
            <Button
              @onClick={{this.remove}}
              class="danger"
              data-agent-confirm={{this.deleteNote}}
            >Delete issue</Button>
          {{/if}}
          <span data-slot="spacer"></span>
          <d.Close>Cancel</d.Close>
          <Button @onClick={{this.save}} class="primary">Save issue</Button>
        </div>
      </d.Content>
    </Dialog>
  </template>
}

export { Draft, IssueDialog }
