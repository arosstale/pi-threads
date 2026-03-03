import type { Thread, ThreadEvent, ThreadState, ThreadSummary, ThreadTask, ThreadType } from "./types.js";

type EventHandler = (event: ThreadEvent) => void;

let nextId = 1;

/** Generate a thread ID like "t-001" */
function genId(): string {
	return `t-${String(nextId++).padStart(3, "0")}`;
}

/** Generate a task ID like "t-001.1" */
function genTaskId(threadId: string, index: number): string {
	return `${threadId}.${index + 1}`;
}

/** Format elapsed time */
export function formatElapsed(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	const rem = s % 60;
	if (m < 60) return `${m}m ${rem}s`;
	const h = Math.floor(m / 60);
	return `${h}h ${m % 60}m`;
}

/** Central registry for all threads */
export class ThreadRegistry {
	private threads = new Map<string, Thread>();
	private handlers: EventHandler[] = [];

	/** Subscribe to thread events */
	on(handler: EventHandler): () => void {
		this.handlers.push(handler);
		return () => {
			const idx = this.handlers.indexOf(handler);
			if (idx >= 0) this.handlers.splice(idx, 1);
		};
	}

	private emit(event: ThreadEvent) {
		for (const h of this.handlers) {
			try {
				h(event);
			} catch {
				// swallow
			}
		}
	}

	/** Create and register a new thread */
	create(type: ThreadType, label: string, prompts: string[], opts?: { models?: string[]; cwd?: string }): Thread {
		const threadId = genId();
		const tasks: ThreadTask[] = prompts.map((prompt, i) => ({
			id: genTaskId(threadId, i),
			label: prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt,
			prompt,
			model: opts?.models?.[i],
			state: "pending" as ThreadState,
		}));

		const thread: Thread = {
			id: threadId,
			type,
			label,
			state: "pending",
			config: { type, tasks, cwd: opts?.cwd },
			tasks,
			createdAt: Date.now(),
		};

		this.threads.set(threadId, thread);
		this.emit({ type: "thread_created", thread });
		return thread;
	}

	/** Get a thread by ID */
	get(id: string): Thread | undefined {
		return this.threads.get(id);
	}

	/** Get all threads */
	all(): Thread[] {
		return [...this.threads.values()];
	}

	/** Get threads by state */
	byState(state: ThreadState): Thread[] {
		return this.all().filter((t) => t.state === state);
	}

	/** Mark thread as started */
	startThread(id: string) {
		const t = this.threads.get(id);
		if (!t) return;
		t.state = "running";
		t.startedAt = Date.now();
		this.emit({ type: "thread_started", thread: t });
	}

	/** Mark a task as started */
	startTask(threadId: string, taskId: string, sessionId?: string) {
		const t = this.threads.get(threadId);
		if (!t) return;
		const task = t.tasks.find((tk) => tk.id === taskId);
		if (!task) return;
		task.state = "running";
		task.startedAt = Date.now();
		if (sessionId) task.sessionId = sessionId;
		this.emit({ type: "task_started", thread: t, task });
	}

	/** Mark a task as completed */
	completeTask(threadId: string, taskId: string, result?: string) {
		const t = this.threads.get(threadId);
		if (!t) return;
		const task = t.tasks.find((tk) => tk.id === taskId);
		if (!task) return;
		task.state = "completed";
		task.completedAt = Date.now();
		if (result) task.result = result;
		this.emit({ type: "task_completed", thread: t, task });

		// Check if all tasks are done
		if (t.tasks.every((tk) => tk.state === "completed")) {
			t.state = "completed";
			t.completedAt = Date.now();
			t.duration = t.completedAt - (t.startedAt ?? t.createdAt);
			this.emit({ type: "thread_completed", thread: t });
		}
	}

	/** Mark a task as failed */
	failTask(threadId: string, taskId: string, error: string) {
		const t = this.threads.get(threadId);
		if (!t) return;
		const task = t.tasks.find((tk) => tk.id === taskId);
		if (!task) return;
		task.state = "failed";
		task.completedAt = Date.now();
		task.error = error;
		this.emit({ type: "task_failed", thread: t, task });

		// Thread fails if any task fails (can be more nuanced later)
		t.state = "failed";
		t.completedAt = Date.now();
		t.duration = t.completedAt - (t.startedAt ?? t.createdAt);
		this.emit({ type: "thread_failed", thread: t });
	}

	/** Kill a thread and all its running tasks */
	kill(id: string) {
		const t = this.threads.get(id);
		if (!t) return;
		t.state = "killed";
		t.completedAt = Date.now();
		t.duration = t.completedAt - (t.startedAt ?? t.createdAt);
		for (const task of t.tasks) {
			if (task.state === "running" || task.state === "pending") {
				task.state = "killed";
				task.completedAt = Date.now();
			}
		}
		this.emit({ type: "thread_killed", thread: t });
	}

	/** Get summary for dashboard */
	summarize(thread: Thread): ThreadSummary {
		const done = thread.tasks.filter((t) => t.state === "completed").length;
		const total = thread.tasks.length;
		const elapsed = thread.startedAt ? formatElapsed(Date.now() - thread.startedAt) : "-";

		return {
			id: thread.id,
			type: thread.type,
			label: thread.label,
			state: thread.state,
			progress: `${done}/${total}`,
			elapsed,
		};
	}

	/** Clear completed/failed/killed threads */
	prune() {
		for (const [id, t] of this.threads) {
			if (t.state === "completed" || t.state === "failed" || t.state === "killed") {
				this.threads.delete(id);
			}
		}
	}
}
