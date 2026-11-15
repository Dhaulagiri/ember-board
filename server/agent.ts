import Anthropic from "@anthropic-ai/sdk"
import { AgentError, agentParams, type AgentRequest } from "../shared/agent-request.js"

const maxBodyBytes = 400_000

let client: Anthropic | undefined

async function handleAgent(raw: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const error = new AgentError(
      "This deploy has no API key. Paste your Anthropic API key in the Agent panel."
    )
    error.status = 401
    throw error
  }
  if (raw.length > maxBodyBytes) {
    throw new AgentError("The conversation is too long.")
  }
  client ??= new Anthropic()
  return client.messages.create(agentParams(JSON.parse(raw) as AgentRequest))
}

export { AgentError, handleAgent }
