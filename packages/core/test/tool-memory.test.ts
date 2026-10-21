import { describe, expect, test } from "bun:test"
import { MemoryTools } from "@opencode/core/tool/plugin/memory"

describe("MemoryTools", () => {
  test("normalizes memory names", () => {
    expect(MemoryTools.slug("Prefers Bun over NPM.md")).toBe("prefers-bun-over-npm")
    expect(MemoryTools.slug("  --  ")).toBe("")
  })

  test("names project folders after their path", () => {
    expect(MemoryTools.projectKey("/Users/me/my app")).toBe("-Users-me-my-app")
  })

  test("adds and replaces index lines", () => {
    const first = MemoryTools.upsertIndex("", "uses-bun", "Project uses Bun")
    expect(first).toBe("- [uses-bun](uses-bun.md) — Project uses Bun\n")
    const second = MemoryTools.upsertIndex(first, "deploy-steps", "How to deploy")
    const replaced = MemoryTools.upsertIndex(second, "uses-bun", "Project uses Bun 1.4")
    expect(replaced.split("\n").filter(Boolean)).toEqual([
      "- [uses-bun](uses-bun.md) — Project uses Bun 1.4",
      "- [deploy-steps](deploy-steps.md) — How to deploy",
    ])
    expect(MemoryTools.removeFromIndex(replaced, "uses-bun")).toBe(
      "- [deploy-steps](deploy-steps.md) — How to deploy\n",
    )
  })

  test("writes frontmatter", () => {
    expect(MemoryTools.format({ name: "a", description: "b", type: "user", content: "c\n" })).toBe(
      "---\nname: a\ndescription: b\nmetadata:\n  type: user\n---\n\nc\n",
    )
  })

  test("describes an empty memory", () => {
    expect(MemoryTools.instructions("/m", "")).toContain("(empty - nothing saved yet)")
  })
})

describe("MemoryTools files", () => {
  test("parses frontmatter and plain files", () => {
    expect(
      MemoryTools.parse("x", MemoryTools.format({ name: "a", description: "b", type: "user", content: "c" })),
    ).toEqual({
      name: "a",
      description: "b",
      type: "user",
      content: "c",
    })
    expect(MemoryTools.parse("plain", "just text")).toEqual({
      name: "plain",
      description: "",
      type: "",
      content: "just text",
    })
  })
})
