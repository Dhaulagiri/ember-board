import { AgentError, handleAgent } from "../server/agent"

export async function POST(request: Request) {
  try {
    return Response.json(await handleAgent(await request.text()))
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: error instanceof AgentError ? error.status : 500 }
    )
  }
}
