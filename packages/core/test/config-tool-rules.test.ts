import { describe, expect, test } from "bun:test"
import { toolRules } from "@opencode/core/config"

describe("Config tool switches", () => {
  test("adds a deny rule for a group switched off and keeps other rules", () => {
    const text = `{ "permissions": [{ "action": "shell", "resource": "rm *", "effect": "ask" }] }`
    expect(toolRules(text, { chrome: false })).toEqual([
      [
        ["permissions"],
        [
          { action: "shell", resource: "rm *", effect: "ask" },
          { action: "chrome", resource: "*", effect: "deny" },
        ],
      ],
    ])
  })

  test("removes the deny rule when a group is switched back on", () => {
    const text = `{
      // comments are allowed
      "permissions": [{ "action": "chrome", "resource": "*", "effect": "deny" }, { "action": "memory", "resource": "*", "effect": "deny" }]
    }`
    expect(toolRules(text, { chrome: true })).toEqual([[["permissions"], [{ action: "memory", resource: "*", effect: "deny" }]]])
  })

  test("does nothing without switches", () => {
    expect(toolRules("{}", undefined)).toEqual([])
    expect(toolRules("{}", {})).toEqual([])
  })
})
