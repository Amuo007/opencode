import type {
  SessionMessageAssistantTool,
  SessionMessageInfo,
  SessionMessageToolStateCompleted,
} from "@opencode/client/promise"

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled"

export type Todo = {
  content: string
  status: TodoStatus
}

const statuses = new Set<unknown>(["pending", "in_progress", "completed", "cancelled"])

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function parseTodos(value: unknown): Todo[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!record(item) || typeof item.content !== "string" || !item.content) return []
    return [{ content: item.content, status: statuses.has(item.status) ? (item.status as TodoStatus) : "pending" }]
  })
}

/**
 * The current list is the input of the latest completed `todowrite` call before the revert boundary. `latest` is
 * true while no user message follows that call, so a finished list stays in view until the user replies.
 */
export function sessionTodos(
  messages: readonly SessionMessageInfo[],
  boundary?: string,
): { todos: Todo[]; latest: boolean } {
  const boundaryIndex = boundary ? messages.findIndex((message) => message.id === boundary) : -1
  const visible = messages.slice(0, boundaryIndex === -1 ? messages.length : boundaryIndex)
  let latest = true
  for (const message of visible.toReversed()) {
    if (message.type === "user") latest = false
    if (message.type !== "assistant") continue
    const tool = message.content.findLast(
      (item): item is SessionMessageAssistantTool & { state: SessionMessageToolStateCompleted } =>
        item.type === "tool" && item.name === "todowrite" && item.state.status === "completed",
    )
    if (tool) return { todos: parseTodos(tool.state.input.todos), latest }
  }
  return { todos: [], latest: false }
}

/** Whether any item still needs work. */
export const todosOpen = (todos: readonly Todo[]) =>
  todos.some((todo) => todo.status === "pending" || todo.status === "in_progress")
