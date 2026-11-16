import { cpSync, rmSync } from "node:fs"
import { join } from "node:path"

const from = join(import.meta.dirname, "..", "node_modules", "ember-ui-sdk", "docs")
const to = join(import.meta.dirname, "..", "public", "docs", "ember")
rmSync(to, { recursive: true, force: true })
cpSync(from, to, { recursive: true })
