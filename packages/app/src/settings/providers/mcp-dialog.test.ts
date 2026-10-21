import { describe, expect, test } from "bun:test"
import { buildConfig, parseCommand, parseMcpJson, parsePairs, validName } from "./mcp-dialog"

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

describe("MCP JSON snippets", () => {
  test("reads the Claude Desktop and Cursor format with several servers", () => {
    const text = `{
      "mcpServers": {
        "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "x", "DEBUG": 1 } },
        "linear": { "type": "http", "url": "https://mcp.linear.app/mcp", "headers": { "Authorization": "Bearer y" } }
      }
    }`
    expect(parseMcpJson(text, "")).toEqual([
      {
        name: "github",
        config: {
          type: "local",
          command: ["npx", "-y", "@modelcontextprotocol/server-github"],
          environment: { GITHUB_TOKEN: "x", DEBUG: "1" },
        },
      },
      {
        name: "linear",
        config: { type: "remote", url: "https://mcp.linear.app/mcp", headers: { Authorization: "Bearer y" } },
      },
    ])
  })

  test("reads VS Code, OpenCode and bare entries", () => {
    expect(
      parseMcpJson(`{ "servers": { "fs": { "type": "stdio", "command": "npx", "args": ["server-fs", "/tmp"] } } }`, ""),
    ).toEqual([{ name: "fs", config: { type: "local", command: ["npx", "server-fs", "/tmp"] } }])
    expect(
      parseMcpJson(`{ "mcp": { "wiki": { "type": "remote", "url": "https://mcp.deepwiki.com/mcp" } } }`, ""),
    ).toEqual([{ name: "wiki", config: { type: "remote", url: "https://mcp.deepwiki.com/mcp" } }])
    expect(parseMcpJson(`"time": { "command": "uvx mcp-server-time --local-timezone UTC" },`, "")).toEqual([
      { name: "time", config: { type: "local", command: ["uvx", "mcp-server-time", "--local-timezone", "UTC"] } },
    ])
  })

  test("names a single server object from the Name field", () => {
    expect(parseMcpJson(`{ "command": "npx", "args": ["-y", "x"] }`, "tools")).toEqual([
      { name: "tools", config: { type: "local", command: ["npx", "-y", "x"] } },
    ])
    expect(parseMcpJson(`{ "url": "https://x.dev/mcp" }`, "")).toBe("name")
  })

  test("explains what is wrong", () => {
    expect(parseMcpJson("  ", "")).toBe("empty")
    expect(parseMcpJson("{ nope", "")).toBe("json")
    expect(parseMcpJson(`{ "mcpServers": { "a": { "foo": 1 } } }`, "")).toBe("servers")
    expect(parseMcpJson(`{ "mcpServers": { "my server": { "command": "x" } } }`, "")).toBe("name")
  })
})
