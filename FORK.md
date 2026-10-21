# OpenCode fork: what's new

This branch (`claude-parity`) adds tools and settings inspired by Claude Code on top of OpenCode v2.
Everything works with any model, including local OpenAI-compatible servers, and nothing needs extra
installs beyond Google Chrome for the browser tools.

## Run it

A binary is already built at `packages/cli/dist/cli-darwin-arm64/bin/opencode`; rebuild it after pulling changes.
It uses the local channel: no auto-updates and its own database (`opencode-local.db`), so your installed
OpenCode and its sessions are left alone. Handy alias: `alias oc="$PWD/packages/cli/dist/cli-darwin-arm64/bin/opencode"`
(run in the repo root).

Build a standalone binary for this machine:

```bash
cd packages/cli && OPENCODE_CHANNEL=local bun run script/build.ts --single --skip-install
./dist/cli-darwin-arm64/bin/opencode            # terminal UI
./dist/cli-darwin-arm64/bin/opencode pair -o    # web UI: opens a one-time sign-in link in your browser
./dist/cli-darwin-arm64/bin/opencode serve      # or a foreground web server at the printed address
```

`pair` starts the background server if needed and prints a link that signs the browser in (it works once and
expires in 5 minutes; run `pair` again for another browser). `serve` instead prints the address and a
`server password`: open the address, choose **Use password** and paste it (set `OPENCODE_PASSWORD` to pick your
own, and `--port 4096` to fix the port). `opencode service stop` stops the background server.

Or run from source with `bun run dev` in the repo root. It reads your normal `~/.config/opencode` config.

Pick your model once in the web app's model menu and it is remembered. Without a `"model"` in your config the
first choice is OpenCode's free tier, which refuses development builds ("OpenCode 1.18.0 or newer is required"),
so for the terminal UI and `opencode run` set one, e.g. `"model": "halogen/halogen-qwen3.8-flash-next"`
(OpenCode 1.x reads the same key).

To use the web UI like a desktop app, open it in Chrome and choose **Install OpenCode** (the install icon in the
address bar, or ⋮ → Cast, save and share → Install page as app). It gets its own window and Dock icon.

Requirements: Google Chrome (or Chromium, Edge, Brave, Arc) for the browser tools and the Agent browser panel.
On macOS, the `screenshot` tool needs Screen Recording permission for the app that runs OpenCode (your terminal).

## New tools for the agent

| Tool | What it does |
|---|---|
| `websearch` | Works out of the box. No consent popup: it picks a provider automatically and fails over to the next one on any error or empty result. Adds a keyless **Built-in** provider (DuckDuckGo → Bing → Mojeek, with anti-bot detection) and **Brave Search** (`BRAVE_API_KEY`). Searches can be limited with `allowed_domains` / `blocked_domains`. Pin a provider with `"websearch": { "provider": "builtin" }` or turn it off with `"websearch": false`. |
| `webfetch` | Pages that are only a JavaScript shell (React, Vue, Svelte apps) are rendered in headless Chrome first, so the agent reads the real content instead of an empty `<div id="root">`. |
| `chrome_open`, `chrome_snapshot`, `chrome_screenshot`, `chrome_click`, `chrome_type`, `chrome_press`, `chrome_select`, `chrome_hover`, `chrome_drag`, `chrome_upload`, `chrome_network`, `chrome_wait`, `chrome_resize`, `chrome_scroll`, `chrome_eval`, `chrome_console`, `chrome_close` | A real headless Chrome the agent drives, in every client (terminal, web, `run`). Open pages or local dev servers, read them as numbered elements, click and type by number, take screenshots the model can see (whole page or one element; shown inline in the web UI), hover menus, drag and drop, attach files to upload fields, run JS, read console errors and list network requests (failed API calls, missing assets). Links that open new tabs stay in the agent's tab, and alert/confirm dialogs are accepted and logged. Uses any installed Chrome, Chromium, Edge, Brave or Arc, or `OPENCODE_BROWSER_PATH`. `OPENCODE_BROWSER_HEADED=1` shows the window. |
| `memory_save`, `memory_read`, `memory_delete` | Persistent per-project memory. One Markdown file per fact plus a `MEMORY.md` index that is added to every request, so it survives new sessions and compaction. Stored under `<data>/memory/<project>/`. |
| `notebook_read`, `notebook_edit` | Read Jupyter notebooks as cells with outputs; replace, insert or delete cells (outputs of edited code cells are cleared). Parallel edits to one notebook are serialized. |
| `plan_exit` | Plan mode's finish line. The Plan agent presents its plan; you approve it in a question card (or type changes) and the session switches to Build and starts implementing. |
| `lsp` | Code intelligence from language servers: definition, references, implementation, hover (types and docs), file symbols, workspace symbol search, diagnostics. Finds TypeScript, Python, Go, Rust, C/C++, Swift, Ruby, Lua, Zig, PHP, C#, Java, Bash and YAML servers on PATH (TypeScript and Python fall back to `npx`), or set your own under `"lsp"` in opencode.json. After every edit, errors from that file's language server are added to the edit result (an installed server starts on the first edit). `OPENCODE_DISABLE_LSP_DIAGNOSTICS=1` turns that off. |
| `screenshot` | Captures the computer's screen (desktop, native apps, terminals) and shows it to the model and inline in the web UI. macOS uses `screencapture` (scaled to 1600px) and needs Screen Recording permission for the app running OpenCode; Linux tries grim, gnome-screenshot, spectacle, scrot or ImageMagick; Windows uses PowerShell. |
| `terminal_read`, `terminal_run` | The agent can see your terminals in the app's Terminal panel ("what's this error in my terminal?") as plain text, and type a command into one when you ask, returning the output that follows. Its own commands still use `shell`. |
| `shell` `notify_on` | For background commands: a case-insensitive regex checked against each output line. A match wakes the agent with that line and the recent output (like Claude Code's Monitor), e.g. `ready\|listening` for a dev server or `error\|fail` for a watcher. At most one notice every 5 seconds, 10 per command. |
| `shell_stop` | Stops a background command (dev server, watcher) by the shell ID `shell` returned with `background: true`, or lists the session's running background commands. You can also stop one from the *N running* menu in the session header; the agent is told you stopped it, so it does not start it again. |
| `notify` | Desktop notification (macOS, Linux, Windows) when a long task finishes or needs you. |
| `goal_complete` + `/goal` | `/goal <condition>` makes the agent keep working, turn after turn, until it calls `goal_complete` with evidence (max 25 rounds). `/goal stop` ends it. |
| `todowrite` | On by default (upstream keeps it experimental). The agent keeps a checklist for multi-step work; the web app shows it above the composer (*Tasks 2/5*), with the item in progress highlighted, until your next message after it is finished. Click the header to collapse it. Off in **Settings → Extensions → Tools** or with `"experimental": { "todo": false }`. |

## Built-in skills

The agent loads these on its own when a task matches (or ask for one by name):

- **webapp-testing**: start the dev server, test the app like a user with the chrome tools, fix what fails
- **frontend-design**: a small design system, interaction states, responsiveness and accessibility, checked with screenshots
- **debugging**: reproduce, locate with `lsp` and `grep`, verify the root cause, fix, prove with a test
- **git-workflow**: safe git habits, commit conventions, pull requests

## Hooks

Shell-command hooks in `~/.config/opencode/hooks.json` (global) and `<project>/.opencode/hooks.json`:

```json
{
  "PreToolUse": [
    { "matcher": "shell", "command": "./scripts/check-command.sh" }
  ],
  "PostToolUse": [
    { "matcher": "edit|write", "command": "npx prettier --write \"$OPENCODE_FILE_PATH\"", "timeout": 30 }
  ]
}
```

- `matcher` is a pattern for tool names (`edit|write`, `chrome_.*`, `*`).
- The command gets the call as JSON on stdin and `OPENCODE_TOOL`, `OPENCODE_FILE_PATH`, `OPENCODE_PROJECT_DIR`, `OPENCODE_HOOK_EVENT` in its environment.
- Exit code **2** blocks a `PreToolUse` call (stderr is the reason the model sees) or, for `PostToolUse`, sends stderr back to the model as feedback. Other exit codes are logged and ignored.
- `Stop` hooks run whenever a turn finishes, for example `{ "Stop": [{ "command": "say done" }] }` or a desktop notification.

## Commands

- `/goal <condition>` and `/goal stop` (see above)
- `/loop <interval> <prompt>` repeats a prompt (e.g. `/loop 10m check the deploy`, minimum 30 s, up to 100 runs); `/loop stop` ends it
- `/security-review [commit|branch|pr]`: a focused security review of your changes with severities and exploit scenarios
- `/memory [request]`: show, add, forget or review the agent's saved memories
- Existing: `/init`, `/review`, and your custom commands

## App and settings

- **Dark by default**: the app starts in the dark theme; pick System or Light in Settings → Appearance.
- **Agent browser panel** (side panel *+* menu → *Agent browser*, or `/browser`): a live view of the headless Chrome the agent drives with its `chrome_*` tools, refreshed every second. Type a URL or `localhost:3000`, click, scroll, type and paste into the page, or **Shift+click an element** to attach a comment about it to your message ("make this button green"); the agent sees the same page, so you can set something up and ask it to continue. It opens by itself when the agent opens its browser or moves it to another page, unless you closed it in that session. API: `GET`/`POST /api/experimental/browser`.
- **Settings → Usage** (or `/usage`): sessions, prompts, model calls, tool calls, input/output/reasoning/cache tokens, cost, active days and streak, a per-day chart and a per-model breakdown, for today, 7 days, 30 days or all time.
- **Settings → Extensions → MCPs**: *Add server* (local command or remote URL, env vars, headers) and a remove button per server. Saved to your global config and connected immediately. *Paste JSON* takes the snippet from an MCP server's README as is (`{"mcpServers": …}` from Claude Desktop or Cursor, VS Code's `{"servers": …}`, or OpenCode's `mcp`) and adds every server in it.
- **Settings → Extensions → Skills → New skill**: write a skill (name, when to use it, instructions) without touching files; it is saved to `~/.config/opencode/skills/<name>/SKILL.md` and picked up at once. Skills in that folder get edit and remove buttons.
- **Settings → Extensions → Tools**: switch the agent's tool groups on or off (browser, web search, web fetch, memory, your terminals, screen capture, code intelligence, notifications, task list).
- **Settings → Extensions → Memory**: every project's saved memories with type, description and content, an **Add memory** button (pick the project and type) and a delete button.
- **Settings → Providers → Custom OpenAI-compatible provider**: now saves (base URL, API key, headers, models), so local servers can be added from the UI.
- **Settings → Server → Web search**: choose Automatic, a specific provider (Built-in, Brave, Exa, Tavily, ...) or Off. The **API key** button saves, replaces or removes a key for Brave, Tavily, Exa, Firecrawl, Parallel or TinyFish (paid APIs are not blocked like scraping). From a terminal: `opencode auth login brave`, or set `BRAVE_API_KEY`.
- **Context panel** (`/context`): *Output Speed (last / average)* in tokens per second next to context usage, tokens and cost.
- Browser, memory, notebook, plan, screenshot, terminal, background-stop, goal and notification tools have readable titles in the web UI and terminal.

## Known limitations

- The packaged desktop app (`packages/desktop`) does not work with this fork yet: the server it starts never
  answers project requests, although the same binary works from the terminal, `pair`, `serve` and the background
  service. Use the web UI (installable as an app window from Chrome) or the terminal UI.
- `screenshot` needs macOS Screen Recording permission for the app running OpenCode; without it the image shows
  only the wallpaper.
- The agent browser is headless Chrome: sites that block automation or need your logins are better handled in
  your own browser.
- Background commands end when the server stops. The background service (used by `opencode`, `pair -o` and the
  web app it serves) tells each session afterwards; a plain `opencode serve` does not, so its session header can
  keep showing *1 running* for a command that is gone.

## Notes

- Fewer tools means a shorter prompt on every request, which helps small local models. Switch tool groups off in
  **Settings → Extensions → Tools**, or deny them in `~/.config/opencode/opencode.json` (the tools leave the
  model's list):

  ```json
  { "permission": { "*": "allow", "chrome": "deny", "memory": "deny" } }
  ```

  Names: `chrome` (browser tools), `memory`, `terminal`, `screenshot`, `lsp`, `notify`, `todowrite`, `websearch`,
  `webfetch`.

- OpenCode 1.x reads the same global config files. The Settings switches use the 1.x `permission` form because
  1.x refuses to start when the file has the newer `"permissions"` list. Turning `websearch` or `webfetch` off
  therefore turns them off in 1.x too.

- `bun run lint` needs Node 22+ (oxlint loads TypeScript plugins); on older Node use `bun run typecheck`.
- Upstream: https://github.com/anomalyco/opencode
