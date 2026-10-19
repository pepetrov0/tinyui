/**
 * tinyui — two small touches on pi's TUI, drawn entirely in the user's theme:
 *
 *   Thinking     hidden entirely (streaming and settled). While the agent works,
 *                a single motionless row above the editor replaces pi's loader:
 *                `✻ Musing… (esc to interrupt)`.
 *   Tool usage   compact rendering: `⏺ Bash(cmd)` calls with `⎿` one-line results
 *                and `+N -M` diff stats; ctrl+o expands to pi's full built-in views.
 *
 * No theme files, no accents, no colors of its own — every token (accent, text,
 * dim, toolDiff…) is resolved from whatever theme the user selected in pi.
 *
 * /tinyui  — on · off · status
 */
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import type {
    AgentToolResult,
    ExtensionAPI,
    ExtensionContext,
    Theme,
    ToolRenderContext,
    ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";

// ── Spinner ─────────────────────────────────────────────────────────────────
const SPINNER_FRAMES = ["✻", "✶", "✽", "✳", "✢", "●"];
const SPINNER_MS = 110;
const GERUNDS = [
    "Mesmerizing", "Musing", "Pondering", "Simmering", "Brewing", "Conjuring", "Noodling",
    "Vibing", "Marinating", "Percolating", "Reticulating", "Crunching",
    "Fermenting", "Distilling", "Wandering", "Herding", "Mulling", "Stewing",
    "Contemplating", "Deliberating", "Cerebrating", "Finagling", "Ideating",
    "Forging", "Germinating", "Hatching", "Mustering", "Ruminating",
    "Transmuting", "Manifesting", "Cobbling", "Scheming",
];
// One spinner row pinned above the editor while streaming: never moves, never grows.
const STATUS_PANE_KEY = "tinyui-status";

// ── Helpers ─────────────────────────────────────────────────────────────────
/** Chalk-independent bold. Wraps with [1m…[22m so inner fg/bg escapes survive. */
const bold = (text: string): string => `\x1b[1m${text}\x1b[22m`;
function truncate(text: string, width: number): string {
    return truncateToWidth(text, Math.max(0, width));
}

/**
 * A single-width-aware line whose colors are rebuilt on every render, so theme
 * changes and truncation stay correct. `build` returns the theme-colored text.
 */
class Line {
    constructor(
        private readonly build: () => string,
        private readonly padX = 2,
    ) {}
    invalidate() {
        /* no state; colors rebuild every render */
    }
    render(width: number): string[] {
        const inner = Math.max(8, width - this.padX);
        return [" ".repeat(this.padX) + truncate(this.build(), inner)];
    }
}

/**
 * One spinner row pinned above the editor while streaming: `✻ Mesmerizing… (esc to interrupt)`.
 * Never moves, never grows.
 */
class ThinkingPane {
    tick = 0;
    requestRender: () => void = () => {};
    constructor(
        private readonly getTheme: () => Theme,
        private readonly getGerund: () => string,
    ) {}
    invalidate() {}
    render(width: number): string[] {
        const t = this.getTheme();
        const frame = SPINNER_FRAMES[this.tick % SPINNER_FRAMES.length] ?? "✻";
        const gerund = this.getGerund();
        const row =
            " " +
            `${t.fg("accent", frame)} ${t.fg("text", `${gerund}…`)}` +
            t.fg("dim", " (esc to interrupt)");
        return [truncate(row, width)];
    }
}

// ── Tool rendering ──────────────────────────────────────────────────────────
const TOOL_STYLES: Record<string, { verb: string; arg?: string }> = {
    bash: { verb: "Bash", arg: "command" },
    powershell: { verb: "PowerShell", arg: "command" },
    read: { verb: "Read", arg: "file_path" },
    write: { verb: "Create", arg: "file_path" },
    edit: { verb: "Update", arg: "file_path" },
    grep: { verb: "Search", arg: "pattern" },
    find: { verb: "Find", arg: "pattern" },
    ls: { verb: "List", arg: "path" },
    web_search: { verb: "Search", arg: "query" },
    web_fetch: { verb: "Fetch", arg: "url" },
};

export default function tinyUiExtension(pi: ExtensionAPI) {
    let enabled = true;
    let livePane: ThinkingPane | undefined;
    let liveTimer: ReturnType<typeof setInterval> | undefined;
    let gerundIndex = Math.floor(Math.random() * GERUNDS.length);

    // ── Thinking ─────────────────────────────────────────────────────────────
    // Hidden entirely — streaming and settled. Only the verb row above the editor
    // shows that work is happening. (Full text remains in the session file / exports.)
    pi.registerMarkdownTransformer((markdown, context) => {
        if (!enabled || context.messageType !== "assistant-thinking") return markdown;
        return "";
    });

    function styleFor(toolName: string): { verb: string; arg?: string } {
        const known = TOOL_STYLES[toolName];
        if (known) return known;
        const words = toolName.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
        return {
            verb: words
                .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
                .join(" "),
        };
    }
    function snippetFor(args: any, argKey: string | undefined, complete: boolean): string {
        if (!complete) return "…";
        if (!args || typeof args !== "object") return "";
        const candidates: string[] = [];
        if (argKey && typeof args[argKey] === "string") candidates.push(args[argKey]);
        for (const value of Object.values(args)) {
            if (typeof value === "string" && value.length > 0) candidates.push(value);
            else if (typeof value === "number" || typeof value === "boolean") candidates.push(String(value));
        }
        const raw = candidates[0] ?? "";
        const one = raw.split("\n")[0] ?? "";
        return one.length > 80 ? one.slice(0, 77) + "..." : one;
    }
    function resultText(result: AgentToolResult<any>): string {
        return (result.content ?? [])
            .filter((c: any) => c.type === "text")
            .map((c: any) => String(c.text ?? ""))
            .join("\n")
            .replace(/\n+$/, "");
    }

    // ── Streaming pane lifecycle ─────────────────────────────────────────────
    function startThinkingPane(ctx: ExtensionContext) {
        if (ctx.mode !== "tui" || !ctx.hasUI) return;
        const ui = ctx.ui;
        stopThinkingPane(ctx);
        gerundIndex = Math.floor(Math.random() * GERUNDS.length);
        const pane = new ThinkingPane(
            () => ui.theme as unknown as Theme,
            () => GERUNDS[gerundIndex % GERUNDS.length] ?? "Working",
        );
        ui.setWidget(STATUS_PANE_KEY, (tui, _theme) => {
            pane.requestRender = () => tui.requestRender();
            return pane as any;
        }, { placement: "aboveEditor" });
        livePane = pane;
        liveTimer = setInterval(() => {
            if (!livePane) return;
            livePane.tick += 1;
            if (livePane.tick % 24 === 0) gerundIndex += 1; // rotate the gerund every ~2.6s
            livePane.requestRender();
        }, SPINNER_MS) as any;
        // The pane carries the spinner + gerund, so the built-in loader row stays down.
        ui.setWorkingVisible(false);
    }
    function stopThinkingPane(ctx: ExtensionContext | undefined) {
        if (liveTimer) {
            clearInterval(liveTimer);
            liveTimer = undefined;
        }
        livePane = undefined;
        if (ctx && ctx.mode === "tui" && ctx.hasUI) {
            const ui = ctx.ui;
            ui.setWidget(STATUS_PANE_KEY, undefined);
            ui.setWorkingVisible(true);
            ui.setWorkingMessage(undefined);
        }
    }

    // ── Lifecycle ───────────────────────────────────────────────────────────
    pi.on("session_start", (_event, ctx) => {
        stopThinkingPane(ctx); // safety: never leak a pane across sessions
    });
    pi.on("agent_start", (_event, ctx) => {
        if (!enabled || ctx.mode !== "tui" || !ctx.hasUI) return;
        if (!livePane) startThinkingPane(ctx);
    });
    pi.on("agent_end", (_event, ctx) => {
        stopThinkingPane(ctx);
    });
    pi.on("session_shutdown", (_event, ctx) => {
        stopThinkingPane(ctx as ExtensionContext | undefined);
    });

    // ── Tool renderer: ⏺ call / ⎿ result ────────────────────────────────────
    // Collapsed: terse one-liners in the user's theme. Expanded (ctrl+o / click):
    // delegates to pi built-ins for full fidelity — live edit diff preview and
    // complete results. /tinyui off passes everything straight through.
    pi.registerToolRenderer((toolName, next) => {
        if (!enabled) return typeof next === "function" ? next() : undefined;
        return {
            renderShell: "self",
            renderCall: (args: any, theme: Theme, context: ToolRenderContext<any, any>) => {
                if (context.expanded) {
                    const builtin = typeof next === "function" ? next()?.renderCall : undefined;
                    if (builtin) return builtin(args, theme, context);
                }
                const t = theme;
                const { verb, arg } = styleFor(toolName);
                const snippet = snippetFor(args, arg, context.argsComplete);
                const bullet = `${t.fg("accent", "⏺")} ${bold(t.fg("text", verb))}`;
                return new Line(
                    () => (snippet ? `${bullet} ${t.fg("dim", snippet)}` : bullet),
                    2,
                ) as any;
            },
            renderResult: (
                result: AgentToolResult<any>,
                options: ToolRenderResultOptions,
                theme: Theme,
                context: ToolRenderContext<any, any>,
            ) => {
                const t = theme;
                const text = resultText(result);
                const pad = 3;
                if (options.expanded) {
                    const builtin = typeof next === "function" ? next()?.renderResult : undefined;
                    if (builtin) return builtin({ content: result.content, details: result.details }, options, theme, context);
                }
                if (context.isError) {
                    const first = (text.split("\n")[0] ?? "").trim() || "failed";
                    const build = () => `${t.fg("muted", "⎿")}  ${t.fg("error", `Error: ${first}`)}`;
                    return new Line(build, pad) as any;
                }
                // Edit: terse "+N -M" diff stat.
                const details: any = result.details;
                if (toolName === "edit" && typeof details?.diff === "string") {
                    let added = 0;
                    let removed = 0;
                    for (const line of details.diff.split("\n")) {
                        if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
                        else if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
                    }
                    const running = options.isPartial ? ` ${t.fg("dim", "…")}` : "";
                    const build = () =>
                        `${t.fg("muted", "⎿")}  ${t.fg("toolDiffAdded", `+${added}`)} ${t.fg("toolDiffRemoved", `-${removed}`)}${running}`;
                    return new Line(build, pad) as any;
                }
                if (!text) {
                    const build = () =>
                        `${t.fg("muted", "⎿")}  ${t.fg("dim", options.isPartial ? "running…" : "(no output)")}`;
                    return new Line(build, pad) as any;
                }
                const lines = text.split("\n");
                if (options.expanded) {
                    return new Text(lines.map((l) => `   ${t.fg("toolOutput", l)}`).join("\n"), 0, 0) as any;
                }
                const first = (lines.find((l) => l.trim().length > 0) ?? "").trim();
                const extra = lines.length > 1 ? ` ${t.fg("dim", `(${lines.length} lines)`)}` : "";
                const running = options.isPartial ? ` ${t.fg("dim", "…")}` : "";
                return new Line(() => `${t.fg("muted", "⎿")}  ${t.fg("muted", first)}${extra}${running}`, pad) as any;
            },
        };
    });

    // ── /tinyui ─────────────────────────────────────────────────────────────
    pi.registerCommand("tinyui", {
        description: "tinyui: on | off | status",
        getArgumentCompletions: (prefix: string) => {
            const p = prefix.toLowerCase();
            const values = ["on", "off", "status"].filter((v) => v.startsWith(p));
            return values.length ? values.map((value) => ({ value, label: value })) : null;
        },
        handler: async (args: string, ctx: any) => {
            const sub = String(args?.trim() || "status").toLowerCase();
            const ui = ctx?.ui;
            if (!ui) return;
            if (sub === "off") {
                enabled = false;
                stopThinkingPane(ctx as ExtensionContext | undefined); // restore the built-in loader if up
                ui.notify("tinyui off — thinking visible, pi's built-in tool rendering", "info");
            } else if (sub === "on") {
                enabled = true;
                ui.notify("tinyui on", "info");
            } else {
                ui.notify(
                    enabled
                        ? "tinyui is on — thinking hidden, compact tool lines (/tinyui off to disable)"
                        : "tinyui is off (/tinyui on to enable)",
                    "info",
                );
            }
        },
    });
}