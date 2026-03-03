import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ThreadRegistry } from "./registry.js";
import type { Thread, ThreadTask } from "./types.js";

/**
 * Executor — spawns agents for thread tasks.
 *
 * Uses pi.exec() to dispatch `pi` subprocesses in the background.
 * Each task gets its own pi instance running with -p (print mode).
 */
export class ThreadExecutor {
	constructor(
		private pi: ExtensionAPI,
		private registry: ThreadRegistry
	) {}

	/** Run a single task via pi print mode */
	private async runTask(thread: Thread, task: ThreadTask): Promise<void> {
		const cwd = thread.config.cwd ?? process.cwd();
		this.registry.startTask(thread.id, task.id);

		try {
			const args = ["-p", task.prompt];
			if (task.model) {
				args.unshift("-m", task.model);
			}

			const result = await this.pi.exec("pi", args, {
				cwd,
				timeout: 10 * 60 * 1000, // 10 min default
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

	/** Execute a base thread — single task */
	async execBase(thread: Thread): Promise<void> {
		this.registry.startThread(thread.id);
		await this.runTask(thread, thread.tasks[0]);
	}

	/** Stagger launches to avoid OAuth lockfile races */
	private async staggeredAll(thread: Thread, tasks: ThreadTask[], delayMs = 500): Promise<void> {
		const promises: Promise<void>[] = [];
		for (let i = 0; i < tasks.length; i++) {
			if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
			promises.push(this.runTask(thread, tasks[i]));
		}
		await Promise.allSettled(promises);
	}

	/** Execute a parallel thread — all tasks concurrently (staggered) */
	async execParallel(thread: Thread): Promise<void> {
		this.registry.startThread(thread.id);
		await this.staggeredAll(thread, thread.tasks);
	}

	/** Execute a fusion thread — same prompt to N agents (staggered) */
	async execFusion(thread: Thread): Promise<void> {
		this.registry.startThread(thread.id);
		await this.staggeredAll(thread, thread.tasks);
	}

	/** Execute a chained thread — sequential with optional checkpoints */
	async execChained(thread: Thread, onCheckpoint?: (phase: number, task: ThreadTask) => Promise<boolean>): Promise<void> {
		this.registry.startThread(thread.id);

		for (let i = 0; i < thread.tasks.length; i++) {
			const task = thread.tasks[i];

			// Checkpoint before each phase (except first)
			if (i > 0 && onCheckpoint) {
				const proceed = await onCheckpoint(i, task);
				if (!proceed) {
					this.registry.kill(thread.id);
					return;
				}
			}

			await this.runTask(thread, task);

			// Stop if task failed
			if (task.state === "failed") return;
		}
	}

	/** Execute a long thread — same as base but with longer timeout */
	async execLong(thread: Thread): Promise<void> {
		this.registry.startThread(thread.id);
		// Override timeout for long threads
		const task = thread.tasks[0];
		const cwd = thread.config.cwd ?? process.cwd();
		this.registry.startTask(thread.id, task.id);

		try {
			const args = ["-p", task.prompt];
			if (task.model) args.unshift("-m", task.model);

			const timeout = thread.config.checkpointInterval ?? 60 * 60 * 1000; // 1 hour default
			const result = await this.pi.exec("pi", args, { cwd, timeout });

			if (result.code === 0) {
				this.registry.completeTask(thread.id, task.id, result.stdout);
			} else {
				this.registry.failTask(thread.id, task.id, result.stderr || `Exit code: ${result.code}`);
			}
		} catch (err: any) {
			this.registry.failTask(thread.id, task.id, err.message ?? String(err));
		}
	}

	/** Execute a zero-touch thread — run + verify */
	async execZero(thread: Thread): Promise<void> {
		this.registry.startThread(thread.id);
		const task = thread.tasks[0];
		const cwd = thread.config.cwd ?? process.cwd();
		this.registry.startTask(thread.id, task.id);

		try {
			// Run the main task
			const args = ["-p", task.prompt];
			if (task.model) args.unshift("-m", task.model);

			const result = await this.pi.exec("pi", args, { cwd, timeout: 30 * 60 * 1000 });

			if (result.code !== 0) {
				this.registry.failTask(thread.id, task.id, result.stderr || `Exit code: ${result.code}`);
				return;
			}

			// Run verification if configured
			if (thread.config.verifyCommand) {
				const verify = await this.pi.exec("bash", ["-c", thread.config.verifyCommand], { cwd, timeout: 5 * 60 * 1000 });
				if (verify.code !== 0) {
					this.registry.failTask(thread.id, task.id, `Verification failed: ${verify.stderr || verify.stdout}`);
					return;
				}
			}

			this.registry.completeTask(thread.id, task.id, result.stdout);
		} catch (err: any) {
			this.registry.failTask(thread.id, task.id, err.message ?? String(err));
		}
	}

	/** Execute a meta thread — decompose into sub-threads */
	async execMeta(thread: Thread): Promise<void> {
		this.registry.startThread(thread.id);
		// Meta threads run tasks sequentially: scout → plan → build → review
		for (const task of thread.tasks) {
			await this.runTask(thread, task);
			if (task.state === "failed") return;
		}
	}

	/** Dispatch a thread based on its type */
	async dispatch(thread: Thread, opts?: { onCheckpoint?: (phase: number, task: ThreadTask) => Promise<boolean> }): Promise<void> {
		switch (thread.type) {
			case "base":
				return this.execBase(thread);
			case "parallel":
				return this.execParallel(thread);
			case "fusion":
				return this.execFusion(thread);
			case "chained":
				return this.execChained(thread, opts?.onCheckpoint);
			case "long":
				return this.execLong(thread);
			case "zero":
				return this.execZero(thread);
			case "meta":
				return this.execMeta(thread);
		}
	}
}
