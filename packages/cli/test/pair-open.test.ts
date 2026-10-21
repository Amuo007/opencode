import { describe, expect, test } from "bun:test"
import { browserCommand } from "../src/commands/handlers/pair"

describe("pair --open", () => {
  test("uses the platform's browser opener", () => {
    expect(browserCommand("http://x", "darwin")).toEqual(["open", ["http://x"]])
    expect(browserCommand("http://x", "linux")).toEqual(["xdg-open", ["http://x"]])
    expect(browserCommand("http://x", "win32")).toEqual(["cmd", ["/c", "start", "", "http://x"]])
  })
})
