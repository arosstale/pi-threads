/**
 * Interactive TUI dashboard for pi-threads.
 * Shows threads + stories in a navigable overlay.
 *
 * Keys: ↑↓ navigate, Enter expand, k kill, r review, p prune, q/Esc close
 */
import { matchesKey, Key, truncateToWidth } from "@mariozechner/pi-tui";
import type { ThreadRegistry } from "./core/registry.js";

export interface DashboardTheme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
}

interface DashboardRow {
	id: string;
	kind: "thread" | "story";
	label: string;
	display: string;
}

export function createDashboard(
	registry: ThreadRegistry,
	theme: DashboardTheme,
	onClose: () => void,
	onKill?: (id: string) => void,
	onReview?: (id: string) => void
) {
	let selected = 0;
	let expanded: string | null = null;
	let rows: DashboardRow[] = [];
	let cachedWidth: number | undefined;

	function stateIcon(state: string): string {
		switch (state) {
			case "running": return "⟳";
			case "completed": return "✓";
			case "failed": case "killed": return "✗";
			case "pending": return "·";
			case "planning": return "📋";
			case "executing": return "⚡";
			case "verifying": return "🔍";
			case "done": return "✅";
			default: return "?";
		}
	}

	function stateColor(state: string): string {
		switch (state) {
			case "running": case "executing": return "warning";
			case "completed": case "done": return "success";
			case "failed": case "killed": return "error";
			default: return "muted";
		}
	}

	function typeIcon(type: string): string {
		switch (type) {
			case "parallel": return "⫘";
			case "chained": return "⟶";
			case "fusion": return "⊕";
			case "meta": return "◎";
			case "long": return "∞";
			case "zero": return "⊘";
			default: return "·";
		}
	}

	function buildRows(): DashboardRow[] {
		const result: DashboardRow[] = [];

		// Stories first
		for (const s of registry.allStories()) {
			const phases = s.phases.map((p) => `${stateIcon(p.state)}${p.name}`).join("→");
			const display = `📖 ${theme.fg("accent", s.id)} [${theme.fg(stateColor(s.state), s.state)}] ${s.goal.slice(0, 45)} ${theme.fg("dim", phases)}`;
			result.push({ id: s.id, kind: "story", label: s.goal, display });
		}

		// Then threads
		for (const t of registry.all()) {
			const sum = registry.summarize(t);
			const be = sum.backend === "subagent" ? theme.fg("dim", " [sub]") : "";
			const display = `${typeIcon(sum.type)} ${theme.fg("accent", sum.id)} ${sum.type} [${theme.fg(stateColor(sum.state), sum.state)}] ${sum.progress} (${sum.elapsed})${be} ${sum.label.slice(0, 40)}`;
			result.push({ id: sum.id, kind: "thread", label: sum.label, display });
		}

		return result;
	}

	function renderExpanded(id: string, width: number): string[] {
		const lines: string[] = [];
		const indent = "    ";
		const maxW = width - 6;

		// Thread detail
		const t = registry.get(id);
		if (t) {
			lines.push(theme.fg("accent", theme.bold(`  Thread ${t.id} (${t.type}) — ${t.state}`)));
			lines.push("");
			for (const task of t.tasks) {
				const icon = stateIcon(task.state);
				const color = stateColor(task.state);
				lines.push(theme.fg(color, `${indent}${icon} ${task.id}: ${truncateToWidth(task.label, maxW)}`));
				if (task.model) lines.push(theme.fg("dim", `${indent}  model: ${task.model}`));
				if (task.result) {
					const preview = task.result.replace(/\n/g, " ").slice(0, 200);
					lines.push(theme.fg("muted", `${indent}  → ${truncateToWidth(preview, maxW)}`));
				}
				if (task.error) {
					lines.push(theme.fg("error", `${indent}  ✗ ${truncateToWidth(task.error, maxW)}`));
				}
			}
			return lines;
		}

		// Story detail
		const s = registry.getStory(id);
		if (s) {
			lines.push(theme.fg("accent", theme.bold(`  Story ${s.id} — ${s.state}`)));
			lines.push(theme.fg("muted", `  ${s.goal}`));
			lines.push("");
			for (const phase of s.phases) {
				const icon = stateIcon(phase.state);
				const color = stateColor(phase.state);
				const tid = phase.threadId ? theme.fg("dim", ` [${phase.threadId}]`) : "";
				lines.push(theme.fg(color, `${indent}${icon} ${phase.name} (${phase.threadType})${tid}`));
				lines.push(theme.fg("dim", `${indent}  ${truncateToWidth(phase.description, maxW)}`));
			}
			return lines;
		}

		return [theme.fg("error", `  ${id} not found`)];
	}

	const component = {
		handleInput(data: string) {
			if (matchesKey(data, Key.escape) || data === "q") {
				onClose();
				return;
			}
			if (matchesKey(data, Key.up) && selected > 0) {
				selected--;
				expanded = null;
				cachedWidth = undefined;
			}
			if (matchesKey(data, Key.down) && selected < rows.length - 1) {
				selected++;
				expanded = null;
				cachedWidth = undefined;
			}
			if (matchesKey(data, Key.enter) && rows[selected]) {
				expanded = expanded === rows[selected].id ? null : rows[selected].id;
				cachedWidth = undefined;
			}
			if (data === "k" && rows[selected]) {
				onKill?.(rows[selected].id);
				cachedWidth = undefined;
			}
			if (data === "r" && rows[selected]) {
				onReview?.(rows[selected].id);
				cachedWidth = undefined;
			}
			if (data === "p") {
				registry.prune();
				cachedWidth = undefined;
			}
		},

		render(width: number): string[] {
			// Rebuild rows every render (state changes)
			rows = buildRows();

			if (selected >= rows.length) selected = Math.max(0, rows.length - 1);

			const lines: string[] = [];
			const border = "─".repeat(Math.min(width - 4, 80));

			// Header
			lines.push("");
			lines.push(theme.fg("accent", theme.bold("  🧵 Thread Dashboard")));
			lines.push(theme.fg("dim", `  ${border}`));

			if (rows.length === 0) {
				lines.push("");
				lines.push(theme.fg("muted", "  No threads or stories."));
				lines.push(theme.fg("dim", "  Use /pthread /fthread /zthread /story to start."));
			} else {
				lines.push("");
				for (let i = 0; i < rows.length; i++) {
					const prefix = i === selected ? theme.fg("accent", " ▸ ") : "   ";
					const row = rows[i];
					const line = prefix + truncateToWidth(row.display, width - 4);
					lines.push(line);

					// Show expanded detail
					if (expanded === row.id) {
						lines.push(...renderExpanded(row.id, width));
						lines.push("");
					}
				}
			}

			// Footer
			lines.push("");
			lines.push(theme.fg("dim", `  ${border}`));
			const help = "↑↓ navigate  Enter expand  k kill  r review  p prune  q close";
			lines.push(theme.fg("dim", `  ${help}`));
			lines.push("");

			return lines;
		},

		invalidate() {
			cachedWidth = undefined;
		},
	};

	return component;
}
