import { describe, expect, test } from "bun:test"
import { buildConfig, parseCommand, parsePairs, validName } from "./mcp-dialog"

describe("MCP dialog helpers", () => {
  test("splits commands and keeps quoted arguments together", () => {
    expect(parseCommand(`npx -y server "/Users/me/My Projects" 'a b'`)).toEqual([
      "npx",
      "-y",
      "server",
      "/Users/me/My Projects",
      "a b",
    ])
  })

  test("reads key value lines", () => {
    expect(parsePairs("API_KEY=abc=def\n# comment\n\nDEBUG = 1", "=")).toEqual({ API_KEY: "abc=def", DEBUG: "1" })
    expect(parsePairs("Authorization: Bearer x", ":")).toEqual({ Authorization: "Bearer x" })
    expect(parsePairs("", ":")).toBeUndefined()
  })

  test("validates names", () => {
    expect(validName("github-mcp_2")).toBe(true)
    expect(validName("-bad")).toBe(false)
    expect(validName("has space")).toBe(false)
  })

  test("builds local and remote configs", () => {
    const base = { command: "", url: "", environment: "", headers: "" }
    expect(buildConfig({ ...base, type: "local", command: "node server.js", environment: "A=1" })).toEqual({
      type: "local",
      command: ["node", "server.js"],
      environment: { A: "1" },
    })
    expect(buildConfig({ ...base, type: "local" })).toBe("command")
    expect(buildConfig({ ...base, type: "remote", url: "ftp://x" })).toBe("url")
    expect(buildConfig({ ...base, type: "remote", url: "https://mcp.example.com/mcp" })).toEqual({
      type: "remote",
      url: "https://mcp.example.com/mcp",
    })
  })
})
