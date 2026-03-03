import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ThreadRegistry } from "./registry.js";
import type { Thread, ThreadTask } from "./types.js";

/**
 * Executor — runs thread tasks.
 *
 * Two backends:
 * - "subagent": delegates to pi-subagents via sendUserMessage (inherits agent specialization, TUI, artifacts)
 * - "native": spawns pi -p directly (for fusion/zero where we need raw control)
 */
export class ThreadExecutor {
	constructor(
		private pi: ExtensionAPI,
		private registry: ThreadRegistry
	) {}

	// ── Native execution (pi -p) ────────────────────────────────

	private async runTaskNative(thread: Thread, task: ThreadTask): Promise<void> {
		const cwd = thread.config.cwd ?? process.cwd();
		this.registry.startTask(thread.id, task.id);

		try {
			const args = ["-p", task.prompt];
			if (task.model) args.unshift("-m", task.model);

			const result = await this.pi.exec("pi", args, {
				cwd,
				timeout: 10 * 60 * 1000,
			});

			if (result.code === 0) {
				this.registry.completeTask(thread.id, task.id, result.stdout);
			} else {
				this.registry.failTask(thread.id, task.id, result.stderr || `Exit code: ${result.code}`);
			}
		} catch (err: any) {
			this.registry.failTask(thread.id, task.id, err.message ?? String(err));
		}
	}

	// ── Subagent execution (via sendUserMessage) ────────────────

	private launchSubagentParallel(thread: Thread): void {
		const agent = thread.config.agent ?? "worker";
		const tasks = thread.tasks.map((t) => ({
			agent,
			task: t.prompt,
			...(t.model ? { model: t.model } : {}),
		}));

		// Send as a user message that pi-subagents will pick up
		this.pi.sendUserMessage(
			`Run these tasks in parallel using subagent:\n\`\`\`json\n${JSON.stringify({ tasks }, null, 2)}\n\`\`\``,
			{ deliverAs: "followUp" }
		);

		// Mark all tasks as running (subagent handles the rest)
		this.registry.startThread(thread.id);
		for (const task of thread.tasks) {
			this.registry.startTask(thread.id, task.id);
		}
	}

	private launchSubagentChain(thread: Thread): void {
		const agent = thread.config.agent ?? "worker";
		const chain = thread.tasks.map((t, i) => ({
			agent,
			task: i === 0 ? t.prompt : `Continue: ${t.prompt}. Previous context: {previous}`,
			...(t.model ? { model: t.model } : {}),
		}));

		this.pi.sendUserMessage(
			`Run this chain using subagent:\n\`\`\`json\n${JSON.stringify({ chain }, null, 2)}\n\`\`\``,
			{ deliverAs: "followUp" }
		);

		this.registry.startThread(thread.id);
		this.registry.startTask(thread.id, thread.tasks[0].id);
	}

	private launchSubagentMeta(thread: Thread): void {
		const chain = [
			{ agent: "scout", task: thread.tasks[0]?.prompt ?? "Scout the codebase" },
			{ agent: "planner", task: "{previous}" },
			{ agent: "worker", task: "{previous}" },
			{ agent: "reviewer", task: "{previous}" },
		];

		this.pi.sendUserMessage(
			`Run this meta pipeline using subagent:\n\`\`\`json\n${JSON.stringify({ chain }, null, 2)}\n\`\`\``,
			{ deliverAs: "followUp" }
		);

		this.registry.startThread(thread.id);
		this.registry.startTask(thread.id, thread.tasks[0].id);
	}

	// ── Fusion (native, multi-model) ────────────────────────────

	async execFusion(thread: Thread): Promise<void> {
		this.registry.startThread(thread.id);
		// All tasks run in parallel with potentially different models
		await Promise.allSettled(thread.tasks.map((task) => this.runTaskNative(thread, task)));
	}

	// ── Zero-touch (native + verification) ──────────────────────

	async execZero(thread: Thread): Promise<void> {
		this.registry.startThread(thread.id);
		const task = thread.tasks[0];
		await this.runTaskNative(thread, task);

		// If task succeeded and we have a verify command, run it
		if (task.state === "completed" && thread.config.verifyCommand) {
			const cwd = thread.config.cwd ?? process.cwd();
			try {
				const verify = await this.pi.exec("bash", ["-c", thread.config.verifyCommand], {
					cwd,
					timeout: 5 * 60 * 1000,
				});
				if (verify.code !== 0) {
					// Override the completed state to failed
					task.state = "failed";
					task.error = `Verification failed (${thread.config.verifyCommand}): ${verify.stderr || verify.stdout}`;
					thread.state = "failed";
					thread.completedAt = Date.now();
					thread.duration = thread.completedAt - (thread.startedAt ?? thread.createdAt);
				}
			} catch (err: any) {
				task.state = "failed";
				task.error = `Verification error: ${err.message}`;
				thread.state = "failed";
				thread.completedAt = Date.now();
			}
		}
	}

	// ── Dispatch ─────────────────────────────────────────────────

	async dispatch(
		thread: Thread,
		opts?: { onCheckpoint?: (phase: number, task: ThreadTask) => Promise<boolean> }
	): Promise<void> {
		const backend = thread.config.backend;

		if (backend === "subagent") {
			switch (thread.type) {
				case "parallel":
					return this.launchSubagentParallel(thread);
				case "chained":
					return this.launchSubagentChain(thread);
				case "meta":
					return this.launchSubagentMeta(thread);
				default:
					// Fall through to native for unsupported subagent types
					break;
			}
		}

		// Native execution
		switch (thread.type) {
			case "base":
			case "long":
				this.registry.startThread(thread.id);
				return this.runTaskNative(thread, thread.tasks[0]);
			case "parallel":
				this.registry.startThread(thread.id);
				await Promise.allSettled(thread.tasks.map((t) => this.runTaskNative(thread, t)));
				return;
			case "fusion":
				return this.execFusion(thread);
			case "zero":
				return this.execZero(thread);
			case "chained": {
				this.registry.startThread(thread.id);
				for (let i = 0; i < thread.tasks.length; i++) {
					if (i > 0 && opts?.onCheckpoint) {
						const proceed = await opts.onCheckpoint(i, thread.tasks[i]);
						if (!proceed) {
							this.registry.kill(thread.id);
							return;
						}
					}
					await this.runTaskNative(thread, thread.tasks[i]);
					if (thread.tasks[i].state === "failed") return;
				}
				return;
			}
			case "meta":
				this.registry.startThread(thread.id);
				for (const task of thread.tasks) {
					await this.runTaskNative(thread, task);
					if (task.state === "failed") return;
				}
				return;
		}
	}
}
