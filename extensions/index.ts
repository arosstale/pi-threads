import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { ThreadRegistry, formatElapsed } from "../src/core/registry.js";
import { ThreadExecutor } from "../src/core/executor.js";
import type { Thread, ThreadType } from "../src/core/types.js";

export default function (pi: ExtensionAPI) {
	const registry = new ThreadRegistry();
	const executor = new ThreadExecutor(pi, registry);

	// ── Status bar updates ───────────────────────────────────────
	registry.on((event) => {
		const running = registry.byState("running");
		if (running.length > 0) {
			const labels = running.map((t) => {
				const sum = registry.summarize(t);
				return `${t.type[0].toUpperCase()}:${sum.progress}`;
			});
			pi.events.emit("threads:status", labels.join(" | "));
		} else {
			pi.events.emit("threads:status", null);
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		// Update footer status when threads change
		registry.on((event) => {
			const running = registry.byState("running");
			if (running.length > 0) {
				const parts = running.map((t) => {
					const sum = registry.summarize(t);
					return `🧵${sum.id} ${t.type[0].toUpperCase()}:${sum.progress}`;
				});
				ctx.ui.setStatus("pi-threads", parts.join(" "));
			} else {
				ctx.ui.setStatus("pi-threads", undefined);
			}
		});
	});

	// ── Dashboard rendering ──────────────────────────────────────

	function renderDashboard(theme: any): Text {
		const threads = registry.all();

		if (threads.length === 0) {
			return new Text(theme.fg("muted", "  No threads. Use /pthread, /fthread, etc. to start one."), 0, 0);
		}

		const lines: string[] = [];
		lines.push(theme.bold("  🧵 Thread Dashboard"));
		lines.push("");

		// Header
		const hdr = `  ${pad("ID", 7)} ${pad("Type", 10)} ${pad("State", 10)} ${pad("Progress", 10)} ${pad("Elapsed", 10)} Label`;
		lines.push(theme.fg("muted", hdr));
		lines.push(theme.fg("dim", "  " + "─".repeat(80)));

		for (const t of threads) {
			const sum = registry.summarize(t);
			const stateColor = stateToColor(sum.state);
			const typeIcon = typeToIcon(sum.type);

			let line = `  ${theme.fg("accent", pad(sum.id, 7))} `;
			line += `${pad(typeIcon + " " + sum.type, 10)} `;
			line += `${theme.fg(stateColor, pad(sum.state, 10))} `;
			line += `${pad(sum.progress, 10)} `;
			line += `${theme.fg("muted", pad(sum.elapsed, 10))} `;
			line += sum.label.length > 40 ? sum.label.slice(0, 37) + "..." : sum.label;
			lines.push(line);

			// Show task details for running threads
			if (sum.state === "running") {
				for (const task of t.tasks) {
					const icon = task.state === "completed" ? "✓" : task.state === "running" ? "⟳" : task.state === "failed" ? "✗" : "·";
					const taskColor = stateToColor(task.state);
					lines.push(theme.fg(taskColor, `    ${icon} ${task.id}: ${task.label}`));
				}
			}
		}

		lines.push("");
		lines.push(theme.fg("dim", "  /threads kill <id>  /threads review  /threads prune"));

		return new Text(lines.join("\n"), 0, 0);
	}

	function pad(s: string, n: number): string {
		return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
	}

	function stateToColor(state: string): string {
		switch (state) {
			case "running":
				return "warning";
			case "completed":
				return "success";
			case "failed":
				return "error";
			case "killed":
				return "error";
			default:
				return "muted";
		}
	}

	function typeToIcon(type: string): string {
		switch (type) {
			case "parallel":
				return "⫘";
			case "chained":
				return "⟶";
			case "fusion":
				return "⊕";
			case "meta":
				return "◎";
			case "long":
				return "∞";
			case "zero":
				return "⊘";
			default:
				return "·";
		}
	}

	// ── Parse quoted args: "task 1" "task 2" or plain words ──────

	function parseTaskArgs(args: string): string[] {
		const tasks: string[] = [];
		const re = /"([^"]+)"|'([^']+)'|(\S+)/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(args))) {
			tasks.push(m[1] ?? m[2] ?? m[3]);
		}
		return tasks;
	}

	// ── Commands ─────────────────────────────────────────────────

	/** /threads — dashboard */
	pi.registerCommand("threads", {
		description: "Thread dashboard — show/manage active threads",
		handler: async (args, ctx) => {
			if (!args || args.trim() === "" || args.trim() === "status") {
				// Show dashboard
				const threads = registry.all();
				if (threads.length === 0) {
					ctx.ui.notify("No threads active. Use /pthread, /fthread, etc.", "info");
				} else {
					const lines: string[] = ["🧵 Thread Dashboard", ""];
					for (const t of threads) {
						const s = registry.summarize(t);
						lines.push(`${s.id} [${s.type}] ${s.state} ${s.progress} (${s.elapsed}) — ${s.label}`);
					}
					ctx.ui.notify(lines.join("\n"), "info");
				}
				return;
			}

			const parts = args.trim().split(/\s+/);
			const cmd = parts[0];
			const id = parts[1];

			if (cmd === "kill" && id) {
				const t = registry.get(id);
				if (!t) {
					ctx.ui.notify(`Thread ${id} not found`, "error");
					return;
				}
				registry.kill(id);
				ctx.ui.notify(`Killed thread ${id}`, "warning");
				return;
			}

			if (cmd === "prune") {
				registry.prune();
				ctx.ui.notify("Pruned finished threads", "info");
				return;
			}

			if (cmd === "review") {
				const completed = registry.byState("completed");
				if (completed.length === 0) {
					ctx.ui.notify("No completed threads to review", "info");
					return;
				}
				for (const t of completed) {
					const results = t.tasks
						.filter((tk) => tk.result)
						.map((tk) => `── ${tk.id}: ${tk.label} ──\n${tk.result?.slice(0, 500)}`)
						.join("\n\n");
					ctx.ui.notify(`Thread ${t.id} results:\n${results}`, "info");
				}
				return;
			}

			ctx.ui.notify(`Unknown subcommand: ${cmd}. Use: status, kill <id>, review, prune`, "error");
		},
	});

	/** /pthread — parallel thread */
	pi.registerCommand("pthread", {
		description: 'Parallel thread — run N tasks concurrently. Usage: /pthread "task 1" "task 2" "task 3"',
		handler: async (args, ctx) => {
			if (!args?.trim()) {
				ctx.ui.notify('Usage: /pthread "task 1" "task 2" "task 3"', "error");
				return;
			}
			const tasks = parseTaskArgs(args);
			if (tasks.length === 0) {
				ctx.ui.notify("No tasks specified", "error");
				return;
			}

			const label = tasks.length === 1 ? tasks[0] : `${tasks.length} parallel tasks`;
			const thread = registry.create("parallel", label, tasks, { cwd: ctx.cwd });

			ctx.ui.notify(`🧵 P-Thread ${thread.id}: Dispatching ${tasks.length} task(s)...`, "info");

			// Fire and forget — runs in background
			executor.dispatch(thread).then(() => {
				if (thread.state === "completed") {
					ctx.ui.notify(`✅ P-Thread ${thread.id} completed! Use /threads review`, "info");
				} else {
					ctx.ui.notify(`❌ P-Thread ${thread.id} ${thread.state}`, "error");
				}
			});
		},
	});

	/** /fthread — fusion thread */
	pi.registerCommand("fthread", {
		description: 'Fusion thread — same prompt to N agents. Usage: /fthread "prompt" [--count N] [--models m1,m2]',
		handler: async (args, ctx) => {
			if (!args?.trim()) {
				ctx.ui.notify('Usage: /fthread "prompt" [--count 3] [--models sonnet,gemini]', "error");
				return;
			}

			// Parse flags
			let count = 3;
			let models: string[] | undefined;
			let prompt = args;

			const countMatch = args.match(/--count\s+(\d+)/);
			if (countMatch) {
				count = parseInt(countMatch[1]);
				prompt = prompt.replace(countMatch[0], "").trim();
			}

			const modelsMatch = args.match(/--models\s+([\w,.-]+)/);
			if (modelsMatch) {
				models = modelsMatch[1].split(",");
				count = models.length;
				prompt = prompt.replace(modelsMatch[0], "").trim();
			}

			// Strip quotes from prompt
			prompt = prompt.replace(/^["']|["']$/g, "").trim();
			if (!prompt) {
				ctx.ui.notify("No prompt specified", "error");
				return;
			}

			// Create N copies of the same prompt
			const prompts = Array(count).fill(prompt);
			const thread = registry.create("fusion", `Fusion: ${prompt.slice(0, 40)}`, prompts, { models, cwd: ctx.cwd });

			ctx.ui.notify(`🧵 F-Thread ${thread.id}: ${count} agents competing on "${prompt.slice(0, 50)}"...`, "info");

			executor.dispatch(thread).then(() => {
				if (thread.state === "completed") {
					ctx.ui.notify(`✅ F-Thread ${thread.id} completed! ${count} results ready. Use /threads review`, "info");
				} else {
					ctx.ui.notify(`❌ F-Thread ${thread.id} ${thread.state}`, "error");
				}
			});
		},
	});

	/** /cthread — chained thread */
	pi.registerCommand("cthread", {
		description: 'Chained thread — sequential phases. Usage: /cthread "phase 1" "phase 2" "phase 3"',
		handler: async (args, ctx) => {
			if (!args?.trim()) {
				ctx.ui.notify('Usage: /cthread "phase 1" "phase 2" "phase 3"', "error");
				return;
			}

			const phases = parseTaskArgs(args);
			if (phases.length < 2) {
				ctx.ui.notify("Need at least 2 phases for a chained thread", "error");
				return;
			}

			const thread = registry.create("chained", `Chain: ${phases.length} phases`, phases, { cwd: ctx.cwd });

			ctx.ui.notify(`🧵 C-Thread ${thread.id}: ${phases.length} phases with checkpoints...`, "info");

			executor
				.dispatch(thread, {
					onCheckpoint: async (phase, task) => {
						const proceed = await ctx.ui.confirm(
							`Phase ${phase + 1} checkpoint`,
							`Phase ${phase} done. Proceed to: "${task.prompt.slice(0, 80)}"?`
						);
						return proceed;
					},
				})
				.then(() => {
					if (thread.state === "completed") {
						ctx.ui.notify(`✅ C-Thread ${thread.id} all phases done!`, "info");
					} else if (thread.state !== "killed") {
						ctx.ui.notify(`❌ C-Thread ${thread.id} ${thread.state}`, "error");
					}
				});
		},
	});

	/** /bthread — meta thread (scout → plan → build → review) */
	pi.registerCommand("bthread", {
		description: "Meta thread — auto-decompose into scout → plan → build → review",
		handler: async (args, ctx) => {
			if (!args?.trim()) {
				ctx.ui.notify("Usage: /bthread <description of feature/task>", "error");
				return;
			}

			const prompt = args.trim();
			const phases = [
				`Research and scout: ${prompt}. List files involved, patterns used, and constraints.`,
				`Create a detailed implementation plan for: ${prompt}. Based on the codebase research.`,
				`Implement the plan for: ${prompt}. Follow the plan precisely.`,
				`Review the implementation of: ${prompt}. Check for bugs, edge cases, and style.`,
			];

			const thread = registry.create("meta", `Meta: ${prompt.slice(0, 40)}`, phases, { cwd: ctx.cwd });

			ctx.ui.notify(`🧵 B-Thread ${thread.id}: scout → plan → build → review for "${prompt.slice(0, 50)}"...`, "info");

			executor.dispatch(thread).then(() => {
				if (thread.state === "completed") {
					ctx.ui.notify(`✅ B-Thread ${thread.id} complete! Full pipeline done.`, "info");
				} else {
					ctx.ui.notify(`❌ B-Thread ${thread.id} ${thread.state}`, "error");
				}
			});
		},
	});

	/** /lthread — long-running thread */
	pi.registerCommand("lthread", {
		description: "Long thread — extended autonomous run. Usage: /lthread <prompt>",
		handler: async (args, ctx) => {
			if (!args?.trim()) {
				ctx.ui.notify("Usage: /lthread <prompt>", "error");
				return;
			}

			const thread = registry.create("long", `Long: ${args.slice(0, 40)}`, [args.trim()], { cwd: ctx.cwd });

			ctx.ui.notify(`🧵 L-Thread ${thread.id}: Extended run starting...`, "info");

			executor.dispatch(thread).then(() => {
				if (thread.state === "completed") {
					ctx.ui.notify(`✅ L-Thread ${thread.id} done!`, "info");
				} else {
					ctx.ui.notify(`❌ L-Thread ${thread.id} ${thread.state}`, "error");
				}
			});
		},
	});

	/** /zthread — zero-touch thread */
	pi.registerCommand("zthread", {
		description: 'Zero-touch — autonomous + verify. Usage: /zthread "prompt" --verify "npm test"',
		handler: async (args, ctx) => {
			if (!args?.trim()) {
				ctx.ui.notify('Usage: /zthread "prompt" --verify "npm test"', "error");
				return;
			}

			let prompt = args;
			let verifyCommand: string | undefined;

			const verifyMatch = args.match(/--verify\s+"([^"]+)"|--verify\s+(\S+)/);
			if (verifyMatch) {
				verifyCommand = verifyMatch[1] ?? verifyMatch[2];
				prompt = prompt.replace(verifyMatch[0], "").trim();
			}

			prompt = prompt.replace(/^["']|["']$/g, "").trim();

			const thread = registry.create("zero", `Zero: ${prompt.slice(0, 40)}`, [prompt], { cwd: ctx.cwd });
			thread.config.verifyCommand = verifyCommand;

			ctx.ui.notify(
				`🧵 Z-Thread ${thread.id}: Zero-touch${verifyCommand ? ` (verify: ${verifyCommand})` : ""}...`,
				"info"
			);

			executor.dispatch(thread).then(() => {
				if (thread.state === "completed") {
					ctx.ui.notify(`✅ Z-Thread ${thread.id} shipped!${verifyCommand ? " Verification passed." : ""}`, "info");
				} else {
					ctx.ui.notify(`❌ Z-Thread ${thread.id} ${thread.state}`, "error");
				}
			});
		},
	});

	// ── LLM-callable tools ───────────────────────────────────────

	pi.registerTool({
		name: "thread_spawn",
		label: "Thread Spawn",
		description:
			"Spawn a thread. Types: parallel (N independent tasks), fusion (same prompt to N agents), chained (sequential phases), meta (scout→plan→build→review), long (extended run), zero (autonomous + verify).",
		parameters: Type.Object({
			type: StringEnum(["parallel", "fusion", "chained", "meta", "long", "zero"] as const),
			prompts: Type.Array(Type.String(), { description: "Task prompts (for parallel/chained) or single prompt repeated (for fusion)" }),
			models: Type.Optional(Type.Array(Type.String(), { description: "Models for fusion threads" })),
			count: Type.Optional(Type.Number({ description: "Agent count for fusion (default 3)" })),
			verify: Type.Optional(Type.String({ description: "Verification command for zero-touch threads" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { type, prompts, models, count, verify } = params;
			let taskPrompts = prompts;

			if (type === "fusion") {
				const n = count ?? models?.length ?? 3;
				taskPrompts = Array(n).fill(prompts[0]);
			}

			if (type === "meta" && prompts.length === 1) {
				const p = prompts[0];
				taskPrompts = [
					`Research and scout: ${p}`,
					`Create implementation plan for: ${p}`,
					`Implement: ${p}`,
					`Review implementation of: ${p}`,
				];
			}

			const label = type === "fusion" ? `Fusion: ${prompts[0]?.slice(0, 40)}` : `${type}: ${prompts.length} tasks`;
			const thread = registry.create(type as any, label, taskPrompts, { models, cwd: ctx.cwd });

			if (verify) thread.config.verifyCommand = verify;

			// Dispatch in background
			executor.dispatch(thread);

			return {
				content: [{ type: "text", text: `Thread ${thread.id} (${type}) spawned with ${taskPrompts.length} task(s). Use /threads to monitor.` }],
				details: { threadId: thread.id, type, taskCount: taskPrompts.length },
			};
		},
		renderCall(args, theme) {
			return new Text(
				theme.fg("toolTitle", theme.bold("thread_spawn ")) +
					theme.fg("accent", args.type) +
					theme.fg("muted", ` (${args.prompts?.length ?? "?"} tasks)`),
				0,
				0
			);
		},
		renderResult(result, { expanded }, theme) {
			const text = result.content?.[0]?.type === "text" ? (result.content[0] as any).text : "Thread spawned";
			return new Text(theme.fg("success", text), 0, 0);
		},
	});

	pi.registerTool({
		name: "thread_status",
		label: "Thread Status",
		description: "Get status of all threads or a specific thread by ID",
		parameters: Type.Object({
			id: Type.Optional(Type.String({ description: "Thread ID (e.g. t-001). Omit for all." })),
		}),
		async execute(_toolCallId, params) {
			if (params.id) {
				const t = registry.get(params.id);
				if (!t) {
					return { content: [{ type: "text", text: `Thread ${params.id} not found` }], isError: true };
				}
				const sum = registry.summarize(t);
				const taskDetails = t.tasks
					.map((tk) => `  ${tk.id} [${tk.state}] ${tk.label}${tk.result ? "\n    " + tk.result.slice(0, 200) : ""}`)
					.join("\n");
				return {
					content: [
						{
							type: "text",
							text: `Thread ${sum.id} (${sum.type}) — ${sum.state} — ${sum.progress} — ${sum.elapsed}\n${taskDetails}`,
						},
					],
				};
			}

			const all = registry.all();
			if (all.length === 0) {
				return { content: [{ type: "text", text: "No threads." }] };
			}

			const lines = all.map((t) => {
				const s = registry.summarize(t);
				return `${s.id} [${s.type}] ${s.state} ${s.progress} (${s.elapsed}) — ${s.label}`;
			});
			return { content: [{ type: "text", text: lines.join("\n") }] };
		},
	});

	pi.registerTool({
		name: "thread_kill",
		label: "Thread Kill",
		description: "Kill a running thread by ID",
		parameters: Type.Object({
			id: Type.String({ description: "Thread ID to kill" }),
		}),
		async execute(_toolCallId, params) {
			const t = registry.get(params.id);
			if (!t) return { content: [{ type: "text", text: `Thread ${params.id} not found` }], isError: true };
			registry.kill(params.id);
			return { content: [{ type: "text", text: `Thread ${params.id} killed.` }] };
		},
	});
}
