/** Thread types from the thread engineering framework */
export type ThreadType = "base" | "parallel" | "chained" | "fusion" | "meta" | "long" | "zero";

/** Thread lifecycle states */
export type ThreadState = "pending" | "running" | "paused" | "completed" | "failed" | "killed";

/** A single unit of work within a thread */
export interface ThreadTask {
	id: string;
	label: string;
	prompt: string;
	model?: string;
	state: ThreadState;
	startedAt?: number;
	completedAt?: number;
	result?: string;
	error?: string;
	/** interactive_shell session ID or subagent run ID */
	sessionId?: string;
}

/** Thread configuration */
export interface ThreadConfig {
	type: ThreadType;
	tasks: ThreadTask[];
	/** For chained threads: require human checkpoint between phases */
	checkpoints?: boolean;
	/** For fusion threads: number of agents to run */
	count?: number;
	/** For fusion threads: models to use */
	models?: string[];
	/** For long threads: checkpoint interval in ms */
	checkpointInterval?: number;
	/** For zero threads: verification command */
	verifyCommand?: string;
	/** Working directory */
	cwd?: string;
}

/** A thread — the fundamental unit of tracked work */
export interface Thread {
	id: string;
	type: ThreadType;
	label: string;
	state: ThreadState;
	config: ThreadConfig;
	tasks: ThreadTask[];
	createdAt: number;
	startedAt?: number;
	completedAt?: number;
	/** Duration in ms */
	duration?: number;
}

/** Short status line for dashboard */
export interface ThreadSummary {
	id: string;
	type: ThreadType;
	label: string;
	state: ThreadState;
	progress: string; // e.g. "2/5 tasks"
	elapsed: string; // e.g. "1m 23s"
}

/** Thread event for state changes */
export type ThreadEvent =
	| { type: "thread_created"; thread: Thread }
	| { type: "thread_started"; thread: Thread }
	| { type: "task_started"; thread: Thread; task: ThreadTask }
	| { type: "task_completed"; thread: Thread; task: ThreadTask }
	| { type: "task_failed"; thread: Thread; task: ThreadTask }
	| { type: "thread_completed"; thread: Thread }
	| { type: "thread_failed"; thread: Thread }
	| { type: "thread_killed"; thread: Thread };
