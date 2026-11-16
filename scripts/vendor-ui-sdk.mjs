import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join, resolve } from "node:path"

const repo = resolve(
  process.argv[2] ?? join(import.meta.dirname, "..", "..", "ui-sdk-ember")
)
const pkgDir = join(repo, "packages", "ember-ui-sdk")
const root = join(import.meta.dirname, "..")
const vendor = join(root, "vendor")
const to = join(vendor, "ember-ui-sdk")
const skip = /(\.test\.ts|\.spec\.ts|__tests__)/

rmSync(vendor, { recursive: true, force: true })
cpSync(join(pkgDir, "src"), join(to, "src"), {
  recursive: true,
  filter: (path) => !skip.test(path),
})
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"))
delete pkg.publishConfig
delete pkg.scripts
delete pkg.devDependencies
delete pkg.dependencies
writeFileSync(join(to, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`)

const docs = join(root, "public", "docs", "ember")
rmSync(docs, { recursive: true, force: true })
cpSync(join(pkgDir, "docs", "llms.txt"), join(docs, "llms.txt"))
cpSync(join(pkgDir, "docs", "components"), join(docs, "components"), {
  recursive: true,
})

const git = (...args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim()
const commit = git("rev-parse", "--short", "HEAD")
const dirty = git("status", "--porcelain", "packages/ember-ui-sdk")
writeFileSync(
  join(vendor, "VERSION"),
  `${commit}${dirty ? " plus uncommitted changes" : ""}\n`
)
console.log(
  `Vendored ember-ui-sdk from ${repo} at ${commit}${dirty ? " (dirty)" : ""}.`
)
