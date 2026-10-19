# ✻ tinyui

[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![pi package](https://img.shields.io/badge/pi-package-8250df?style=flat-square)](https://pi.dev/docs)
[![Version](https://img.shields.io/badge/version-v1-success?style=flat-square)](https://github.com/pepetrov0/tinyui/releases)

> Two small touches on [pi](https://github.com/earendil-works/pi)'s TUI, drawn entirely in your theme.

[Features](#features) • [Install](#install) • [Use](#use) • [Update](#update) • [Development](#development)

**tinyui** is a [pi package](https://pi.dev/docs) that quiets down the terminal UI while the agent works — no theme files, no accents, no colors of its own. Every token (`accent`, `text`, `dim`, `toolDiffAdded`, …) is resolved live from whatever theme you selected in pi (`/theme`).

## Features

- **Hidden thinking** — the reasoning stream is dropped entirely (streaming and settled; full text remains in the session file and exports). While the agent works, a single motionless row above the editor replaces pi's loader:
  `✻ Musing… (esc to interrupt)` — with a rotating gerund, *Simmering*, *Percolating*, *Reticulating*…
- **Compact tool lines** — `⏺ Bash(npm test)` call lines with one-line `│` results (`· exit 0` for shell tools), `+N -M` diff stats for edits, and `(N lines)` markers instead of walls of output.
- **Full fidelity on demand** — `ctrl+o` (or a click) expands any tool result in place: a `│` left gutter holds the complete output, closed by a rounded `╰─` underneath — full edit diffs colored `+`/`-` included.
- **One switch** — `/tinyui off` puts everything back exactly as pi shipped it, nothing left behind.
- **Zero dependencies** — a single ~300 line TypeScript extension; it touches no settings and no UI at load time.

A session under tinyui looks roughly like this:

```text
✻ Percolating… (esc to interrupt)
⏺ Bash(npm test)
│ 12 tests passed (3 lines) · exit 0
⏺ Update(src/index.ts)
│ +12 -3
Done — tests pass.
```

## Install

```sh
pi install git:github.com/pepetrov0/tinyui
```

Pin a tag, branch, or commit with `@`:

```sh
pi install git:github.com/pepetrov0/tinyui@v1
```

> [!NOTE]
> If the repo is private, install over SSH instead: `pi install git:git@github.com:pepetrov0/tinyui`. Both forms resolve to the same package identity, so switching later is a no-op.

## Use

tinyui has exactly one command, and it defaults to *status*:

| Command | Effect |
|---|---|
| `/tinyui` | Show whether tinyui is on or off |
| `/tinyui off` | Thinking visible again, pi's built-in tool rendering |
| `/tinyui on` | Back to hidden thinking and compact tool lines |

> [!TIP]
> Even with tinyui on, you never lose information: `ctrl+o` (or clicking) expands any tool result in place — complete output and full edit diffs under a `│` → `╰─` gutter, still in your theme.

## Update

```sh
pi update git:github.com/pepetrov0/tinyui   # fetch + move upstream
/reload                                      # load the new code
```

## Development

This repo is the canonical copy. Once installed as a package, pi manages its own clone under `~/.pi/agent/git/github.com/pepetrov0/tinyui/` — untracked changes there are wiped on update.

> [!IMPORTANT]
> Do not keep a second copy of the extension in `~/.pi/agent/extensions/`. File extensions outrank package resources anyway (precedence: local files 0–3, package 4), so a duplicate is pure noise, not a fallback.

The smoke test loads the extension through pi's real jiti pipeline, stubs the lifecycle contexts, and renders against pi's built-in dark theme — asserting the registrations, the one-row status pane, theme pass-through (`⏺` must carry the *user's* accent), thinking hiding, `+N -M` diff stats, the `│`→`╰─` expansion gutter, the shell `exit N` tag, and `/tinyui` toggling:

```sh
npm test
```

> [!NOTE]
> The test imports from a local pi installation. Set `PI_ROOT` if yours lives elsewhere (default: `/usr/lib/node_modules/pi`).

The feedback loop is: edit → `npm test` → commit → push → `pi update git:github.com/pepetrov0/tinyui` → `/reload`.