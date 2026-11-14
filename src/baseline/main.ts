import { renderComponent } from "@ember/renderer"
import { Board } from "../data"
import "../styles.css"
import "./baseline.css"
import App from "./App.gts"

const board = new Board()

Object.assign(window, { __board: board })

renderComponent(App, {
  into: document.getElementById("root")!,
  args: { board },
})
