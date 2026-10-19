# tinyui — pi extension

Two small touches on pi's TUI, drawn entirely in the user's theme:

- **Thinking** — hidden entirely (streaming and settled). While the agent works,
  one motionless row above the editor replaces pi's loader:
  `✻ Musing… (esc to interrupt)`.
- **Tool usage** — compact rendering: `⏺ Bash(cmd)` call lines with `⎿` one-line
  results and `+N -M` diff stats; `ctrl+o` expands to pi's full built-in views
  (live edit diff preview, complete output).

No theme files, no accents, no colors of its own — every token (`accent`,
`text`, `dim`, `toolDiffAdded`…) resolves live from whatever theme the user
selected in pi (`/theme`).

## Install

```sh
pi install git:github.com/pepetrov0/tinyui
```

Pin a tag/branch/commit with `@`:

```sh
pi install git:github.com/pepetrov0/tinyui@v1.0.0
```

> If the repo is private, install over SSH instead:
> `pi install git:git@github.com:pepetrov0/tinyui` (both normalize to the same
> package identity, so switching the setting string later is a no-op).

## Use

| Command | Effect |
|---|---|
| `/tinyui` | status |
| `/tinyui off` | thinking visible again, pi's built-in tool rendering |
| `/tinyui on` | back to hidden thinking + compact tool lines |

## Update

```sh
pi update git:github.com/pepetrov0/tinyui   # fetch + move upstream
/reload                                      # load the new code
```

## Development

This repo is the canonical copy — once installed as a package, pi manages its
own clone under `~/.pi/agent/git/github.com/pepetrov0/tinyui/` (untracked
changes there are wiped on update). **Do not keep a second copy of the
extension in `~/.pi/agent/extensions/`** — resources from packages lose to
file extensions anyway (precedence: local files 0–3, package 4) and a
duplicate registration is just noise.

Smoke test (loads the extension through pi's real jiti pipeline with stubbed
lifecycle contexts and renders with pi's built-in dark theme):

```sh
npm test
```

Loop: edit → `npm test` → commit → push → `pi update …` → `/reload`.