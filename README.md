# Acme Board: Ember + ui-sdk

A Linear-style issue board in Ember, built on [`ember-ui-sdk`](https://github.com/Dhaulagiri/ui-sdk-ember/tree/main/packages/ember-ui-sdk), with an AI agent that operates it, plus the same board hand-rolled for comparison.

- `/` is the board on ui-sdk: a kanban made from a core primitive with `createParts` (drag, keyboard moves, undo), a ⌘K command palette, and an issue editor built from Dialog, Field, Input, Select, Combobox, DatePicker and Button. The Agent panel sends a task to Claude, which works the board through `snapshot`, `act` and `query`, with no screenshots and no clicks.
- `/baseline.html` is the same board, data and styles, hand-rolled: div dropdowns, a div calendar, and HTML5 drag and drop.
- `/arena.html` builds whatever you describe twice with Claude, from the same instructions: once in plain Ember, once with `ember-ui-sdk` and the docs it ships for agents. Both render in sandboxed frames, and a grader presses keys against every widget's WAI-ARIA pattern with `checkPattern` from `@ui-sdk/core/testing`. The scorecard compares problems, widgets passing, keyboard reach, lines, time, tokens and cost.

## How the arena works

1. Both builds stream from the browser with the visitor's key: Sonnet 5.5 at medium effort by default, or Haiku 5.5. Both are told to make the interface work with a keyboard and a screen reader, and to mark each widget's root with `data-widget` and its pattern name.
2. The ui-sdk build also gets `llms.txt` and a `read_docs` tool for component pages, the way the package tells agents to work. Its docs reads count in its tokens and cost.
3. `/api/compile` turns each `.gts` file into a module on the server. The page posts it into an iframe sandboxed to `allow-scripts`, so generated code can't reach the page, its storage or the key. A runtime posted in by the host page provides Ember and every `ember-ui-sdk` entry.
4. A build that doesn't compile or render gets one repair turn with the error, on either side.
5. **Download replay** saves a live run. `/arena.html?replay=<name>` plays one back from `public/arena/replays/`, labeled as recorded. `sample` holds two hand-written components for testing without a key.

## Run it

```bash
pnpm install
ANTHROPIC_API_KEY=sk-ant-... pnpm dev
```

Open http://localhost:5320. The board works without a key. For the Agent panel, either start the server with `ANTHROPIC_API_KEY` as above, or paste a key into the panel.

## Benchmarks

Both need the dev server running.

### Building: the arena

```bash
ANTHROPIC_API_KEY=sk-ant-... pnpm bench:arena
```

It drives `/arena.html` headless over ten prompts, three runs each, and reports medians per build: failures, repairs, pattern and keyboard problems, widgets checked and passing, lines, time, tokens, cost and docs read. Flags: `--model` (`claude-sonnet-5-5`), `--runs` (`3`), `--prompts` (how many of the ten), `--replay <name>` to test the runner without a key, and `--headed`. Results land in `bench/results/`.

Builds mark their own widgets, so compare the widgets-checked row before the passing rate.

### Operating: the board

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

`@ui-sdk/core` comes from npm. `ember-ui-sdk` isn't published yet, so `vendor/ember-ui-sdk` holds a copy of its source from [ui-sdk-ember](https://github.com/Dhaulagiri/ui-sdk-ember), linked as a dependency. `vendor/VERSION` says which commit it came from. To refresh it from a checkout of ui-sdk-ember next to this folder:

```bash
pnpm vendor
```

Commit `vendor/` and `public/docs/ember` so a deploy builds without that checkout.

Once `ember-ui-sdk` is on npm, switch to it by changing one line in `package.json`, from `"ember-ui-sdk": "link:./vendor/ember-ui-sdk"` to `"ember-ui-sdk": "^0.1.0"`. Then run `pnpm install` and delete `vendor/` and `scripts/vendor-ui-sdk.mjs`. The arena runtime also reads the package from `vendor/ember-ui-sdk` (`src/runtime/runtime.ts`); point those paths at `node_modules/ember-ui-sdk`, and copy `node_modules/ember-ui-sdk/docs` to `public/docs/ember` in the build.

## Deploy to Vercel

Import the repository with the defaults from `vercel.json` (Vite, `pnpm build`, `dist`). No environment variables are needed.

At demo time, paste an Anthropic API key into the Agent panel. The browser then calls the Claude API directly: the key stays in that tab's session storage, goes only to api.anthropic.com, and never reaches the deploy. **Forget** clears it, and closing the tab does too.

To let anyone run the agent without a key, set `ANTHROPIC_API_KEY` in the project's environment variables instead. `api/agent.ts` then serves the agent, sharing its request with the browser through `shared/agent-request.ts`: Haiku 5.5 and Sonnet 5.5 only, at most 4,000 output tokens a request and 60 messages a task. Anyone with the URL can spend that key, so give it a spend limit.
