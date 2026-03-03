# 🧵 pi-threads

Thread engineering for [pi](https://github.com/badlogic/pi-mono) — all 7 thread types + stories.

**Wraps pi-subagents** for P/C/B threads (inheriting agent specialization, chain artifacts, live progress). **Builds natively** what nobody else has: F-Thread (multi-model fusion), Z-Thread (verify gate), and Stories (goal → auto-decomposed thread phases).

## Install

```bash
pi install ./path/to/pi-threads
```

## Commands

| Command | Type | Backend | What |
|---------|------|---------|------|
| `/pthread` | P-Thread | subagent | N independent tasks in parallel |
| `/cthread` | C-Thread | subagent | Sequential phases via subagent chain |
| `/bthread` | B-Thread | subagent | scout → plan → build → review pipeline |
| `/fthread` | F-Thread | **native** | Same prompt → N models → compare (UNIQUE) |
| `/zthread` | Z-Thread | **native** | Autonomous + verify command gate (UNIQUE) |
| `/lthread` | L-Thread | native | Extended autonomous run |
| `/story` | Stories | mixed | Auto-decompose goal into thread phases (UNIQUE) |

## Unique Features (not in pi-subagents or pi-messenger)

### Fusion (`/fthread`)
Same prompt sent to multiple models in parallel. Compare results, pick the best.

```
/fthread "Design the caching architecture" --count 5
/fthread "Refactor the auth module" --models anthropic/claude-sonnet-4,google/gemini-2.5-pro,openai/gpt-4o
```

### Zero-Touch (`/zthread`)
Autonomous execution with a verification gate. Only ships if the verify command passes.

```
/zthread "Fix all ESLint warnings" --verify "npm run lint"
/zthread "Add input validation" --verify "npm test"
```

### Stories (`/story`)
A goal gets auto-decomposed into thread phases. pi-threads picks the right thread type for each phase.

```
/story "Add dark mode to the dashboard" --verify "npm test"
```

Auto-generates phases:
1. **Scout** (meta) — research the codebase
2. **Plan** (fusion) — 3 models brainstorm approaches
3. **Decide** (chained) — human picks the winner
4. **Build** (parallel) — implement across files
5. **Verify** (zero) — run tests

## Dashboard

```
/threads          — show all threads + stories
/threads kill t-001 — kill a thread
/threads review   — see completed results (fusion shows comparison)
/threads prune    — clear finished threads
/stories          — list all stories with phase progress
```

## LLM Tools

- `thread_spawn` — Start any thread type (auto-selects backend)
- `thread_status` — Check progress of threads and stories
- `thread_kill` — Stop a thread

## Architecture

```
Wrapper layer (pi-subagents):     Native layer (pi -p):
┌──────────────────────────┐     ┌────────────────────────┐
│ /pthread  → /parallel    │     │ /fthread  → N models   │
│ /cthread  → /chain       │     │ /zthread  → run+verify │
│ /bthread  → scout chain  │     │ /lthread  → long run   │
└──────────────────────────┘     └────────────────────────┘
                    ↕                        ↕
              ┌─────────────────────────────────┐
              │  ThreadRegistry (state machine)  │
              │  ThreadExecutor (dispatch)        │
              │  /threads dashboard               │
              │  /story orchestrator              │
              └─────────────────────────────────┘
```

## The Thread Framework

Based on [thread-engineering](https://github.com/disler/agentic-coding-patterns):

> A thread is a unit of engineering work: prompt at the start, review at the end, agent tool calls in between.
> The metric: **tool calls per unit of your attention**. Maximize this.

```
Base → P-Thread → C-Thread → F-Thread → B-Thread → L-Thread → Z-Thread
                                                                  ↑
                                                          The north star
```
