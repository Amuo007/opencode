import { describe, expect, test } from "bun:test"
import { ScreenTool } from "@opencode/core/tool/plugin/screen"

describe("ScreenTool.captureCommands", () => {
  test("uses screencapture on macOS, with an optional display", () => {
    expect(ScreenTool.captureCommands("darwin", "/tmp/a.png")).toEqual([
      ["screencapture", "-x", "-t", "png", "/tmp/a.png"],
    ])
    expect(ScreenTool.captureCommands("darwin", "/tmp/a.png", 2)[0]).toEqual([
      "screencapture",
      "-x",
      "-t",
      "png",
      "-D",
      "2",
      "/tmp/a.png",
    ])
  })

  test("tries the common Linux tools in order", () => {
    expect(ScreenTool.captureCommands("linux", "/tmp/a.png").map((argv) => argv[0])).toEqual([
      "grim",
      "gnome-screenshot",
      "spectacle",
      "scrot",
      "import",
    ])
  })

  test("escapes the output path in the Windows script", () => {
    const [argv] = ScreenTool.captureCommands("win32", "C:\\it's\\a.png")
    expect(argv[0]).toBe("powershell")
    expect(argv.at(-1)).toContain("'C:\\it''s\\a.png'")
  })
})
