import { describe, expect, test } from "bun:test"
import { LoopPlugin } from "@opencode/core/plugin/loop"

describe("LoopPlugin", () => {
  test("parses intervals and prompts", () => {
    expect(LoopPlugin.parseLoop("10m check the deploy")).toEqual({ seconds: 600, prompt: "check the deploy" })
    expect(LoopPlugin.parseLoop("2 hours summarize logs")).toEqual({ seconds: 7200, prompt: "summarize logs" })
    expect(LoopPlugin.parseLoop("5s ping")).toEqual({ seconds: LoopPlugin.MIN_SECONDS, prompt: "ping" })
    expect(LoopPlugin.parseLoop("check the deploy")).toBeUndefined()
    expect(LoopPlugin.parseLoop("10m")).toBeUndefined()
  })

  test("builds platform notification commands", () => {
    expect(LoopPlugin.notifyCommand("Done", 'Build "ok"', "darwin")).toEqual([
      "osascript",
      "-e",
      'display notification "Build \\"ok\\"" with title "Done" sound name "Glass"',
    ])
    expect(LoopPlugin.notifyCommand("Done", "ok", "linux")).toEqual(["notify-send", "Done", "ok"])
    expect(LoopPlugin.notifyCommand("Done", "ok", "aix")).toBeUndefined()
  })
})
