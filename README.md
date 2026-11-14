# Acme Board: Ember + ui-sdk

A Linear-style issue board in Ember, built on [`@ui-sdk/ember`](https://github.com/Dhaulagiri/ui/tree/ember-adapter/packages/ember), with an AI agent that operates it, plus the same board hand-rolled for comparison.

- `/` is the board on ui-sdk: a kanban made from a core primitive with `createParts` (drag, keyboard moves, undo), a ⌘K command palette, and an issue editor built from Dialog, Field, Input, Select, Combobox, DatePicker and Button. The Agent panel sends a task to Claude, which works the board through `snapshot`, `act` and `query`, with no screenshots and no clicks.
- `/baseline.html` is the same board, data and styles, hand-rolled: div dropdowns, a div calendar, and HTML5 drag and drop.

## Run it

```bash
pnpm install
ANTHROPIC_API_KEY=sk-ant-... pnpm dev
```

Open http://localhost:5320. The board works without a key; the Agent panel needs one.

## Benchmark

With the dev server running:

```bash
ANTHROPIC_API_KEY=sk-ant-... pnpm bench
```

Every task runs on both boards with the same model, prompt and success check, and a fresh page each run. The ui-sdk arm gets the bridge's three tools. The baseline arm gets browser tools: the accessibility tree, screenshots, click, type and key. Results print as a table and land in `bench/results/`.

| Flag | Default |
| --- | --- |
| `--model` | `claude-haiku-5-5` (`claude-sonnet-5-5` to compare with the tweet) |
| `--effort` | `low` |
| `--runs` | `3` (the table reports medians) |
| `--arms` | `sdk,baseline` |
| `--tasks` | `move-assign,bulk-assign,create,reschedule` |
| `--headed` | off |

## ui-sdk version

`@ui-sdk/core` and `@ui-sdk/ember` aren't on npm, so `vendor/@ui-sdk` holds a copy of their source, linked as dependencies. `vendor/@ui-sdk/VERSION` says which commit it came from. To refresh it from a checkout of the fork next to this folder:

```bash
pnpm vendor
```

Commit `vendor/` so a deploy builds without the fork.

## Deploy to Vercel

Import the repository with the defaults from `vercel.json` (Vite, `pnpm build`, `dist`), and set `ANTHROPIC_API_KEY` in the project's environment variables. `api/agent.ts` serves the agent in production, sharing `server/agent.ts` with the dev server. It allows Haiku 5.5 and Sonnet 5.5 only, caps each request at 4,000 output tokens and a task at 60 messages, but anyone with the URL can spend the key, so give it a key with a spend limit.
