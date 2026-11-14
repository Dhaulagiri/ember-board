import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join, resolve } from "node:path"

const ui = resolve(process.argv[2] ?? join(import.meta.dirname, "..", "..", "ui"))
const vendor = join(import.meta.dirname, "..", "vendor", "@ui-sdk")
const skip = /(\.test\.ts|\.spec\.ts|__tests__)/

rmSync(vendor, { recursive: true, force: true })
for (const name of ["core", "ember"]) {
  const from = join(ui, "packages", name)
  const to = join(vendor, name)
  cpSync(join(from, "src"), join(to, "src"), {
    recursive: true,
    filter: (path) => !skip.test(path),
  })
  const pkg = JSON.parse(readFileSync(join(from, "package.json"), "utf8"))
  delete pkg.publishConfig
  delete pkg.scripts
  delete pkg.devDependencies
  if (pkg.dependencies?.["@ui-sdk/core"]) {
    pkg.dependencies["@ui-sdk/core"] = "file:../core"
  }
  writeFileSync(join(to, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`)
}

const commit = execFileSync("git", ["-C", ui, "rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim()
const dirty = execFileSync("git", ["-C", ui, "status", "--porcelain", "packages/core", "packages/ember"], {
  encoding: "utf8",
}).trim()
writeFileSync(
  join(vendor, "VERSION"),
  `${commit}${dirty ? " plus uncommitted changes" : ""}\n`
)
console.log(`Vendored @ui-sdk/core and @ui-sdk/ember from ${ui} at ${commit}${dirty ? " (dirty)" : ""}.`)
