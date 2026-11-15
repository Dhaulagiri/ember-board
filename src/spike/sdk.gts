import { Field } from "@ui-sdk/ember/field"
import { Select } from "@ui-sdk/ember/select"
import { Tabs } from "@ui-sdk/ember/tabs"

const tabs = ["Overview", "Activity", "Settings"]
const roles = ["Viewer", "Editor", "Admin"]

<template>
  <div data-widget="tabs">
    <Tabs @defaultValue="Overview" as |t|>
      <t.List aria-label="Project">
        {{#each tabs as |tab|}}
          <t.Tab @value={{tab}}>{{tab}}</t.Tab>
        {{/each}}
      </t.List>
      {{#each tabs as |tab|}}
        <t.Panel @value={{tab}}>{{tab}} content</t.Panel>
      {{/each}}
    </Tabs>
  </div>
  <div data-widget="combobox" style="margin-top: 24px">
    <Field as |f|>
      <f.Label>Role</f.Label>
      <Select @defaultValue="Viewer" as |s|>
        <s.Trigger @field={{f.field}}><s.Value /></s.Trigger>
        <s.Content>
          {{#each roles as |role|}}
            <s.Item @value={{role}}>{{role}}</s.Item>
          {{/each}}
        </s.Content>
      </Select>
    </Field>
  </div>
</template>
