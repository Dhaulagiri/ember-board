import { defineConfig } from "vite"
import { ember } from "./ember-plugin.ts"

export default defineConfig({
  plugins: [ember()],
  resolve: {
    dedupe: ["ember-source", "@glimmer/component", "@glimmer/tracking"],
  },
  optimizeDeps: { exclude: ["@glimmer/component"] },
})
