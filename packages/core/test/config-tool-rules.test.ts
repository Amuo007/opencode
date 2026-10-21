import { describe, expect, test } from "bun:test"
import { applyEdits, modify, parse } from "jsonc-parser"
import { toolRules } from "@opencode/core/config"

// Applies the edits the way Config.update does and returns the parsed file.
const apply = (text: string, tools: Record<string, boolean>) =>
  parse(
    toolRules(text, tools).reduce(
      (current, [path, value]) =>
        applyEdits(current, modify(current, path, value, { formattingOptions: { tabSize: 2, insertSpaces: true } })),
      text,
    ),
  )

describe("Config tool switches", () => {
  test("adds a v1 permission deny entry for a group switched off", () => {
    expect(apply(`{}`, { chrome: false })).toEqual({ permission: { chrome: "deny" } })
  })

  test("turns a permission string into the * entry before the deny", () => {
    const result = apply(`{ "permission": "allow" }`, { chrome: false, memory: false })
    expect(result).toEqual({ permission: { "*": "allow", chrome: "deny", memory: "deny" } })
    expect(Object.keys(result.permission)).toEqual(["*", "chrome", "memory"])
  })

  test("moves an existing deny after the * entry so it still wins", () => {
    const result = apply(`{ "permission": { "chrome": "deny", "*": "allow" } }`, { chrome: false })
    expect(Object.keys(result.permission)).toEqual(["*", "chrome"])
  })

  test("keeps other permission entries and comments outside the key", () => {
    const text = `{
      // comments are allowed
      "permission": { "bash": { "rm *": "ask" }, "chrome": "deny" },
      "model": "local/halogen"
    }`
    expect(apply(text, { chrome: true, memory: false })).toEqual({
      permission: { bash: { "rm *": "ask" }, memory: "deny" },
      model: "local/halogen",
    })
    expect(toolRules(text, { chrome: true }).map(([path]) => path)).toEqual([["permission"]])
  })

  test("returns to the string form once every group is back on", () => {
    expect(apply(`{ "permission": { "*": "allow", "chrome": "deny" } }`, { chrome: true })).toEqual({
      permission: "allow",
    })
    expect(apply(`{ "permission": { "chrome": "deny" } }`, { chrome: true })).toEqual({})
  })

  test("leaves the file alone when nothing changes", () => {
    expect(toolRules(`{ "permission": "allow" }`, { chrome: true })).toEqual([])
    expect(toolRules(`{ "permission": { "*": "allow", "chrome": "deny" } }`, { chrome: false })).toEqual([])
    expect(toolRules(`{}`, { chrome: true })).toEqual([])
    expect(toolRules("{}", undefined)).toEqual([])
    expect(toolRules("{}", {})).toEqual([])
  })

  test("removes v2 permissions written by earlier builds, which OpenCode v1 refuses", () => {
    const text = `{ "permissions": [{ "action": "chrome", "resource": "*", "effect": "deny" }] }`
    expect(apply(text, { chrome: false })).toEqual({ permission: { chrome: "deny" } })
    const mixed = `{ "permissions": [{ "action": "shell", "resource": "rm *", "effect": "ask" }, { "action": "chrome", "resource": "*", "effect": "deny" }] }`
    expect(apply(mixed, { chrome: true })).toEqual({
      permissions: [{ action: "shell", resource: "rm *", effect: "ask" }],
    })
    expect(apply(`{ "permission": "allow", "permissions": [] }`, { chrome: true })).toEqual({ permission: "allow" })
  })
})
