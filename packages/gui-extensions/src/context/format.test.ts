import { describe, expect, test } from "bun:test"
import { outputSpeed } from "./format"

describe("outputSpeed", () => {
  test("reports the latest reply and the session average", () => {
    const speed = outputSpeed([
      { type: "user", time: { created: 0 } },
      { type: "assistant", time: { created: 1000, streamed: 3000 }, tokens: { output: 80, reasoning: 20 } },
      { type: "assistant", time: { created: 5000, completed: 6000 }, tokens: { output: 50, reasoning: 0 } },
    ])
    expect(speed.last).toBe(50)
    expect(speed.average).toBe(50)
  })

  test("ignores replies without tokens or timing", () => {
    expect(outputSpeed([{ type: "assistant", time: { created: 1 } }])).toEqual({ last: undefined, average: undefined })
  })
})
