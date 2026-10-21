import { describe, expect, test } from "bun:test"
import { TerminalTools } from "@opencode/core/tool/plugin/terminal"

describe("TerminalTools.plain", () => {
  test("removes colors, titles and cursor moves", () => {
    expect(TerminalTools.plain("\x1b]0;title\x07\x1b[1;32mok\x1b[0m done\r\n")).toBe("ok done\n")
  })

  test("keeps the last redraw of a carriage-return progress line", () => {
    expect(TerminalTools.plain("10%\r50%\r100%\nnext")).toBe("100%\nnext")
  })

  test("applies backspaces", () => {
    expect(TerminalTools.plain("lsx\x08 -la")).toBe("ls -la")
  })

  test("tail keeps the last lines without trailing blank lines", () => {
    expect(TerminalTools.tail("a\nb\nc\n\n", 2)).toBe("b\nc")
  })
})
