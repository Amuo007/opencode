import { expect, test } from "bun:test"
import { releaseTime } from "./models"

test("releaseTime reads a release date", () => {
  expect(releaseTime("2026-10-01")).toBe(Date.parse("2026-10-01"))
})

test.each([["1970-01-01"], [""], ["not a date"]])("releaseTime(%p) is unknown", (date) => {
  expect(releaseTime(date)).toBeNaN()
})
