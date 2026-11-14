import { tracked } from "@glimmer/tracking"

type Status = "todo" | "progress" | "review" | "done"
type Priority = "urgent" | "high" | "medium" | "low"
type Label = "bug" | "feature" | "chore"

type Issue = {
  id: string
  title: string
  priority: Priority
  assignee: string | null
  label: Label
  due: string | null
}

const columns: { value: Status; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "progress", label: "In Progress" },
  { value: "review", label: "In Review" },
  { value: "done", label: "Done" },
]

const priorities: { value: Priority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
]

const labels: { value: Label; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "chore", label: "Chore" },
]

const people = [
  { value: "maya", label: "Maya Chen", initials: "MC", tone: "#e11d48" },
  { value: "leo", label: "Leo Park", initials: "LP", tone: "#0891b2" },
  { value: "priya", label: "Priya Shah", initials: "PS", tone: "#7c3aed" },
  { value: "sam", label: "Sam Ortiz", initials: "SO", tone: "#ca8a04" },
]

const seedIssues: Issue[] = [
  { id: "ACME-101", title: "Fix login redirect loop", priority: "urgent", assignee: null, label: "bug", due: "2026-11-18" },
  { id: "ACME-102", title: "Billing export to CSV", priority: "high", assignee: "priya", label: "feature", due: null },
  { id: "ACME-103", title: "Upgrade ember-source to 7.4", priority: "medium", assignee: "leo", label: "chore", due: null },
  { id: "ACME-104", title: "Onboarding checklist", priority: "low", assignee: null, label: "feature", due: null },
  { id: "ACME-105", title: "Rate limit the search API", priority: "high", assignee: null, label: "bug", due: "2026-11-21" },
  { id: "ACME-106", title: "Keyboard shortcuts sheet", priority: "medium", assignee: "sam", label: "feature", due: null },
  { id: "ACME-107", title: "Flaky checkout test", priority: "high", assignee: "maya", label: "bug", due: null },
  { id: "ACME-108", title: "Team invites by link", priority: "medium", assignee: "priya", label: "feature", due: "2026-11-28" },
  { id: "ACME-109", title: "Audit log retention", priority: "low", assignee: "leo", label: "chore", due: null },
  { id: "ACME-110", title: "Webhook retries", priority: "urgent", assignee: "maya", label: "feature", due: null },
  { id: "ACME-111", title: "Dark mode contrast pass", priority: "medium", assignee: "sam", label: "bug", due: null },
  { id: "ACME-112", title: "Remove legacy settings page", priority: "low", assignee: "leo", label: "chore", due: null },
]

const seedLists: Record<Status, string[]> = {
  todo: ["ACME-101", "ACME-102", "ACME-104", "ACME-105"],
  progress: ["ACME-103", "ACME-106", "ACME-107"],
  review: ["ACME-108", "ACME-110"],
  done: ["ACME-109", "ACME-111", "ACME-112"],
}

const labelOf = <T extends { value: string; label: string }>(
  list: T[],
  value: string | null
) => list.find((item) => item.value === value)?.label ?? ""

const personOf = (value: string | null) =>
  people.find((person) => person.value === value)

class Board {
  @tracked issues: Record<string, Issue> = Object.fromEntries(
    seedIssues.map((issue) => [issue.id, { ...issue }])
  )
  @tracked lists: Record<string, string[]> = structuredClone(seedLists)
  next = 113

  statusOf(id: string) {
    return Object.keys(this.lists).find((key) =>
      this.lists[key].includes(id)
    ) as Status
  }

  setLists = (lists: Record<string, string[]>) => {
    this.lists = lists
  }

  update(id: string, changes: Partial<Issue> & { status?: Status }) {
    const { status, ...rest } = changes
    this.issues = { ...this.issues, [id]: { ...this.issues[id], ...rest } }
    if (status && status !== this.statusOf(id)) {
      const lists = Object.fromEntries(
        Object.entries(this.lists).map(([key, ids]) => [
          key,
          ids.filter((other) => other !== id),
        ])
      )
      lists[status] = [...lists[status], id]
      this.lists = lists
    }
  }

  create(issue: Omit<Issue, "id">, status: Status) {
    const id = `ACME-${this.next++}`
    this.issues = { ...this.issues, [id]: { ...issue, id } }
    this.lists = { ...this.lists, [status]: [...this.lists[status], id] }
    return id
  }

  remove(id: string) {
    const { [id]: _removed, ...issues } = this.issues
    this.issues = issues
    this.lists = Object.fromEntries(
      Object.entries(this.lists).map(([key, ids]) => [
        key,
        ids.filter((other) => other !== id),
      ])
    )
  }

  snapshot() {
    return Object.values(this.issues).map((issue) => ({
      ...issue,
      status: this.statusOf(issue.id),
    }))
  }
}

export {
  Board,
  columns,
  type Issue,
  type Label,
  labelOf,
  labels,
  people,
  personOf,
  type Priority,
  priorities,
  type Status,
}
