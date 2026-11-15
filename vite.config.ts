import { resolve } from "node:path"
import { defineConfig, type Plugin } from "vite"
import { ember } from "./ember-plugin.ts"
import { AgentError, handleAgent } from "./server/agent.ts"
import { CompileError, compileGts } from "./server/compile.ts"

const routes = {
  "/api/agent": handleAgent,
  "/api/compile": compileGts,
}

function apiRoutes() {
  const plugin: Plugin = {
    name: "api-routes",
    configureServer(server) {
      for (const [path, handle] of Object.entries(routes)) {
        server.middlewares.use(path, async (request, response) => {
          let body = ""
          for await (const chunk of request) {
            body += chunk
          }
          response.setHeader("content-type", "application/json")
          try {
            response.end(JSON.stringify(await handle(body)))
          } catch (error) {
            response.statusCode =
              error instanceof AgentError || error instanceof CompileError
                ? error.status
                : 500
            response.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              })
            )
          }
        })
      }
    },
  }
  return plugin
}

export default defineConfig({
  plugins: [ember(), apiRoutes()],
  resolve: {
    dedupe: ["ember-source", "@glimmer/component", "@glimmer/tracking"],
  },
  optimizeDeps: { exclude: ["@glimmer/component"] },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        baseline: resolve(import.meta.dirname, "baseline.html"),
        spike: resolve(import.meta.dirname, "spike.html"),
      },
    },
  },
})
