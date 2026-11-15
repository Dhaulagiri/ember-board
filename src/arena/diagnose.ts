// Ember's production errors for a template calling something that isn't
// there, like "reading 'manager'", don't say what. This names the
// `this.x` the template uses that the class never defines, so a repair turn
// knows what to fix.
function undefinedMembers(source: string) {
  const template = source.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? ""
  const script = source.replace(/<template>[\s\S]*?<\/template>/g, "")
  const defined = new Set(
    [
      ...script.matchAll(
        /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:static\s+)?(?:readonly\s+)?(?:get\s+|set\s+|async\s+)?(\w+)\s*[=(:;!?<]/gm
      ),
    ].map((match) => match[1])
  )
  defined.add("args")
  const used = new Set(
    [...template.matchAll(/\bthis\.(\w+)/g)].map((match) => match[1])
  )
  return [...used].filter((name) => !defined.has(name))
}

function explainRenderError(source: string, message: string) {
  const missing = undefinedMembers(source)
  if (!missing.length) {
    return message
  }
  return `${message}\n\nThe template uses ${missing.map((name) => `this.${name}`).join(", ")}, which the class never defines.`
}

export { explainRenderError, undefinedMembers }
