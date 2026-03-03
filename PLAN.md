# pi-threads — Thread Engineering for Pi

## Vision
All 7 thread types as first-class pi commands, plus Stories (goal → auto-decomposed phases).
Wraps pi-subagents where it excels. Builds natively what nobody else has.

## Architecture

Two backends:
1. **Subagent** — P/C/B threads delegate to pi-subagents (inherits agents, TUI, artifacts, chains)
2. **Native** — F/Z/L threads spawn `pi -p` directly (for multi-model fusion + verify gates)

Stories orchestrate across both backends — auto-picking the right thread type per phase.

## What's Unique (not in pi-subagents or pi-messenger)

| Feature | Why it's new |
|---------|-------------|
| F-Thread (fusion) | Multi-model competition on same prompt |
| Z-Thread (zero-touch) | Autonomous + verify command gate |
| Stories | Goal → auto-decomposed thread phases |
| Unified dashboard | One /threads view for all agent work |
| Fusion review | Side-by-side comparison of multi-model results |

## Files

```
extensions/index.ts     — Extension entry (commands, tools, dashboard, stories)
src/core/types.ts       — Thread, Task, Story, Phase types
src/core/registry.ts    — State machine + event bus + story tracking
src/core/executor.ts    — Dual backend: subagent delegation + native pi -p
```

## Status
- [x] Phase 1: Core types, registry, executor
- [x] Phase 2: All 7 thread commands
- [x] Phase 3: Stories (/story, /stories)
- [x] Phase 4: Subagent integration for P/C/B threads
- [x] Phase 5: Fusion with multi-model support
- [x] Phase 6: Zero-touch with verify gate
- [x] Phase 7: Dashboard as TUI custom component (Ctrl+Shift+T)
- [x] Phase 8: Session persistence (appendEntry + restore)
- [ ] Phase 9: npm publish
