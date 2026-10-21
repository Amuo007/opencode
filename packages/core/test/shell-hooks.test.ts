import { describe, expect, test } from "bun:test"
import { ShellHooksPlugin } from "@opencode/core/plugin/shell-hooks"

describe("ShellHooksPlugin", () => {
  test("parses hooks and skips malformed entries", () => {
    expect(
      ShellHooksPlugin.parse(
        JSON.stringify({ PreToolUse: [{ matcher: "shell", command: "true" }, { matcher: "x" }], Other: [] }),
      ),
    ).toEqual({ PreToolUse: [{ matcher: "shell", command: "true" }], PostToolUse: [], Stop: [] })
  })

  test("matches tool names as anchored patterns", () => {
    expect(ShellHooksPlugin.matches(undefined, "edit")).toBe(true)
    expect(ShellHooksPlugin.matches("*", "edit")).toBe(true)
    expect(ShellHooksPlugin.matches("edit|write", "write")).toBe(true)
    expect(ShellHooksPlugin.matches("edit", "notebook_edit")).toBe(false)
    expect(ShellHooksPlugin.matches("chrome_.*", "chrome_open")).toBe(true)
  })

  test("runs commands with stdin, env and exit codes", async () => {
    const result = await ShellHooksPlugin.run({
      command: 'read line; echo "$OPENCODE_TOOL:$line" >&2; exit 2',
      cwd: process.cwd(),
      stdin: '{"tool":"shell"}\n',
      env: { OPENCODE_TOOL: "shell" },
      timeout: 10,
    })
    expect(result.code).toBe(2)
    expect(result.stderr.trim()).toBe('shell:{"tool":"shell"}')
  })

  test("kills commands that time out", async () => {
    const result = await ShellHooksPlugin.run({ command: "sleep 5", cwd: process.cwd(), stdin: "", env: {}, timeout: 0.2 })
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain("timed out")
  })
})
