import { describe, expect, test } from "bun:test"
import { GoalPlugin } from "@opencode/core/plugin/goal"

describe("GoalPlugin", () => {
  test("kickoff explains how to finish", () => {
    const text = GoalPlugin.kickoff("tests pass")
    expect(text.startsWith("Goal: tests pass")).toBe(true)
    expect(text).toContain(GoalPlugin.tool)
  })

  test("nudge reports the round and the limit", () => {
    expect(GoalPlugin.nudge({ condition: "ship it", rounds: 3 })).toContain(`round 3 of ${GoalPlugin.MAX_ROUNDS}`)
  })
})
