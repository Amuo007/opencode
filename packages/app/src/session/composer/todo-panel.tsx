import { createSignal, For, Show } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { useLanguage } from "@/runtime/i18n/language"
import { todosOpen, type Todo } from "./todo"

// The agent's task list (its latest todowrite call), shown above the composer while any item is unfinished and,
// once finished, until the user's next message. Like the queue panel, it slides under the composer card so the two
// read as one surface.
export function SessionTodoPanel(props: { todos: readonly Todo[]; latest: boolean }) {
  const language = useLanguage()
  const [collapsed, setCollapsed] = createSignal(false)
  const done = () => props.todos.filter((todo) => todo.status === "completed").length
  const current = () => props.todos.find((todo) => todo.status === "in_progress")

  return (
    <Show when={todosOpen(props.todos) || (props.latest && props.todos.length > 0)}>
      <div
        data-component="session-todo-panel"
        class="relative z-0 -mb-3 rounded-xl bg-v2-background-bg-base px-1.5 pt-1 pb-[18px] shadow-[inset_0_0_0_0.5px_var(--v2-border-border-base)]"
      >
        <button
          type="button"
          class="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-v2-background-bg-layer-01"
          aria-expanded={!collapsed()}
          onClick={() => setCollapsed((value) => !value)}
        >
          <span class="shrink-0 text-[11px] font-[530] uppercase tracking-[0.05px] text-v2-text-text-muted [font-variant-numeric:tabular-nums]">
            {language.t("session.todo.title", { done: String(done()), total: String(props.todos.length) })}
          </span>
          <Show when={collapsed() && current()}>
            {(todo) => <span class="min-w-0 truncate text-12-regular text-v2-text-text-base">{todo().content}</span>}
          </Show>
          <Icon
            name="chevron-down"
            class="ml-auto shrink-0 text-v2-icon-icon-muted transition-transform"
            classList={{ "-rotate-90": collapsed() }}
          />
        </button>
        <Show when={!collapsed()}>
          <ul class="flex max-h-[164px] flex-col overflow-y-auto pb-0.5">
            <For each={props.todos}>
              {(todo) => (
                <li class="flex min-w-0 items-start gap-2 px-1.5 py-[3px] text-13-regular" data-status={todo.status}>
                  <span class="mt-[3px] flex size-3.5 shrink-0 items-center justify-center">
                    <Show
                      when={todo.status === "completed"}
                      fallback={
                        <span
                          class="size-3 rounded-full border"
                          classList={{
                            "border-v2-border-border-strong": todo.status === "pending",
                            "border-v2-border-border-base": todo.status === "cancelled",
                            "border-[#3fb950] bg-[#3fb950]/25": todo.status === "in_progress",
                          }}
                        />
                      }
                    >
                      <Icon name="check" class="text-v2-icon-icon-muted" />
                    </Show>
                  </span>
                  <span
                    class="min-w-0 break-words"
                    classList={{
                      "text-v2-text-text-base font-[530]": todo.status === "in_progress",
                      "text-v2-text-text-base": todo.status === "pending",
                      "text-v2-text-text-muted line-through": todo.status === "completed" || todo.status === "cancelled",
                    }}
                  >
                    {todo.content}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </Show>
  )
}
