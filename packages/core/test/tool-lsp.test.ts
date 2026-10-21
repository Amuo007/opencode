import { describe, expect, test } from "bun:test"
import { LspTools } from "@opencode/core/tool/plugin/lsp"

const frame = (value: unknown) => {
  const body = JSON.stringify(value)
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
}

describe("LspTools", () => {
  test("decodes framed messages and keeps partial input", () => {
    const whole = frame({ id: 1, result: "é" }) + frame({ method: "x" })
    const partial = frame({ id: 2 }).slice(0, 10)
    const decoded = LspTools.decodeFrames(Buffer.from(whole + partial))
    expect(decoded.messages).toEqual([{ id: 1, result: "é" }, { method: "x" }])
    expect(decoded.rest.toString()).toBe(partial)
  })

  test("picks the first installed server for a file", () => {
    const has = (command: string) => command === "npx" || command === "pylsp"
    expect(LspTools.resolveServer("a/b.ts", undefined, has)?.command).toEqual([
      "npx",
      "-y",
      "-p",
      "typescript",
      "-p",
      "typescript-language-server",
      "typescript-language-server",
      "--stdio",
    ])
    expect(LspTools.resolveServer("a/b.py", undefined, has)?.command).toEqual(["pylsp"])
    expect(LspTools.resolveServer("a/b.go", undefined, has)).toBeUndefined()
    expect(LspTools.resolveServer("a/b.py", false, has)).toBeUndefined()
  })

  test("honors configured and disabled servers", () => {
    const has = () => true
    expect(
      LspTools.resolveServer("x.py", { custom: { command: ["my-lsp", "--stdio"], extensions: [".py"] } }, has)?.command,
    ).toEqual(["my-lsp", "--stdio"])
    expect(LspTools.resolveServer("x.go", { go: { disabled: true } }, has)).toBeUndefined()
  })

  test("formats diagnostics errors first", () => {
    const range = (line: number) => ({ start: { line, character: 0 }, end: { line, character: 1 } })
    expect(
      LspTools.formatDiagnostics("a.ts", [
        { range: range(4), severity: 2, message: "unused" },
        { range: range(9), severity: 1, message: "bad  type", source: "ts" },
      ]),
    ).toBe("a.ts:10:1 error: bad type (ts)\na.ts:5:1 warning: unused")
  })
})
