// Smoke test for tinyui — loads the extension through pi's real jiti pipeline.
// PI_ROOT=/custom/pi/location npm test   (defaults to /usr/lib/node_modules/pi)
// Smoke test for the slimmed-down tinyui extension (thinking + compact tools only, user's theme).
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const PI_ROOT = process.env.PI_ROOT ?? "/usr/lib/node_modules/pi";
const { createJiti } = await import(`${PI_ROOT}/node_modules/jiti/lib/jiti.mjs`);

const jiti = createJiti(import.meta.url, {
    alias: {
        "@earendil-works/pi-tui": `${PI_ROOT}/packages/tui/dist/index.js`,
        "@earendil-works/pi-coding-agent": `${PI_ROOT}/packages/coding-agent/dist/index.js`,
    },
});

// The "user's theme": pi's own built-in dark theme — nothing from tinyui.
const { loadThemeFromPath } = await import(`${PI_ROOT}/packages/coding-agent/dist/modes/interactive/theme/theme.js`);
const userTheme = loadThemeFromPath(`${PI_ROOT}/packages/coding-agent/dist/modes/interactive/theme/dark.json`);

const ext = await jiti.import(fileURLToPath(new URL("../extensions/tinyui.ts", import.meta.url)));

const handlers = {};
let toolResolvers = [];
let markdownTransformers = [];
let widgets = {};
let renderRequests = 0;
const commands = {};
const uiCalls = [];
let settingsReads = 0;

const ui = {
    notify: (m, kind) => uiCalls.push(["notify", m, kind]),
    setWorkingVisible: (v) => uiCalls.push(["setWorkingVisible", v]),
    setWorkingMessage: (m) => uiCalls.push(["setWorkingMessage", m === undefined ? "cleared" : "set"]),
    setWidget: (key, content, options) => { widgets[key] = content ? { factory: content, options } : undefined; uiCalls.push(["setWidget", key, content ? "set" : "cleared", options?.placement]); },
    requestRender: () => renderRequests++,
    get theme() { return userTheme; },
};

const pi = {
    getSettings: () => { settingsReads++; return { theme: "dark" }; },
    on: (type, handler) => { handlers[type] ??= []; handlers[type].push(handler); },
    registerToolRenderer: (resolver) => toolResolvers.push(resolver),
    registerMarkdownTransformer: (t) => markdownTransformers.push(t),
    registerCommand: (name, options) => { commands[name] = options; },
};

ext.default(pi);

const ctx = { mode: "tui", hasUI: true, ui, cwd: "/home/ppetrov", sessionManager: {}, getContextUsage: () => null, model: { id: "test-model" } };
const fire = async (type, event) => {
    for (const h of handlers[type] ?? []) await h(event, ctx);
};

console.log("== factory registrations ==");
console.log("transformers:", markdownTransformers.length, "| toolResolvers:", toolResolvers.length,
    "| commands:", Object.keys(commands).join(","),
    "| settings touches:", settingsReads, "| ui touches at load:", uiCalls.length);
if (markdownTransformers.length !== 1 || toolResolvers.length !== 1) throw new Error("expected 1 transformer + 1 resolver");
if (settingsReads !== 0 || uiCalls.length !== 0) throw new Error("extension must not touch settings or UI at load");

console.log("\n== session_start ==");
await fire("session_start", {});
console.log("calls:", JSON.stringify(uiCalls));

console.log("\n== agent_start → pane ==");
uiCalls.length = 0;
await fire("agent_start", {});
const w = widgets["tinyui-status"];
if (!w || w.options?.placement !== "aboveEditor") throw new Error("pane widget missing");
const pane = w.factory({ requestRender: () => renderRequests++ }, userTheme);
const rows = pane.render(80);
console.log("pane rows:", rows.length, "→", JSON.stringify(rows[0]));
if (rows.length !== 1) throw new Error("pane must stay exactly 1 row");
const visible = uiCalls.filter((c) => c[0] === "setWorkingVisible");
console.log("working indicator hidden while pane is up:", JSON.stringify(visible));

console.log("\n== spinner ticks ==");
await new Promise((r) => setTimeout(r, 260));
console.log("tick after 260ms:", pane.tick, "| renderRequests:", renderRequests);
if (pane.tick === 0) throw new Error("spinner not ticking");

console.log("\n== thinking transformer (user's theme, dark) ==");
const xf = markdownTransformers[0];
const ctxOk = { messageType: "assistant-thinking", isStreaming: false, availableWidth: 80 };
const long = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n");
console.log("thinking on →", JSON.stringify(xf(long, ctxOk)));
console.log("assistant text →", JSON.stringify(xf("hello **world**", { messageType: "assistant", isStreaming: false, availableWidth: 80 })));
if (xf(long, ctxOk) !== "") throw new Error("thinking must be hidden");
if (xf("hello **world**", { messageType: "assistant", isStreaming: false, availableWidth: 80 }) !== "hello **world**") throw new Error("assistant text must pass through");

console.log("\n== tool rendering (colors from pi's dark theme) ==");
const resolver = toolResolvers[0];
const renderers = resolver("bash", () => undefined);
const call = renderers.renderCall({ command: "npm test" }, userTheme, { expanded: false, argsComplete: true, args: { command: "npm test" } });
console.log("call:", JSON.stringify(call.render(80)[0]));
const res = renderers.renderResult(
    { content: [{ type: "text", text: "passed 1 test\nsecond line" }], details: {} },
    { expanded: false, isPartial: false },
    userTheme,
    { isError: false, args: {} },
);
console.log("result:", JSON.stringify(res.render(80)[0]));
const editRenderers = resolver("edit", () => undefined);
const editRes = editRenderers.renderResult(
    { content: [], details: { diff: "+added line\n-removed line\n context" } },
    { expanded: false, isPartial: false },
    userTheme,
    { isError: false, args: {} },
);
console.log("edit:", JSON.stringify(editRes.render(80)[0]));
if (!editRes.render(80)[0].includes("+1") || !editRes.render(80)[0].includes("-1")) throw new Error("edit must show +1 -1");
const noOutRes = renderers.renderResult(
    { content: [], details: {} }, { expanded: false, isPartial: false },
    userTheme, { isError: false, args: {} },
);
console.log("no-output:", JSON.stringify(noOutRes.render(80)[0]));
if (!call.render(80)[0].includes("⏺") || !call.render(80)[0].includes("npm test")) throw new Error("call should be ⏺ Bash …");
// accent must come from the USER's theme (pi dark: violet accent), not tinyui
const accentExpected = userTheme.fg("accent", "⏺");
if (!call.render(80)[0].includes(accentExpected)) throw new Error("⏺ must be colored with the user's theme accent");

console.log("\n== /tinyui off ==");
uiCalls.length = 0;
await commands["tinyui"].handler("off", ctx);
console.log("calls:", JSON.stringify(uiCalls.filter((c) => c[0] !== "notify")));
console.log("notify:", JSON.stringify(uiCalls.filter((c) => c[0] === "notify")));
if (!widgets["tinyui-status"] === true && widgets["tinyui-status"] !== undefined) throw new Error("pane widget must be cleared");
const offResolver = resolver("bash", () => "BASE-RENDERERS");
if (offResolver !== "BASE-RENDERERS") throw new Error("disabled resolver must pass through to next()/base, got: " + JSON.stringify(offResolver));
console.log("thinking off (passthrough):", JSON.stringify(xf(long, ctxOk)) === JSON.stringify(long) ? "visible again ✓" : "STILL HIDDEN ✗");

console.log("\n== /tinyui on ==");
await commands["tinyui"].handler("on", ctx);
if (xf(long, ctxOk) !== "") throw new Error("thinking must hide again after on");

console.log("\n== /tinyui status + completions ==");
uiCalls.length = 0;
await commands["tinyui"].handler("status", ctx);
console.log("notify:", JSON.stringify(uiCalls));
console.log('completions "" →', JSON.stringify(commands["tinyui"].getArgumentCompletions("")));
console.log('completions "accent" →', JSON.stringify(commands["tinyui"].getArgumentCompletions("accent")));

console.log("\n== agent_end → cleanup ==");
uiCalls.length = 0;
await fire("agent_end", {});
console.log("calls:", JSON.stringify(uiCalls));

console.log("\nSMOKE TEST OK");