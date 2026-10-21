export * as TerminalTools from "./terminal.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import { ToolFailure } from "@opencode/ai"
import { Tool } from "@opencode/schema/tool"
import { Effect, Schema } from "effect"
import { Permission } from "../../permission.js"
import { Pty } from "../../pty.js"

// The user's terminals in the app's Terminal panel: the agent can read what is on them and type into them.
// The agent's own commands still belong in the shell tool; these are for the user's terminals.

// Small models often send numbers as strings, so numeric inputs accept both.
const Loose = Schema.Union([Schema.Number, Schema.NumberFromString])

export const namespace = "terminal"
const DEFAULT_LINES = 80
const MAX_LINES = 500

/** Terminal output as plain text: escape sequences removed and carriage-return redraws resolved. */
export function plain(text: string) {
  const stripped = text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "")
    .replace(/\r\n/g, "\n")
  return stripped
    .split("\n")
    .map((line) => {
      let value = line.split("\r").at(-1) ?? ""
      while (/[^\x08]\x08/.test(value)) value = value.replace(/[^\x08]\x08/, "")
      return value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    })
    .join("\n")
}

export const tail = (text: string, lines: number) => text.replace(/\s+$/, "").split("\n").slice(-lines).join("\n")

const Output = Schema.Struct({ output: Schema.String })

export const Plugin = {
  id: "opencode.tool.terminal",
  effect: Effect.fn("TerminalTools.Plugin")(function* (ctx: Context) {
    const pty = yield* Pty.Service
    const permission = yield* Permission.Service

    const reply = (output: string) => ({ output: { output }, content: output })

    // The named terminal, or the newest running one.
    const pick = (id: string | undefined) =>
      Effect.gen(function* () {
        const terminals = yield* pty.list()
        if (id !== undefined) return { terminals, terminal: terminals.find((item) => item.id === id) }
        return { terminals, terminal: terminals.filter((item) => item.status === "running").at(-1) }
      })

    const describe = (terminals: readonly Pty.Info[]) =>
      terminals.map((item) => `${item.id}  ${item.title || item.command}  (${item.status}, ${item.cwd})`).join("\n")

    // Retained output from `cursor` (the whole buffer when omitted) and the cursor at its end.
    const read = (id: Pty.ID, cursor?: number) =>
      pty.attach(id, { ...(cursor === undefined ? {} : { cursor }), onData: () => {}, onEnd: () => {} }).pipe(
        Effect.map((attachment) => {
          attachment.detach()
          return { text: plain(attachment.replay), cursor: attachment.cursor }
        }),
      )

    const none =
      "No terminal is open. The user can open one from the Terminal panel (ctrl+` or /terminal in the web app)."

    yield* ctx.tool
      .transform((editor) => {
        editor.namespace({
          name: namespace,
          description: "The user's terminals in the app's Terminal panel.",
        })
        // Both tools share the "terminal" permission name, so one deny rule removes them together.
        const options = { namespace, permission: namespace, codemode: false } as const

        editor.add({
          name: "read",
          options,
          description:
            "Read what is on the user's terminal in the app's Terminal panel: the commands they ran and the output, as plain text. Use it when the user refers to something they ran or saw there (an error, a failing test, a dev server log). Without id it reads the newest running terminal and lists the others.",
          input: Schema.Struct({
            id: Schema.optionalKey(Schema.String).annotate({ description: "Terminal id from a previous listing" }),
            lines: Schema.optionalKey(Loose).annotate({
              description: `Trailing lines to return (default ${DEFAULT_LINES}, max ${MAX_LINES})`,
            }),
          }),
          output: Output,
          execute: (input) =>
            Effect.gen(function* () {
              const { terminals, terminal } = yield* pick(input.id)
              if (!terminal)
                return reply(input.id === undefined ? none : `No terminal ${input.id}.\n${describe(terminals)}`)
              const lines = Math.min(Math.max(1, Math.floor(input.lines ?? DEFAULT_LINES)), MAX_LINES)
              const output = yield* read(terminal.id).pipe(
                Effect.map((result) => tail(result.text, lines)),
                Effect.catch(() => Effect.succeed("(this terminal has exited; its output is no longer available)")),
              )
              const others = terminals.filter((item) => item.id !== terminal.id)
              return reply(
                [
                  `Terminal ${terminal.id}: ${terminal.title || terminal.command} (${terminal.status}, ${terminal.cwd})`,
                  "",
                  output || "(no output yet)",
                  ...(others.length ? ["", "Other terminals:", describe(others)] : []),
                ].join("\n"),
              )
            }),
        })

        editor.add({
          name: "run",
          options,
          description:
            "Type a command into the user's terminal in the app's Terminal panel and press Enter, then return the output that appears within `wait` seconds. Only use it when the user asks to run something in their terminal or to answer a program already running there; run your own commands with the shell tool instead.",
          input: Schema.Struct({
            command: Schema.String.annotate({ description: "Text to type; Enter is pressed after it" }),
            id: Schema.optionalKey(Schema.String).annotate({
              description: "Terminal id; the newest running one when omitted",
            }),
            wait: Schema.optionalKey(Loose).annotate({
              description: "Seconds to collect output (default 2, max 30)",
            }),
          }),
          output: Output,
          execute: (input, context: Tool.Context) =>
            Effect.gen(function* () {
              const { terminal } = yield* pick(input.id)
              if (!terminal || terminal.status !== "running") return reply(none)
              yield* permission
                .assert({
                  action: namespace,
                  resources: [input.command],
                  save: ["*"],
                  metadata: { command: input.command, terminal: terminal.id },
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source: { type: "tool", messageID: context.messageID, id: context.id },
                })
                .pipe(Effect.mapError((error) => new ToolFailure({ message: "Permission denied: terminal", error })))
              const fail = (error: unknown) =>
                new ToolFailure({ message: `Could not use terminal ${terminal.id}`, error })
              const start = yield* read(terminal.id, -1).pipe(Effect.mapError(fail))
              yield* pty.write(terminal.id, `${input.command}\r`).pipe(Effect.mapError(fail))
              yield* Effect.sleep(`${Math.min(Math.max(0, input.wait ?? 2), 30)} seconds`)
              const after = yield* read(terminal.id, start.cursor).pipe(
                Effect.map((result) => result.text),
                Effect.catch(() => Effect.succeed("")),
              )
              return reply(
                `Typed into terminal ${terminal.id}: ${input.command}\n\n${tail(after, MAX_LINES) || "(no output yet)"}`,
              )
            }),
        })
      })
      .pipe(Effect.orDie)
  }),
}
