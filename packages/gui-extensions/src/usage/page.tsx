import type { SessionStatsInfo } from "@opencode/client/promise"
import { createMemo, createResource, createSignal, For, Show, type Accessor } from "solid-js"
import type { ServerRef } from "../sdk"

type Range = "today" | "week" | "month" | "all"
const RANGES: readonly Range[] = ["today", "week", "month", "all"]
const DAY = 24 * 60 * 60 * 1000

const since = (range: Range) => {
  if (range === "all") return undefined
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return start.getTime() - (range === "week" ? 6 : range === "month" ? 29 : 0) * DAY
}

/** Usage totals from the server's session statistics, for a chosen range. */
export default function UsagePage(props: {
  server: Accessor<ServerRef | undefined>
  t: (key: string, params?: Record<string, string | number>) => string
  locale: Accessor<string>
}) {
  const [range, setRange] = createSignal<Range>("week")
  const [stats] = createResource(
    () => ({ server: props.server(), range: range() }),
    async (input): Promise<SessionStatsInfo | undefined> => {
      if (!input.server) return undefined
      return input.server.client.session.stats({
        from: since(input.range),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        tools: "summary",
      })
    },
  )

  const number = (value: number) => new Intl.NumberFormat(props.locale(), { notation: "compact" }).format(value)
  const money = (value: number) =>
    new Intl.NumberFormat(props.locale(), { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
      value,
    )

  // The same model reported with and without a variant is one row.
  const models = createMemo(() => {
    const rows = new Map<string, { name: string; steps: number; input: number; output: number; cost: number }>()
    for (const item of stats()?.models ?? []) {
      const name = `${item.model.providerID}/${item.model.id}`
      const row = rows.get(name) ?? { name, steps: 0, input: 0, output: 0, cost: 0 }
      row.steps += item.steps
      row.input += item.tokens.input
      row.output += item.tokens.output + item.tokens.reasoning
      row.cost += item.cost
      rows.set(name, row)
    }
    return [...rows.values()].toSorted((a, b) => b.steps - a.steps)
  })

  const toolTotals = () => {
    const tools = stats.latest?.tools
    return tools && "totals" in tools ? tools.totals : { calls: 0, failed: 0 }
  }

  // One bar per day of the range, including days without activity (the last 60 for "all time").
  const activity = createMemo(() => {
    const steps = new Map((stats()?.activity ?? []).map((day) => [day.date, day.steps]))
    const first = stats()?.activity[0]?.date
    const count =
      range() === "week"
        ? 7
        : range() === "month"
          ? 30
          : range() === "all" && first
            ? Math.min(60, Math.round((Date.now() - new Date(`${first}T00:00:00`).getTime()) / DAY) + 1)
            : 0
    return Array.from({ length: count }, (_, index) => {
      const day = new Date(Date.now() - (count - 1 - index) * DAY)
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
      return { date, steps: steps.get(date) ?? 0 }
    })
  })
  const peak = createMemo(() => Math.max(1, ...activity().map((day) => day.steps)))

  const Card = (card: { label: string; value: string; note?: string }) => (
    <div class="flex flex-col gap-1 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-2.5">
      <span class="text-12-regular text-v2-text-text-muted">{card.label}</span>
      <span class="text-20-medium text-v2-text-text-base tabular-nums">{card.value}</span>
      <Show when={card.note}>
        <span class="text-11-regular text-v2-text-text-muted">{card.note}</span>
      </Show>
    </div>
  )

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex flex-col gap-1">
            <h2 class="settings-tab-title">{props.t("title")}</h2>
            <span class="text-11-regular text-v2-text-text-muted">{props.t("description")}</span>
          </div>
          <div class="flex gap-1 rounded-lg bg-v2-background-bg-layer-01 p-0.5">
            <For each={RANGES}>
              {(item) => (
                <button
                  type="button"
                  class="rounded-md px-2.5 py-1 text-12-medium text-v2-text-text-muted hover:text-v2-text-text-base"
                  classList={{ "bg-v2-background-bg-layer-03 text-v2-text-text-base": range() === item }}
                  onClick={() => setRange(item)}
                >
                  {props.t(`range.${item}`)}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>

      <div class="settings-tab-body settings-tab-body--sectioned">
        <Show
          when={!stats.error}
          fallback={<div class="text-13-regular text-v2-text-text-muted">{props.t("error")}</div>}
        >
          <Show
            when={stats.latest && stats.latest.steps > 0 && stats.latest}
            fallback={
              <div class="text-13-regular text-v2-text-text-muted">{stats.loading ? "" : props.t("empty")}</div>
            }
          >
            {(current) => (
              <div class="flex flex-col gap-6">
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Card label={props.t("stat.sessions")} value={number(current().sessions)} />
                  <Card label={props.t("stat.prompts")} value={number(current().prompts)} />
                  <Card label={props.t("stat.steps")} value={number(current().steps)} />
                  <Card
                    label={props.t("stat.tools")}
                    value={number(toolTotals().calls)}
                    note={toolTotals().failed ? props.t("stat.toolsFailed", { count: toolTotals().failed }) : undefined}
                  />
                  <Card label={props.t("stat.input")} value={number(current().tokens.input)} />
                  <Card label={props.t("stat.output")} value={number(current().tokens.output)} />
                  <Card label={props.t("stat.reasoning")} value={number(current().tokens.reasoning)} />
                  <Card label={props.t("stat.cache")} value={number(current().tokens.cache.read)} />
                  <Card label={props.t("stat.cost")} value={money(current().cost)} />
                  <Card
                    label={props.t("stat.days")}
                    value={number(current().activeDays)}
                    note={current().streak > 1 ? props.t("stat.streak", { count: current().streak }) : undefined}
                  />
                </div>

                <Show when={activity().length > 1}>
                  <div class="flex flex-col gap-2">
                    <span class="text-13-medium text-v2-text-text-base">{props.t("activity.title")}</span>
                    <div class="flex h-24 items-end justify-between gap-1 rounded-lg border border-v2-border-border-muted px-2 pt-2">
                      <For each={activity()}>
                        {(day) => (
                          <div
                            class="max-w-6 flex-1 rounded-t-sm hover:bg-v2-text-text-muted"
                            classList={{
                              "bg-v2-border-border-strong": day.steps > 0,
                              "bg-v2-border-border-muted": day.steps === 0,
                            }}
                            style={{ height: day.steps > 0 ? `${Math.max(6, (day.steps / peak()) * 100)}%` : "2px" }}
                            title={`${day.date}: ${day.steps}`}
                          />
                        )}
                      </For>
                    </div>
                    <div class="flex justify-between text-11-regular text-v2-text-text-muted">
                      <span>{activity()[0]?.date}</span>
                      <span>{activity().at(-1)?.date}</span>
                    </div>
                  </div>
                </Show>

                <div class="flex flex-col gap-2">
                  <span class="text-13-medium text-v2-text-text-base">{props.t("models.title")}</span>
                  <div class="flex flex-col divide-y divide-v2-border-border-muted rounded-lg border border-v2-border-border-muted">
                    <For each={models()}>
                      {(row) => (
                        <div class="flex items-center justify-between gap-3 px-3 py-2">
                          <span class="truncate text-13-regular text-v2-text-text-base">{row.name}</span>
                          <span class="shrink-0 text-12-regular text-v2-text-text-muted tabular-nums">
                            {props.t(row.steps === 1 ? "models.call" : "models.calls", { count: number(row.steps) })} ·{" "}
                            {number(row.input)} in · {number(row.output)} out{row.cost ? ` · ${money(row.cost)}` : ""}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </div>
            )}
          </Show>
        </Show>
      </div>
    </>
  )
}
