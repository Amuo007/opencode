import { describe, expect, test } from "bun:test"
import { SessionTitle } from "@opencode/core/session/title"

describe("SessionTitle.cleanTitle", () => {
  test("strips list markers, emphasis and quotes", () => {
    expect(SessionTitle.cleanTitle('"**Rate limiting** implementation"')).toBe("Rate limiting implementation")
    expect(SessionTitle.cleanTitle("1. Open calc.py")).toBe("Open calc.py")
    expect(SessionTitle.cleanTitle("## Postgres API connection")).toBe("Postgres API connection")
  })

  test("rejects answers that are not title-sized", () => {
    expect(
      SessionTitle.cleanTitle(
        "I did not call an MCP tool because no deepwiki MCP tool is available, but the repository is a search tool",
      ),
    ).toBeUndefined()
    expect(SessionTitle.cleanTitle("   ")).toBeUndefined()
  })

  test("falls back to the start of the request", () => {
    expect(SessionTitle.requestTitle("Fix the login bug")).toBe("Fix the login bug")
    expect(SessionTitle.requestTitle("Create a small notes web app in a new folder notes-app with a textarea")).toBe(
      "Create a small notes web app in a new folder…",
    )
  })
})
