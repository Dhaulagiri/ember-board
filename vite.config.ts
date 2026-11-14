import { defineConfig, type Plugin } from "vite"
import { ember } from "./ember-plugin.ts"
import { AgentError, handleAgent } from "./server/agent.ts"

function agentProxy() {
  const plugin: Plugin = {
    name: "agent-proxy",
    configureServer(server) {
      server.middlewares.use("/api/agent", async (request, response) => {
        let body = ""
        for await (const chunk of request) {
          body += chunk
        }
        response.setHeader("content-type", "application/json")
        try {
          response.end(JSON.stringify(await handleAgent(body)))
        } catch (error) {
          response.statusCode = error instanceof AgentError ? error.status : 500
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            })
          )
        }
      })
    },
  }
  return plugin
}

export default defineConfig({
  plugins: [ember(), agentProxy()],
  resolve: {
    dedupe: ["ember-source", "@glimmer/component", "@glimmer/tracking"],
  },
  optimizeDeps: { exclude: ["@glimmer/component"] },
})
