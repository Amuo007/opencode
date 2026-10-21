import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { formatElapsed, inputField, inputLines, sessionActivity } from "./activity"

const user = (created: number) =>
  ({
    type: "user",
    id: "msg_user",
    time: { created },
    text: "build it",
    files: [],
    agents: [],
  }) as unknown as SessionMessageInfo

const assistant = (content: unknown[], time: Record<string, number> = { created: 100 }) =>
  ({
    type: "assistant",
    id: "msg_assistant",
    agent: "build",
    model: { id: "m", providerID: "p" },
    time,
    content,
  }) as unknown as SessionMessageInfo

const tool = (name: string, state: unknown, time: Record<string, number> = { created: 200 }) => ({
  type: "tool",
  id: `call_${name}`,
  name,
  state,
  time,
})

describe("inputField", () => {
  test("reads a finished field from streaming JSON", () => {
    expect(inputField('{"path": "/repo/src/app.js", "content": "con', "path")).toBe("/repo/src/app.js")
  })

  test("ignores a field whose string has not closed yet", () => {
    expect(inputField('{"path": "/repo/sr', "path")).toBeUndefined()
  })

  test("reads parsed input", () => {
    expect(inputField({ command: "npm test" }, "command")).toBe("npm test")
  })
})

describe("inputLines", () => {
  test("counts escaped newlines while the content streams", () => {
    expect(inputLines('{"path": "a.js", "content": "one\\ntwo\\nthr', "content")).toBe(3)
  })

  test("counts lines of parsed input", () => {
    expect(inputLines({ content: "a\nb" }, "content")).toBe(2)
  })
})

describe("sessionActivity", () => {
  test("waits on the model right after the user sends", () => {
    expect(sessionActivity([user(50)])).toEqual({ key: "session.activity.thinking", params: {}, since: 50 })
  })

  test("names the file being written with its lines so far", () => {
    const activity = sessionActivity([
      user(50),
      assistant([tool("write", { status: "streaming", input: '{"path": "/repo/app.js", "content": "a\\nb\\nc' })]),
    ])
    expect(activity).toEqual({ key: "session.activity.write", params: { value: "app.js" }, lines: 3, since: 200 })
  })

  test("falls back to a generic label before the file name arrives", () => {
    const activity = sessionActivity([assistant([tool("write", { status: "streaming", input: '{"content": "a' })])])
    expect(activity?.key).toBe("session.activity.write.unknown")
  })

  test("times a running command from when it started", () => {
    const activity = sessionActivity([
      assistant([
        tool("shell", { status: "running", input: { command: "npm test" }, metadata: {} }, { created: 200, ran: 260 }),
      ]),
    ])
    expect(activity).toEqual({ key: "session.activity.shell", params: { value: "npm test" }, since: 260 })
  })

  test("labels browser steps in plain words", () => {
    const open = sessionActivity([
      assistant([tool("chrome_open", { status: "running", input: { url: "http://localhost:8014/" }, metadata: {} })]),
    ])
    expect(open?.params).toEqual({ value: "localhost:8014" })
    const resize = sessionActivity([
      assistant([tool("chrome_resize", { status: "running", input: { preset: "phone" }, metadata: {} })]),
    ])
    expect(resize).toMatchObject({ key: "session.activity.browserResize", params: { value: "phone" } })
  })

  test("is thinking after the last step finished", () => {
    const activity = sessionActivity([
      assistant([
        tool(
          "read",
          { status: "completed", input: { path: "a" }, output: "", metadata: {} },
          { created: 200, completed: 300 },
        ),
      ]),
    ])
    expect(activity).toEqual({ key: "session.activity.thinking", params: {}, since: 300 })
  })

  test("is writing a reply while text streams", () => {
    expect(sessionActivity([assistant([{ type: "text", text: "Done" }])])?.key).toBe("session.activity.reply")
  })
})

test("formatElapsed", () => {
  expect(formatElapsed(8_400)).toBe("8s")
  expect(formatElapsed(65_000)).toBe("1m 05s")
  expect(formatElapsed(3_720_000)).toBe("1h 02m")
})
