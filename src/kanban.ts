import {
  createChange,
  createRovingFocus,
  createTransfer,
  createUndoStack,
  css,
  definePrimitive,
  matchesShortcut,
  selects,
  spatialMove,
  type ChangeDetails,
  type TransferDraft,
  type TransferLists,
  type TransferReason,
} from "@ui-sdk/core"

type KanbanListsChangeReason = TransferReason | "undo" | "redo"

type KanbanOptions = {
  lists?: TransferLists
  defaultLists?: TransferLists
  onListsChange?: (
    lists: TransferLists,
    details: ChangeDetails<KanbanListsChangeReason>
  ) => void
  limits?: Record<string, number>
  labels?: Record<string, string>
  cardLabels?: Record<string, string>
}

type KanbanState = {
  lists: TransferLists
  moving: TransferDraft | null
  focused: string | null
  canUndo: boolean
  canRedo: boolean
}

const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()

const matches = (label: string, query: string) =>
  fold(label).includes(fold(query))

// A control inside a card, like its Edit button, keeps its own keys and
// clicks: dragging captures the pointer, which would steal the click.
const fromControl = (event: Event, card: Element | null | undefined) => {
  const control = (event.target as Element).closest(
    "a[href], button, input, select, textarea, [role='button']"
  )
  return !!control && control !== card && !!card?.contains(control)
}

const kanban = /* @__PURE__ */ definePrimitive({
  name: "kanban",
  options: {
    lists: "value",
    defaultLists: "value",
    onListsChange: "callback",
    limits: "value",
    labels: "value",
    cardLabels: "value",
  },
  state: (options: KanbanOptions): KanbanState => ({
    lists: options.lists ?? options.defaultLists ?? {},
    moving: null,
    focused: null,
    canUndo: false,
    canRedo: false,
  }),
  sync: (options) =>
    options.lists === undefined ? {} : { lists: options.lists },
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const stack = createUndoStack(store.get().lists)
    const roving = createRovingFocus<KanbanState, { value: string }>(context, {
      slot: "card",
      key: "focused",
      move: spatialMove(),
    })
    const syncStack = () =>
      store.set({ canUndo: stack.canUndo(), canRedo: stack.canRedo() })
    const limit = (list: string) => context.options().limits?.[list]
    const transfer = createTransfer<KanbanState>(context, {
      key: "lists",
      draft: "moving",
      set: (value, details) => {
        if (!change("lists", value, details)) {
          return false
        }
        stack.record(value)
        syncStack()
        return true
      },
      order: () => Object.keys(store.get().lists),
      accepts: (_key, list) => {
        const most = limit(list)
        return most === undefined || store.get().lists[list].length < most
      },
      listLabel: (list) => context.options().labels?.[list],
      label: (key) => context.options().cardLabels?.[key],
    })
    const find = (names: Record<string, string> | undefined, query: string) =>
      Object.keys(names ?? {}).find(
        (key) => key === query || matches(names![key], query)
      )
    const travel = (
      lists: TransferLists | undefined,
      reason: "undo" | "redo",
      event?: Event
    ) => {
      if (lists) {
        change("lists", lists, { reason, event })
      }
      syncStack()
    }
    const api = {
      roving,
      transfer,
      limit,
      columns: () =>
        Object.entries(context.options().labels ?? {}).map(
          ([value, label]) => ({ value, label })
        ),
      /** Moves a card, by its id or title, to the end of a column, by its key or name. */
      moveCard(card: string, column: string) {
        const key = find(context.options().cardLabels, card)
        const list = find(context.options().labels, column)
        if (!key || !list) {
          throw new Error(
            `No ${key ? "column" : "card"} named "${key ? column : card}".`
          )
        }
        if (!transfer.move(key, list, store.get().lists[list].length)) {
          throw new Error(`${column} can't take "${card}".`)
        }
      },
      undo: (event?: Event) => travel(stack.undo(), "undo", event),
      redo: (event?: Event) => travel(stack.redo(), "redo", event),
      cardKeydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (!transfer.keydown(event, key)) {
          roving.keydown(event, el)
        }
      },
      rootKeydown(event: KeyboardEvent) {
        if (store.get().moving) {
          return
        }
        if (matchesShortcut(event, "mod+z")) {
          api.undo(event)
        } else if (
          matchesShortcut(event, "mod+shift+z") ||
          matchesShortcut(event, "control+y")
        ) {
          api.redo(event)
        } else {
          return
        }
        event.preventDefault()
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot<{}, { lists: TransferLists; moving: boolean }>({
      state: (state, { api }) => ({
        lists: api.transfer.lists(state),
        moving: !!state.moving,
      }),
      attrs: (_state, { id }) => ({
        role: "application",
        "aria-roledescription": "board",
        "aria-describedby": `${id}-instructions`,
      }),
      on: { keydown: (event, { api }) => api.rootKeydown(event) },
    }),
    column: slot<{ value: string }, { cards: string[]; full: boolean }>({
      props: { value: "string" },
      state: (state, { api, key }) => {
        const cards = api.transfer.lists(state)[key] ?? []
        const most = api.limit(key)
        return { cards, full: most !== undefined && cards.length >= most }
      },
      attrs: () => ({ role: "list" }),
      bind: (el, { api, key }) => api.transfer.bindList(el, key),
    }),
    card: slot<{ value: string }, { moving: boolean; dragging: boolean }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      state: (state, { key, api }) => ({
        moving: api.transfer.moving(state, key),
        dragging: api.transfer.dragging(state, key),
      }),
      attrs: (state, part) => ({
        role: "listitem",
        "aria-roledescription": "card",
        tabindex: part.api.roving.tabIndex(state, part),
        "data-moving": part.api.transfer.moving(state, part.key)
          ? ""
          : undefined,
        "data-dragging": part.api.transfer.dragging(state, part.key)
          ? ""
          : undefined,
        style: css({ "touch-action": "none" }),
      }),
      on: {
        keydown: (event, { el, api, key }) =>
          el && !fromControl(event, el) && api.cardKeydown(event, el, key),
        pointerdown: (event, { el, api, key }) =>
          !fromControl(event, el) && api.transfer.pointerdown(event, key),
      },
      bind: (el, part) => {
        const unbindRoving = part.api.roving.bind(el, part)
        const unbindTransfer = part.api.transfer.bindItem(el, part.key)
        return () => {
          unbindRoving?.()
          unbindTransfer()
        }
      },
    }),
    undo: slot<{}, { disabled: boolean }>({
      state: (state) => ({ disabled: !state.canUndo }),
      attrs: (state) => ({
        type: "button",
        disabled: state.canUndo ? undefined : "",
      }),
      press: ({ api }, event) => api.undo(event),
    }),
    redo: slot<{}, { disabled: boolean }>({
      state: (state) => ({ disabled: !state.canRedo }),
      attrs: (state) => ({
        type: "button",
        disabled: state.canRedo ? undefined : "",
      }),
      press: ({ api }, event) => api.redo(event),
    }),
    instructions: slot({
      attrs: (_state, { id }) => ({ id: `${id}-instructions`, hidden: "" }),
    }),
  }),
  agent: {
    actions: ["moveCard", "undo", "redo"],
    items: (api) =>
      (api as { columns: () => { value: string; label: string }[] }).columns(),
  },
})

export { kanban, type KanbanListsChangeReason }
