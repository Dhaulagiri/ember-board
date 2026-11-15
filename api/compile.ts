import { CompileError, compileGts } from "../server/compile.js"

export async function POST(request: Request) {
  try {
    return Response.json(await compileGts(await request.text()))
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: error instanceof CompileError ? error.status : 500 }
    )
  }
}
