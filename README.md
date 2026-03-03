# 🧵 pi-threads

Thread engineering for [pi](https://github.com/badlogic/pi-mono) — scale your agentic work with the 7 thread types.

## Install

```bash
pi install path:~/Projects/pi-threads
```

## Thread Types

| Type | Command | What it does |
|------|---------|--------------|
| **P-Thread** | `/pthread` | N independent tasks in parallel |
| **C-Thread** | `/cthread` | Sequential phases with human checkpoints |
| **F-Thread** | `/fthread` | Same prompt to N agents, pick the best |
| **B-Thread** | `/bthread` | Auto-decompose: scout → plan → build → review |
| **L-Thread** | `/lthread` | Extended autonomous run |
| **Z-Thread** | `/zthread` | Autonomous + verification, ships when tests pass |

## Usage

### Parallel — fire N independent tasks
```
/pthread "fix the auth bug" "add unit tests for auth" "update auth docs"
```

### Fusion — N agents compete on the same problem
```
/fthread "Design the caching layer architecture" --count 5
/fthread "Refactor the API" --models sonnet,gemini,gpt
```

### Chained — sequential with checkpoints
```
/cthread "migrate DB schema" "update ORM models" "run integration tests"
```

### Meta — automated scout → plan → build → review
```
/bthread "Add dark mode support to the dashboard"
```

### Zero-touch — autonomous with verification
```
/zthread "Fix all ESLint warnings" --verify "npm run lint"
```

## Dashboard

```
/threads          — show all threads
/threads kill t-001 — kill a thread
/threads review   — see completed results
/threads prune    — clear finished threads
```

## LLM Tools

The extension also registers tools the LLM can call directly:

- `thread_spawn` — Start any thread type
- `thread_status` — Check progress
- `thread_kill` — Stop a thread

## How It Works

Each thread task spawns a `pi -p` subprocess. Tasks run in your current working directory with full tool access. Results are captured and stored in the thread registry.

- **P-Threads**: All tasks run concurrently via `Promise.allSettled`
- **C-Threads**: Tasks run sequentially, with `ctx.ui.confirm()` between each phase
- **F-Threads**: Same as P-Thread but all tasks share the same prompt (optionally with different models)
- **B-Threads**: 4 sequential phases: research, plan, implement, review
- **L-Threads**: Single task with extended timeout (1 hour default)
- **Z-Threads**: Single task + verification command must pass

## The Thread Framework

Based on [thread-engineering](https://github.com/disler/agentic-coding-patterns):

> A thread is a unit of engineering work: prompt at the start, review at the end, agent tool calls in between.
> The metric: **tool calls per unit of your attention**. Maximize this.

```
Base → P-Thread → C-Thread → F-Thread → B-Thread → L-Thread → Z-Thread
                                                                  ↑
                                                          The north star
```
