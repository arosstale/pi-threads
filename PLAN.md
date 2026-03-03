# pi-threads — Thread Engineering for Pi

## Vision
A pi extension + dashboard that makes the 7 thread types from thread-engineering first-class citizens in pi. Instead of manually juggling terminals and worktrees, you say `/pthread "fix auth" "add tests" "update docs"` and pi-threads handles spawning, tracking, and reviewing.

## Architecture

```
pi-threads/
├── extensions/
│   └── index.ts              # Main extension entry (commands + tools + TUI)
├── src/
│   ├── core/
│   │   ├── thread.ts         # Thread abstraction (state machine)
│   │   ├── registry.ts       # Thread registry (track all active threads)
│   │   ├── executor.ts       # Spawns agents (subagent, interactive_shell)
│   │   └── types.ts          # Shared types
│   ├── threads/
│   │   ├── base.ts           # Base thread — single prompt → agent → review
│   │   ├── parallel.ts       # P-Thread — N independent agents
│   │   ├── chained.ts        # C-Thread — sequential phases with checkpoints
│   │   ├── fusion.ts         # F-Thread — same prompt to N agents, pick best
│   │   ├── meta.ts           # B-Thread — orchestrator dispatches sub-agents
│   │   ├── long.ts           # L-Thread — extended run with checkpointing
│   │   └── zero.ts           # Z-Thread — autonomous ship-it mode
│   ├── dashboard/
│   │   ├── index.ts          # Dashboard TUI component
│   │   ├── thread-card.ts    # Individual thread status card
│   │   └── overview.ts       # Overview with stats
│   └── utils/
│       ├── git.ts            # Worktree management
│       └── format.ts         # Output formatting
├── package.json
├── PLAN.md
└── README.md
```

## Thread Types & Commands

### 1. Base Thread
```
/thread "Fix the login bug"
```
Wraps a single prompt dispatch. Tracked in registry.

### 2. P-Thread (Parallel)
```
/pthread "fix auth" "add tests" "update docs"
/pthread --file tasks.yaml
```
Spawns N independent agents. Dashboard shows progress.

### 3. C-Thread (Chained)
```
/cthread phase1.md phase2.md phase3.md
/cthread --interactive
```
Sequential with human checkpoints between each phase.

### 4. F-Thread (Fusion)
```
/fthread "Design the auth system" --count 3
/fthread "Design the auth system" --models "sonnet,gemini,gpt"
```
Same prompt to N agents (optionally different models). Compare results, pick winner.

### 5. B-Thread (Meta)
```
/bthread "Build user dashboard feature"
```
Orchestrator decomposes into scout → plan → build → review sub-threads.

### 6. L-Thread (Long)
```
/lthread "Refactor entire codebase to ESM" --checkpoint-interval 30m
```
Extended autonomous run with periodic checkpointing.

### 7. Z-Thread (Zero-Touch)
```
/zthread "Fix all lint warnings" --verify "npm run lint"
```
Autonomous with self-verification. Ships when verify command passes.

## Dashboard
```
/threads           — Show active threads dashboard
/threads status    — Quick status summary
/threads kill <id> — Kill a thread
/threads review    — Review completed threads
```

## Shared Tools (LLM-callable)
- `thread_spawn` — Start any thread type
- `thread_status` — Check thread status
- `thread_kill` — Kill a thread
- `thread_review` — Get thread results

## Implementation Phases

### Phase 1: Core + Base + P-Thread (MVP)
- Thread state machine
- Registry
- Base thread (single dispatch)
- P-Thread (parallel dispatch via interactive_shell dispatch mode)
- `/threads` dashboard (basic)
- `/pthread` command

### Phase 2: F-Thread + C-Thread
- F-Thread with multi-model support
- C-Thread with checkpoint UI
- Dashboard improvements

### Phase 3: B-Thread + L-Thread
- Meta-thread orchestration
- Long-running with checkpointing
- Worktree integration

### Phase 4: Z-Thread + Polish
- Zero-touch with verification
- Full dashboard
- npm package for `pi install`

## Tech Stack
- TypeScript (pi extension)
- pi-tui components for dashboard
- interactive_shell dispatch mode for agent spawning
- subagent API for orchestration
- Git worktrees for isolation
