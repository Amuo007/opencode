export * as LoopPlugin from "./loop.js"

import { ToolFailure } from "@opencode/ai"
import { define } from "@opencode/plugin/effect/plugin"
import { Duration, Effect, Fiber, Schema } from "effect"
import { spawn } from "node:child_process"

// /loop <interval> <prompt>: send the prompt to the session every interval (e.g. "/loop 10m check
// the deploy"), until "/loop stop" or MAX_RUNS. The notify tool lets the agent raise a desktop
// notification when something needs the user's attention.

export const MAX_RUNS = 100
export const MIN_SECONDS = 30

export function parseLoop(text: string) {
  const match = text
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)\s+([\s\S]+)$/i)
  if (!match) return undefined
  const unit = match[2].toLowerCase()
  const factor = unit.startsWith("h") ? 3600 : unit.startsWith("m") ? 60 : 1
  return { seconds: Math.max(MIN_SECONDS, Number(match[1]) * factor), prompt: match[3].trim() }
}

export function notifyCommand(title: string, message: string, platform = process.platform) {
  if (platform === "darwin")
    return [
      "osascript",
      "-e",
      `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)} sound name "Glass"`,
    ]
  if (platform === "linux") return ["notify-send", title, message]
  if (platform === "win32")
    return [
      "powershell",
      "-NoProfile",
      "-Command",
      `[reflection.assembly]::loadwithpartialname('System.Windows.Forms') | Out-Null; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.ShowBalloonTip(5000, ${JSON.stringify(title)}, ${JSON.stringify(message)}, 'Info')`,
    ]
  return undefined
}

export const Plugin = define({
  id: "opencode.loop",
  effect: Effect.fn("LoopPlugin")(function* (ctx) {
    const loops = new Map<string, Fiber.Fiber<unknown, unknown>>()
    const stop = (sessionID: string) =>
      Effect.gen(function* () {
        const fiber = loops.get(sessionID)
        loops.delete(sessionID)
        if (fiber) yield* Fiber.interrupt(fiber)
        return fiber !== undefined
      })
    yield* Effect.addFinalizer(() => Effect.forEach([...loops.keys()], stop, { discard: true }))

    yield* ctx.command.transform((editor) =>
      editor.add({
        name: "loop",
        description: "repeat a prompt on an interval (/loop 10m <prompt>, /loop stop)",
        execute: (input) =>
          Effect.gen(function* () {
            const text = input.prompt.text.trim()
            if (!text || text === "stop") {
              const stopped = yield* stop(input.sessionID)
              yield* ctx.session.synthetic({
                sessionID: input.sessionID,
                text: stopped
                  ? "Loop stopped."
                  : "No loop is running. Use /loop <interval> <prompt>, e.g. /loop 10m check the build.",
              })
              return
            }
            const loop = parseLoop(text)
            if (!loop) {
              yield* ctx.session.synthetic({
                sessionID: input.sessionID,
                text: "Usage: /loop <interval> <prompt>, for example /loop 10m check the deploy status. Use /loop stop to end it.",
              })
              return
            }
            yield* stop(input.sessionID)
            const run = (index: number) =>
              ctx.session.prompt({
                sessionID: input.sessionID,
                text: `[loop run ${index} of up to ${MAX_RUNS}, every ${loop.seconds}s; the user can stop it with /loop stop]\n\n${loop.prompt}`,
                delivery: "queue",
              })
            yield* run(1)
            const fiber = yield* Effect.forkDetach(
              Effect.forEach(
                Array.from({ length: MAX_RUNS - 1 }, (_, index) => index + 2),
                (index) => Effect.sleep(Duration.seconds(loop.seconds)).pipe(Effect.andThen(run(index))),
                { discard: true },
              ).pipe(Effect.ensuring(Effect.sync(() => loops.delete(input.sessionID)))),
            )
            loops.set(input.sessionID, fiber)
          }),
      }),
    )

    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name: "notify",
          options: { codemode: false },
          description:
            "Show a desktop notification to the user. Use it when a long task finishes or something needs their attention while they may be away from the screen.",
          input: Schema.Struct({
            title: Schema.String.annotate({ description: "Short title" }),
            message: Schema.String.annotate({ description: "One or two sentences" }),
          }),
          output: Schema.Struct({ shown: Schema.Boolean }),
          execute: (input) =>
            Effect.gen(function* () {
              const command = notifyCommand(input.title, input.message)
              if (!command)
                return yield* new ToolFailure({ message: `Notifications are not supported on ${process.platform}` })
              const code = yield* Effect.promise(
                () =>
                  new Promise<number | null>((resolve) => {
                    const child = spawn(command[0], command.slice(1), { stdio: "ignore" })
                    child.on("error", () => resolve(1))
                    child.on("close", resolve)
                  }),
              )
              if (code !== 0) return yield* new ToolFailure({ message: "The notification could not be shown" })
              return { output: { shown: true }, content: "Notification shown." }
            }),
        }),
      )
      .pipe(Effect.orDie)
  }),
})
