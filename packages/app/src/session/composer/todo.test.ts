import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { sessionTodos, todosOpen } from "./todo"

const write = (id: string, todos: unknown, status: "completed" | "running" = "completed") =>
  ({
    id,
    sessionID: "ses_1",
    type: "assistant",
    time: { created: 1 },
    content: [
      {
        type: "tool",
        id: `call_${id}`,
        name: "todowrite",
        state:
          status === "completed"
            ? { status, input: { todos }, content: [{ type: "text", text: "" }] }
            : { status, input: { todos } },
        time: { created: 1 },
      },
    ],
  }) as unknown as SessionMessageInfo

const user = (id: string) =>
  ({ id, sessionID: "ses_1", type: "user", time: { created: 1 } }) as unknown as SessionMessageInfo

describe("sessionTodos", () => {
  test("uses the latest completed todowrite call", () => {
    const messages = [
      write("msg_1", [{ content: "Old", status: "pending" }]),
      user("msg_2"),
      write("msg_3", [
        { content: "Read code", status: "completed" },
        { content: "Fix bug", status: "in_progress" },
        { content: "", status: "pending" },
        { content: "Odd status", status: "later" },
      ]),
      write("msg_4", [{ content: "Still running", status: "pending" }], "running"),
    ]
    expect(sessionTodos(messages)).toEqual({
      todos: [
        { content: "Read code", status: "completed" },
        { content: "Fix bug", status: "in_progress" },
        { content: "Odd status", status: "pending" },
      ],
      latest: true,
    })
  })

  test("ignores calls after the revert boundary", () => {
    const messages = [
      write("msg_1", [{ content: "Kept", status: "pending" }]),
      user("msg_2"),
      write("msg_3", [{ content: "Reverted", status: "pending" }]),
    ]
    expect(sessionTodos(messages, "msg_2")).toEqual({ todos: [{ content: "Kept", status: "pending" }], latest: true })
    expect(sessionTodos([])).toEqual({ todos: [], latest: false })
  })

  test("a user message after the call ends the latest turn", () => {
    const messages = [write("msg_1", [{ content: "Done", status: "completed" }]), user("msg_2")]
    expect(sessionTodos(messages)).toEqual({ todos: [{ content: "Done", status: "completed" }], latest: false })
  })

  test("a list is open until every item is completed or cancelled", () => {
    expect(todosOpen([{ content: "a", status: "in_progress" }])).toBe(true)
    expect(
      todosOpen([
        { content: "a", status: "completed" },
        { content: "b", status: "cancelled" },
      ]),
    ).toBe(false)
    expect(todosOpen([])).toBe(false)
  })
})
