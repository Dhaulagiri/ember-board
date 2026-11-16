import { renderComponent } from "@ember/renderer"
import { agentTools, createAgent } from "ember-ui-sdk/agent"
import App from "./App.gts"
import { Board } from "./data"
import "./styles.css"

const agent = createAgent({
  allow: (step) => (step.confirm ? window.confirm(step.confirm) : true),
})
const board = new Board()

Object.assign(window, { __agent: agent, __agentTools: agentTools, __board: board })

renderComponent(App, {
  into: document.getElementById("root")!,
  args: { board, agent },
})
