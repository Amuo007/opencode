import type { SessionMessageAssistantTool, SessionMessageInfo } from "@opencode/client/promise"
import { getFilename } from "@opencode/util/path"

/** What the agent is doing right now, as an i18n key with its values, and when that step began. */
export type Activity = {
  key: string
  params: Record<string, string>
  since: number
  /** Lines written so far while a file body is still streaming in. */
  lines?: number
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * A string field of a tool's input. While the call streams, the input is partial JSON text, so the field only counts
 * once its closing quote has arrived.
 */
export function inputField(input: unknown, name: string): string | undefined {
  if (record(input)) {
    const value = input[name]
    return typeof value === "string" && value ? value : undefined
  }
  if (typeof input !== "string") return
  const match = input.match(new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))
  if (!match) return
  try {
    return JSON.parse(`"${match[1]}"`) || undefined
  } catch {
    return
  }
}

/** Lines of a string field so far, including a field whose text is still streaming. */
export function inputLines(input: unknown, name: string): number | undefined {
  if (record(input)) {
    const value = input[name]
    return typeof value === "string" ? value.split("\n").length : undefined
  }
  if (typeof input !== "string") return
  const start = input.search(new RegExp(`"${name}"\\s*:\\s*"`))
  if (start === -1) return
  return input.slice(start).split("\\n").length
}

const short = (text: string, max = 48) => {
  const line = text.trim().split("\n")[0] ?? ""
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

const host = (url: string) => {
  try {
    const parsed = new URL(url)
    return parsed.host + (parsed.pathname === "/" ? "" : parsed.pathname)
  } catch {
    return url
  }
}

function describeTool(tool: SessionMessageAssistantTool): Pick<Activity, "key" | "params" | "lines"> {
  const input = tool.state.input
  const file = () => {
    const path = inputField(input, "path") ?? inputField(input, "filePath")
    return path ? getFilename(path) : undefined
  }
  const named = (key: string, value: string | undefined): Pick<Activity, "key" | "params"> =>
    value ? { key, params: { value } } : { key: `${key}.unknown`, params: {} }

  switch (tool.name) {
    case "read":
    case "notebook_read":
      return named("session.activity.read", file())
    case "write": {
      const lines = inputLines(input, "content")
      return { ...named("session.activity.write", file()), lines }
    }
    case "edit":
    case "patch":
    case "notebook_edit":
      return named("session.activity.edit", file())
    case "glob":
    case "grep":
    case "list":
      return named("session.activity.search", inputField(input, "pattern"))
    case "shell":
      return named("session.activity.shell", short(inputField(input, "command") ?? ""))
    case "shell_stop":
      return { key: "session.activity.shellStop", params: {} }
    case "websearch":
      return named("session.activity.websearch", short(inputField(input, "query") ?? ""))
    case "webfetch":
      return named("session.activity.webfetch", host(inputField(input, "url") ?? ""))
    case "chrome_open":
      return named("session.activity.browserOpen", host(inputField(input, "url") ?? ""))
    case "chrome_screenshot":
    case "screenshot":
      return { key: "session.activity.screenshot", params: {} }
    case "chrome_resize":
      return named("session.activity.browserResize", inputField(input, "preset"))
    case "chrome_click":
      return named(
        "session.activity.browserClick",
        short(inputField(input, "text") ?? inputField(input, "selector") ?? ""),
      )
    case "chrome_type":
    case "chrome_press":
      return { key: "session.activity.browserType", params: {} }
    case "chrome_eval":
    case "chrome_snapshot":
    case "chrome_console":
    case "chrome_network":
      return { key: "session.activity.browserCheck", params: {} }
    case "todowrite":
      return { key: "session.activity.todo", params: {} }
    case "skill":
      return named("session.activity.skill", inputField(input, "id") ?? inputField(input, "name"))
    case "subagent":
      return named("session.activity.subagent", short(inputField(input, "description") ?? ""))
    case "question":
      return { key: "session.activity.question", params: {} }
  }
  if (tool.name.startsWith("chrome_")) return { key: "session.activity.browser", params: {} }
  if (tool.name.startsWith("memory_")) return { key: "session.activity.memory", params: {} }
  if (tool.name.startsWith("terminal_")) return { key: "session.activity.terminal", params: {} }
  return { key: "session.activity.tool", params: { value: tool.name } }
}

/**
 * The agent's current step while the session works: the latest unfinished tool call, otherwise reasoning, a reply
 * being written, or waiting on the model since the last finished step.
 */
export function sessionActivity(messages: readonly SessionMessageInfo[]): Activity | undefined {
  const last = messages.at(-1)
  if (!last) return
  if (last.type === "compaction") return { key: "session.activity.compact", params: {}, since: last.time.created }
  if (last.type !== "assistant") return { key: "session.activity.thinking", params: {}, since: last.time.created }

  const tool = last.content.findLast(
    (item): item is SessionMessageAssistantTool =>
      item.type === "tool" && (item.state.status === "streaming" || item.state.status === "running"),
  )
  if (tool) return { ...describeTool(tool), since: tool.time.ran ?? tool.time.created }

  const part = last.content.at(-1)
  if (part?.type === "text" && part.text && !last.time.streamed)
    return { key: "session.activity.reply", params: {}, since: last.time.created }

  // Between steps the model is reading the results and deciding what to do next.
  const settled = last.content.flatMap((item) =>
    item.type === "tool"
      ? [item.time.completed ?? item.time.created]
      : item.type === "reasoning"
        ? [item.time?.created ?? 0]
        : [],
  )
  return { key: "session.activity.thinking", params: {}, since: Math.max(last.time.created, ...settled) }
}

/** "8s", "1m 05s", "1h 02m". */
export function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
}
