import Component from "@glimmer/component"
import { tracked } from "@glimmer/tracking"
import { fn } from "@ember/helper"
import { on } from "@ember/modifier"
import { Calendar, ChevronLeft, ChevronRight } from "lucide"
import { icon } from "../icon"

type Signature = {
  Args: { value: string | null; onChange: (value: string) => void }
}

const pad = (n: number) => String(n).padStart(2, "0")
const iso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export default class DueDate extends Component<Signature> {
  @tracked open = false
  @tracked month = new Date(2026, 10, 1)

  get heading() {
    return this.month.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    })
  }

  get days() {
    const first = new Date(this.month)
    const start = new Date(first)
    start.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(start)
      day.setDate(start.getDate() + i)
      return {
        iso: iso(day),
        n: day.getDate(),
        outside: day.getMonth() !== first.getMonth(),
        selected: iso(day) === this.args.value,
      }
    })
  }

  toggle = () => (this.open = !this.open)
  shift = (by: number) =>
    (this.month = new Date(
      this.month.getFullYear(),
      this.month.getMonth() + by,
      1
    ))
  pick = (value: string) => {
    this.args.onChange(value)
    this.open = false
  }

  <template>
    <div class="dd">
      <div class="dd-label">Due date</div>
      <div class="dd-trigger" {{on "click" this.toggle}}>
        {{#if @value}}{{@value}}{{else}}<span class="dd-placeholder">No date</span>{{/if}}
        {{icon Calendar}}
      </div>
      {{#if this.open}}
        <div class="dd-menu cal">
          <div class="cal-head">
            <span class="cal-nav" {{on "click" (fn this.shift -1)}}>{{icon
                ChevronLeft
              }}</span>
            {{this.heading}}
            <span class="cal-nav" {{on "click" (fn this.shift 1)}}>{{icon
                ChevronRight
              }}</span>
          </div>
          <div class="cal-grid">
            {{#each this.days as |day|}}
              <div
                class="cal-day {{if day.outside 'out'}} {{if day.selected 'sel'}}"
                {{on "click" (fn this.pick day.iso)}}
              >{{day.n}}</div>
            {{/each}}
          </div>
        </div>
      {{/if}}
    </div>
  </template>
}
