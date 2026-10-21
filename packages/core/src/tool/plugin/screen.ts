export * as ScreenTool from "./screen.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import { ToolFailure } from "@opencode/ai"
import { Global } from "@opencode/util/global"
import { Effect, Schema } from "effect"
import { spawn } from "node:child_process"
import { mkdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import { Permission } from "../../permission.js"

// Captures the computer's screen (the desktop and its apps), as opposed to chrome_screenshot, which
// captures the agent's headless browser page.

export const name = "screenshot"
const MAX_SIDE = 1600

const windowsScript = (file: string) =>
  [
    "Add-Type -AssemblyName System.Windows.Forms,System.Drawing",
    "$b=[System.Windows.Forms.SystemInformation]::VirtualScreen",
    "$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height",
    "$g=[System.Drawing.Graphics]::FromImage($bmp)",
    "$g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size)",
    `$bmp.Save('${file.replace(/'/g, "''")}',[System.Drawing.Imaging.ImageFormat]::Png)`,
  ].join("; ")

/** The commands that can capture the screen to `file` as PNG on a platform, tried in order. */
export function captureCommands(platform: NodeJS.Platform, file: string, display?: number) {
  if (platform === "darwin")
    return [["screencapture", "-x", "-t", "png", ...(display ? ["-D", String(display)] : []), file]]
  if (platform === "win32") return [["powershell", "-NoProfile", "-NonInteractive", "-Command", windowsScript(file)]]
  return [
    ["grim", file],
    ["gnome-screenshot", "-f", file],
    ["spectacle", "-b", "-n", "-o", file],
    ["scrot", "-o", file],
    ["import", "-window", "root", file],
  ]
}

const exec = (argv: string[]) =>
  new Promise<{ code: number | null; missing: boolean; stderr: string }>((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""
    child.stderr.on("data", (chunk) => (stderr += String(chunk)))
    child.on("error", (error: NodeJS.ErrnoException) =>
      resolve({ code: null, missing: error.code === "ENOENT", stderr }),
    )
    child.on("close", (code) => resolve({ code, missing: false, stderr }))
  })

async function capture(file: string, display?: number) {
  const errors: string[] = []
  for (const argv of captureCommands(process.platform, file, display)) {
    const result = await exec(argv)
    if (result.missing) continue
    const size = await stat(file)
      .then((info) => info.size)
      .catch(() => 0)
    if (result.code === 0 && size > 0) {
      // Keep large and Retina screens readable without filling the model's context.
      if (process.platform === "darwin") await exec(["sips", "-Z", String(MAX_SIDE), file])
      return
    }
    errors.push(`${argv[0]}: ${result.stderr.trim() || `exit code ${result.code}`}`)
  }
  throw new Error(
    errors.length
      ? `Screen capture failed (${errors.join("; ")})`
      : "No screen capture command found. On Linux install grim, gnome-screenshot, spectacle, scrot or ImageMagick.",
  )
}

export const Plugin = {
  id: "opencode.tool.screen",
  effect: Effect.fn("ScreenTool.Plugin")(function* (ctx: Context) {
    const permission = yield* Permission.Service
    const global = yield* Global.Service
    const screenshots = path.join(global.data, "screenshots")

    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          options: { permission: name, codemode: false },
          description: [
            "Take a screenshot of the computer's screen (the desktop and the apps on it) and look at it.",
            "Use it to check a native app, a window, a terminal or anything outside the browser; for web pages use chrome_screenshot instead.",
            process.platform === "darwin"
              ? "On macOS the app running OpenCode needs Screen Recording permission; without it the image shows only the wallpaper and menu bar, so tell the user to allow it in System Settings > Privacy & Security > Screen Recording."
              : "",
          ]
            .filter(Boolean)
            .join(" "),
          input: Schema.Struct({
            display: Schema.optionalKey(Schema.Number).annotate({
              description: "Display number on macOS (1 is the main display). Omit for the main display.",
            }),
          }),
          output: Schema.Struct({ path: Schema.String }),
          execute: (input, context) =>
            Effect.gen(function* () {
              yield* permission
                .assert({
                  action: name,
                  resources: ["*"],
                  save: ["*"],
                  metadata: input,
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source: { type: "tool", messageID: context.messageID, id: context.id },
                })
                .pipe(Effect.mapError((error) => new ToolFailure({ message: "Permission denied: screenshot", error })))
              const file = path.join(screenshots, `${context.sessionID}-screen-${Date.now()}.png`)
              const data = yield* Effect.tryPromise({
                try: async () => {
                  await mkdir(screenshots, { recursive: true })
                  await capture(file, input.display)
                  return (await readFile(file)).toString("base64")
                },
                catch: (error) =>
                  new ToolFailure({ message: error instanceof Error ? error.message : String(error), error }),
              })
              return {
                output: { path: file },
                content: [
                  { type: "text" as const, text: `Screenshot of the screen (saved to ${file})` },
                  { type: "file" as const, uri: `data:image/png;base64,${data}`, mime: "image/png", name: file },
                ],
                metadata: { path: file },
              }
            }),
        }),
      )
      .pipe(Effect.orDie)
  }),
}
