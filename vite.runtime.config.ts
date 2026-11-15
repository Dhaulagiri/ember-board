import { resolve } from "node:path"
import { defineConfig } from "vite"
import { ember } from "./ember-plugin.ts"

export default defineConfig({
  plugins: [ember({ build: "prod" })],
  publicDir: false,
  resolve: {
    dedupe: ["ember-source", "@glimmer/component", "@glimmer/tracking"],
  },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "public/runtime",
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/runtime/runtime.ts"),
      formats: ["iife"],
      name: "uiRuntime",
      fileName: () => "runtime.js",
    },
  },
})
