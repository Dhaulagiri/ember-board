type Row = {
  id: string
  title: string
  priority: string
  assignee: string | null
  label: string
  due: string | null
  status: string
}

type Task = {
  name: string
  prompt: string
  check: (rows: Row[]) => boolean
}

const byTitle = (rows: Row[], title: string) =>
  rows.find((row) => row.title === title)

const tasks: Task[] = [
  {
    name: "move-assign",
    prompt:
      "Move “Fix login redirect loop” to In Progress and assign it to Maya Chen.",
    check: (rows) => {
      const row = byTitle(rows, "Fix login redirect loop")
      return row?.status === "progress" && row.assignee === "maya"
    },
  },
  {
    name: "bulk-assign",
    prompt:
      "Assign every unassigned issue with high or urgent priority to Leo Park. Leave everything else as it is.",
    check: (rows) =>
      byTitle(rows, "Fix login redirect loop")?.assignee === "leo" &&
      byTitle(rows, "Rate limit the search API")?.assignee === "leo" &&
      byTitle(rows, "Onboarding checklist")?.assignee === null,
  },
  {
    name: "create",
    prompt:
      "Create a new Bug titled “Search returns stale results” in Todo, with Urgent priority, assigned to Priya Shah, due November 20, 2026.",
    check: (rows) => {
      const row = byTitle(rows, "Search returns stale results")
      return (
        row?.status === "todo" &&
        row.priority === "urgent" &&
        row.assignee === "priya" &&
        row.label === "bug" &&
        row.due === "2026-11-20"
      )
    },
  },
  {
    name: "reschedule",
    prompt:
      "Set the due date of “Billing export to CSV” to December 5, 2026 and move it to In Review.",
    check: (rows) => {
      const row = byTitle(rows, "Billing export to CSV")
      return row?.due === "2026-12-05" && row.status === "review"
    },
  },
]

export { type Row, type Task, tasks }
