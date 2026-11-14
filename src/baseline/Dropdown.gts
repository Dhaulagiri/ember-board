import Component from "@glimmer/component"
import { tracked } from "@glimmer/tracking"
import { fn } from "@ember/helper"
import { on } from "@ember/modifier"
import { ChevronDown } from "lucide"
import { icon } from "../icon"

type Option = { value: string; label: string }

type Signature = {
  Args: {
    label: string
    value: string | null
    options: Option[]
    onChange: (value: string) => void
    placeholder?: string
    searchable?: boolean
  }
}

export default class Dropdown extends Component<Signature> {
  @tracked open = false
  @tracked filter = ""

  get current() {
    return this.args.options.find((option) => option.value === this.args.value)
  }

  get shown() {
    const filter = this.filter.toLowerCase()
    return this.args.options.filter((option) =>
      option.label.toLowerCase().includes(filter)
    )
  }

  toggle = () => {
    this.open = !this.open
    this.filter = ""
  }

  choose = (value: string) => {
    this.args.onChange(value)
    this.open = false
  }

  setFilter = (event: Event) =>
    (this.filter = (event.target as HTMLInputElement).value)

  <template>
    <div class="dd">
      <div class="dd-label">{{@label}}</div>
      <div class="dd-trigger" {{on "click" this.toggle}}>
        {{#if this.current}}{{this.current.label}}{{else}}<span
            class="dd-placeholder"
          >{{@placeholder}}</span>{{/if}}
        {{icon ChevronDown}}
      </div>
      {{#if this.open}}
        <div class="dd-menu">
          {{#if @searchable}}
            <input
              class="dd-search"
              placeholder="Filter…"
              value={{this.filter}}
              {{on "input" this.setFilter}}
            />
          {{/if}}
          {{#each this.shown as |option|}}
            <div class="dd-option" {{on "click" (fn this.choose option.value)}}>
              {{option.label}}
            </div>
          {{/each}}
        </div>
      {{/if}}
    </div>
  </template>
}
