import { describe, expect, test } from "bun:test"
import { skillFile, slug } from "../src/handlers/skill-edit"

describe("skill editing", () => {
  test("turns a skill name into a folder-safe slug", () => {
    expect(slug("  My Release Checklist! ")).toBe("my-release-checklist")
    expect(slug("../../etc")).toBe("etc")
    expect(slug("!!!")).toBe("")
  })

  test("writes frontmatter the skill loader reads", () => {
    expect(
      skillFile({ name: "deploy", description: "Ship it: carefully\nnow", content: "\n1. Build\n2. Deploy\n" }),
    ).toBe('---\nname: deploy\ndescription: "Ship it: carefully now"\n---\n\n1. Build\n2. Deploy\n')
  })
})
