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

const htmlTags = new Set(
  "a p b i u s q em li ul ol dl dt dd div span label input button select option form table tr td th section nav main aside header footer h1 h2 h3 h4 h5 h6 img strong small code pre svg path textarea fieldset legend details summary dialog menu output progress meter time mark cite abbr style title link slot data".split(" ")
)

// A lowercase tag that is also a binding compiles as a component call.
function shadowedTags(source: string) {
  const template = [...source.matchAll(/<template>([\s\S]*?)<\/template>/g)].map((match) => match[1]).join("\n")
  const script = source.replace(/<template>[\s\S]*?<\/template>/g, "")
  const bound = new Set<string>()
  for (const match of script.matchAll(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+(\w+)/gm)) {
    bound.add(match[1])
  }
  for (const match of script.matchAll(/^\s*import\s+([^;]*?)\s+from\s/gm)) {
    for (const name of match[1].matchAll(/(?:\bas\s+)?(\w+)\s*(?=[,}]|$)/g)) {
      bound.add(name[1])
    }
    const named = match[1].match(/\{([^}]*)\}/)?.[1]
    for (const part of named?.split(",") ?? []) {
      const name = part.trim().split(/\s+as\s+/).pop()
      if (name) {
        bound.add(name)
      }
    }
    const lead = match[1].match(/^(\w+)/)?.[1]
    if (lead) {
      bound.add(lead)
    }
  }
  const scopes: { close: string; params: string[] }[] = []
  const used = new Set<string>()
  const token =
    /\{\{#([\w.-]+)([^}]*)\}\}|\{\{\/([\w.-]+)\}\}|<([A-Za-z@][\w.:-]*)\s[^>]*?\bas\s*\|([^|]*)\|[^>]*>|<\/([A-Za-z@][\w.:-]*)>|<([a-z]\w*)(?=[\s>/])|(\{\{else[^}]*\}\})/g
  for (const match of template.matchAll(token)) {
    const params = (match[2]?.match(/\bas\s*\|([^|]*)\|/)?.[1] ?? match[5] ?? "").trim().split(/\s+/).filter(Boolean)
    if (match[1] || match[4]) {
      scopes.push({ close: match[1] ?? match[4], params })
    } else if (match[3] || match[6]) {
      const index = scopes.map((scope) => scope.close).lastIndexOf(match[3] ?? match[6])
      if (index !== -1) {
        scopes.length = index
      }
    }
    if (match[8] && scopes.length) {
      scopes[scopes.length - 1].params = []
    }
    const tag = match[7]
    if (tag && (bound.has(tag) || scopes.some((scope) => scope.params.includes(tag)))) {
      used.add(tag)
    }
    if (match[4] && /\/>$/.test(match[0])) {
      scopes.pop()
    }
  }
  return [...used].filter((tag) => htmlTags.has(tag))
}

function explainRenderError(source: string, message: string) {
  const missing = undefinedMembers(source)
  const shadowed = /reading 'manager'|'compilable'/.test(message) ? shadowedTags(source) : []
  const notes = [
    ...(missing.length
      ? [`The template uses ${missing.map((name) => `this.${name}`).join(", ")}, which the class never defines.`]
      : []),
    ...shadowed.map(
      (tag) =>
        `\`<${tag}>\` is also a variable in scope (a const, import or block param), so Ember calls it as a component instead of rendering the element. Rename the variable.`
    ),
  ]
  return notes.length ? `${message}\n\n${notes.join(" ")}` : message
}

export { explainRenderError, shadowedTags, undefinedMembers }
