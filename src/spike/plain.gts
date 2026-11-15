import Component from "@glimmer/component"
import { tracked } from "@glimmer/tracking"
import { on } from "@ember/modifier"
import { fn } from "@ember/helper"

const tabs = ["Overview", "Activity", "Settings"]
const roles = ["Viewer", "Editor", "Admin"]

export default class Plain extends Component {
  @tracked tab = "Overview"
  @tracked role = "Viewer"
  @tracked open = false
  isTab = (tab: string) => (tab === this.tab ? "active" : "")
  pickTab = (tab: string) => (this.tab = tab)
  toggle = () => (this.open = !this.open)
  pickRole = (role: string) => {
    this.role = role
    this.open = false
  }
  <template>
    <div data-widget="tabs">
      <div class="tabs">
        {{#each tabs as |tab|}}
          <div class="tab {{this.isTab tab}}" {{on "click" (fn this.pickTab tab)}}>{{tab}}</div>
        {{/each}}
      </div>
      <div class="panel">{{this.tab}} content</div>
    </div>
    <div data-widget="combobox" style="margin-top: 24px">
      <div class="trigger" style="cursor: pointer" {{on "click" this.toggle}}>Role: {{this.role}}</div>
      {{#if this.open}}
        <div class="menu">
          {{#each roles as |role|}}
            <div style="cursor: pointer" {{on "click" (fn this.pickRole role)}}>{{role}}</div>
          {{/each}}
        </div>
      {{/if}}
    </div>
  </template>
}
