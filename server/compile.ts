import { transformAsync } from "@babel/core"
import transformCommonjs from "@babel/plugin-transform-modules-commonjs"
import transformTypescript from "@babel/plugin-transform-typescript"
import templateCompilation from "babel-plugin-ember-template-compilation"
import { Preprocessor } from "content-tag"
import decoratorTransforms from "decorator-transforms"
import * as templateCompiler from "ember-source/ember-template-compiler/index.js"

const maxSourceBytes = 120_000
const preprocessor = new Preprocessor()

class CompileError extends Error {
  status = 422
}

// Turns one generated .gts file into a CommonJS function body, so a sandboxed
// iframe can run it as a classic script, with `require` serving the modules
// the runtime bundle registered.
async function compileGts(source: string) {
  if (source.length > maxSourceBytes) {
    throw new CompileError("The component is too large.")
  }
  let code: string
  try {
    code = preprocessor.process(source, { filename: "generated.gts" }).code
    const result = await transformAsync(code, {
      filename: "generated.ts",
      babelrc: false,
      configFile: false,
      sourceType: "module",
      plugins: [
        [transformTypescript, { allExtensions: true }],
        [
          templateCompilation,
          { compiler: templateCompiler, targetFormat: "wire" },
        ],
        [
          decoratorTransforms,
          { runtime: { import: "decorator-transforms/runtime" } },
        ],
        transformCommonjs,
      ],
    })
    code = result?.code ?? ""
  } catch (error) {
    throw new CompileError(error instanceof Error ? error.message : String(error))
  }
  const requires = [...code.matchAll(/require\("([^"]+)"\)/g)].map(
    (match) => match[1]
  )
  return { code, requires: [...new Set(requires)] }
}

export { CompileError, compileGts }
