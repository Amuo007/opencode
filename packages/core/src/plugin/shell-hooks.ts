export * as ShellHooksPlugin from "./shell-hooks.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Tool } from "@opencode/schema/tool"
import { Global } from "@opencode/util/global"
import { Effect, Stream } from "effect"
import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"

// Shell-command hooks configured in hooks.json, in the spirit of Claude Code hooks:
//   ~/.config/opencode/hooks.json (global) and <project>/.opencode/hooks.json (project)
//   { "PreToolUse": [{ "matcher": "shell", "command": "./check.sh", "timeout": 30 }],
//     "PostToolUse": [{ "matcher": "edit|write", "command": "npx prettier --write \"$OPENCODE_FILE_PATH\"" }] }
//   "Stop" hooks run when a turn finishes (e.g. a notification); their matcher is ignored.
// Each command gets the event as JSON on stdin. Exit code 2 blocks a PreToolUse call (stderr is
// the reason the model sees) and sends stderr back to the model for PostToolUse. Other non-zero
// exits are reported in the log and ignored.

export const FILE = "hooks.json"
const DEFAULT_TIMEOUT_SECONDS = 60
const MAX_FEEDBACK = 4000

export type Hook = { matcher?: string; command: string; timeout?: number }
export type Event = "PreToolUse" | "PostToolUse" | "Stop"
export type Hooks = Partial<Record<Event, Hook[]>>

export function parse(text: string): Hooks {
  const value = JSON.parse(text) as Record<string, unknown>
  const list = (key: Event) =>
    Array.isArray(value[key])
      ? (value[key] as unknown[]).filter(
          (item): item is Hook =>
            typeof item === "object" && item !== null && typeof (item as Hook).command === "string",
        )
      : []
  return { PreToolUse: list("PreToolUse"), PostToolUse: list("PostToolUse"), Stop: list("Stop") }
}

export function matches(matcher: string | undefined, tool: string) {
  if (!matcher || matcher === "*") return true
  try {
    return new RegExp(`^(?:${matcher})$`).test(tool)
  } catch {
    return matcher === tool
  }
}

export function run(input: { command: string; cwd: string; stdin: string; env: Record<string, string>; timeout: number }) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(input.command, {
      cwd: input.cwd,
      shell: true,
      env: { ...process.env, ...input.env },
      stdio: ["pipe", "pipe", "pipe"],
    })
    const output = { stdout: "", stderr: "" }
    const timer = setTimeout(() => {
      output.stderr += `\nHook timed out after ${input.timeout}s`
      child.kill("SIGKILL")
    }, input.timeout * 1000)
    child.stdout.on("data", (chunk) => (output.stdout += String(chunk)))
    child.stderr.on("data", (chunk) => (output.stderr += String(chunk)))
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({ code: 1, stdout: output.stdout, stderr: error.message })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code, ...output })
    })
    child.stdin.on("error", () => undefined)
    child.stdin.end(input.stdin)
  })
}

const filePath = (input: unknown) => {
  if (typeof input !== "object" || input === null) return undefined
  const record = input as Record<string, unknown>
  const value = record.path ?? record.filePath ?? record.file_path
  return typeof value === "string" ? value : undefined
}

export const Plugin = define({
  id: "opencode.shell-hooks",
  effect: Effect.fn("ShellHooksPlugin")(function* (ctx) {
    const global = yield* Global.Service
    const project = ctx.location.project.directory
    const files = [path.join(global.config, FILE), path.join(project, ".opencode", FILE)]

    const load = () =>
      Promise.all(
        files.map((file) =>
          readFile(file, "utf8")
            .then(parse)
            .catch(() => ({}) as Hooks),
        ),
      )

    const fire = (event: Event, tool: string, payload: Record<string, unknown>) =>
      Effect.promise(async () => {
        const hooks = (await load())
          .flatMap((item) => item[event] ?? [])
          .filter((hook) => event === "Stop" || matches(hook.matcher, tool))
        const file = filePath(payload.input)
        const results = []
        for (const hook of hooks) {
          const result = await run({
            command: hook.command,
            cwd: project,
            stdin: JSON.stringify({ event, tool, cwd: ctx.location.directory, ...payload }),
            env: {
              OPENCODE_HOOK_EVENT: event,
              OPENCODE_TOOL: tool,
              OPENCODE_PROJECT_DIR: project,
              ...(file ? { OPENCODE_FILE_PATH: path.resolve(ctx.location.directory, file) } : {}),
            },
            timeout: hook.timeout ?? DEFAULT_TIMEOUT_SECONDS,
          })
          results.push({ hook, ...result })
          // A blocking PreToolUse hook stops the remaining hooks for this call.
          if (event === "PreToolUse" && result.code === 2) break
        }
        return results
      })

    const feedback = (results: Array<{ hook: Hook; code: number | null; stderr: string; stdout: string }>) =>
      results
        .filter((result) => result.code === 2)
        .map((result) => (result.stderr.trim() || result.stdout.trim() || `Hook "${result.hook.command}" exited with code 2`).slice(0, MAX_FEEDBACK))

    const warn = (results: Array<{ hook: Hook; code: number | null; stderr: string }>) =>
      Effect.forEach(
        results.filter((result) => result.code !== 0 && result.code !== 2),
        (result) => Effect.logWarning("hook failed", { command: result.hook.command, code: result.code, stderr: result.stderr }),
        { discard: true },
      )

    yield* ctx.event.subscribe().pipe(
      Stream.filter((event) => event.type === "session.execution.succeeded"),
      Stream.runForEach((event) =>
        fire("Stop", "", { sessionID: (event.data as { sessionID: string }).sessionID }).pipe(Effect.flatMap(warn)),
      ),
      Effect.forkScoped({ startImmediately: true }),
    )

    yield* ctx.tool.hook("execute.before", (event) =>
      Effect.gen(function* () {
        const results = yield* fire("PreToolUse", event.tool, { sessionID: event.sessionID, input: event.input })
        yield* warn(results)
        const blocked = feedback(results)
        if (blocked.length) return yield* Effect.fail(new Tool.Error({ message: `Blocked by hook: ${blocked.join("\n")}` }))
      }),
    )

    yield* ctx.tool.hook("execute.after", (event) =>
      Effect.gen(function* () {
        const results = yield* fire("PostToolUse", event.tool, {
          sessionID: event.sessionID,
          input: event.input,
          status: event.status,
        })
        yield* warn(results)
        const notes = feedback(results)
        if (!notes.length || event.status !== "completed") return
        const text = `\n\n[hook feedback]\n${notes.join("\n")}`
        const content = event.result.content
        event.result = {
          ...event.result,
          content: typeof content === "string" ? content + text : [...(content ?? []), { type: "text", text }],
        }
      }),
    )
  }),
})
