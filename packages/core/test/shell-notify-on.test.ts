import { describe, expect, test } from "bun:test"
import { matchLines } from "@opencode/core/tool/plugin/shell"

describe("shell notify_on", () => {
  test("matches complete lines and carries a partial line to the next read", () => {
    const first = matchLines(/ready/i, "", "compiling\nServer REA")
    expect(first.matches).toEqual([])
    expect(first.rest).toBe("Server REA")
    const second = matchLines(/ready/i, first.rest, "DY on :3000\nwatching\n")
    expect(second.matches).toEqual(["Server READY on :3000"])
    expect(second.rest).toBe("")
  })
})
