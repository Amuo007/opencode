import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { TextShimmer } from "@opencode/ui/text-shimmer"
import { useLanguage } from "@/runtime/i18n/language"
import { formatElapsed, type Activity } from "./activity"

// A one-line "what is it doing right now" status above the composer while the session works, with how long the
// current step has taken, so a slow step reads as progress rather than a stuck session.
export function SessionActivityLine(props: { activity: Activity | undefined }) {
  return <Show when={props.activity}>{(activity) => <Line activity={activity()} />}</Show>
}

function Line(props: { activity: Activity }) {
  const language = useLanguage()
  const [now, setNow] = createSignal(Date.now())
  onMount(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })
  const label = () => language.t(props.activity.key as Parameters<typeof language.t>[0], props.activity.params)
  const lines = () =>
    props.activity.lines && props.activity.lines > 1
      ? language.t("session.activity.lines", { count: String(props.activity.lines) })
      : undefined

  return (
    <div
      data-component="session-activity"
      role="status"
      class="flex min-w-0 items-center gap-1.5 px-3 pb-2 text-12-regular text-v2-text-text-muted"
    >
      <span class="size-1.5 shrink-0 animate-pulse rounded-full bg-[#3fb950]" />
      <TextShimmer text={label()} class="min-w-0 truncate text-v2-text-text-base" />
      <Show when={lines()}>{(text) => <span class="shrink-0">· {text()}</span>}</Show>
      <span class="shrink-0 [font-variant-numeric:tabular-nums]">· {formatElapsed(now() - props.activity.since)}</span>
    </div>
  )
}
