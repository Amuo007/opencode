import type { BrowserViewInfo } from "@opencode/client/promise"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { createSignal, onCleanup, onMount, Show } from "solid-js"
import type { MountedSession } from "../sdk"

type Payload = Parameters<MountedSession["server"]["client"]["browserView"]["act"]>[0]["payload"]

const POLL_MS = 1000
// Keys sent as key presses; printable characters are typed as text.
const KEYS = new Set([
  "Enter",
  "Tab",
  "Escape",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
])

/** Shows the agent's headless browser page, refreshed every second, and forwards clicks, scrolling and typing. */
export default function AgentBrowserPanel(props: { session: MountedSession; t: (key: string) => string }) {
  const [view, setView] = createSignal<BrowserViewInfo>()
  const [address, setAddress] = createSignal("")
  const [editing, setEditing] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const location = () => ({ directory: props.session.directory })
  const client = () => props.session.server.client

  const show = (next: BrowserViewInfo) => {
    setView(next)
    if (!editing()) setAddress(next.url)
  }

  let polling = false
  const poll = async () => {
    if (polling || busy() || document.hidden) return
    polling = true
    try {
      show((await client().browserView.get({ location: location() })).data)
    } catch {
      // The server may be restarting; the next poll tries again.
    } finally {
      polling = false
    }
  }

  // Actions run one at a time, in order, so fast typing reaches the page as typed.
  let queue = Promise.resolve()
  let pending = 0
  const act = (payload: Payload) => {
    pending++
    setBusy(true)
    setError(undefined)
    queue = queue.then(async () => {
      try {
        show((await client().browserView.act({ location: location(), payload })).data)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        pending--
        if (pending === 0) setBusy(false)
      }
    })
    return queue
  }

  onMount(() => {
    void poll()
    const timer = setInterval(() => void poll(), POLL_MS)
    onCleanup(() => clearInterval(timer))
  })

  // Maps a point on the scaled screenshot to the page's CSS pixels.
  const point = (event: MouseEvent) => {
    const image = event.currentTarget as HTMLImageElement
    const rect = image.getBoundingClientRect()
    const current = view()
    if (!current) return { x: 0, y: 0 }
    return {
      x: Math.round(((event.clientX - rect.left) / rect.width) * current.width),
      y: Math.round(((event.clientY - rect.top) / rect.height) * current.height),
    }
  }

  let wheel = 0
  let wheelTimer: ReturnType<typeof setTimeout> | undefined
  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    wheel += event.deltaY
    const at = point(event)
    clearTimeout(wheelTimer)
    wheelTimer = setTimeout(() => {
      const deltaY = wheel
      wheel = 0
      if (deltaY) void act({ type: "scroll", ...at, deltaY })
    }, 120)
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (KEYS.has(event.key)) {
      event.preventDefault()
      void act({ type: "key", key: event.key })
      return
    }
    if (event.key.length === 1) {
      event.preventDefault()
      void act({ type: "type", text: event.key })
    }
  }

  const nav = (type: "back" | "forward" | "reload") => (
    <IconButton
      type="button"
      variant="ghost"
      icon={
        <Icon
          name={
            type === "back"
              ? "outline-arrow-left"
              : type === "forward"
                ? "outline-arrow-right"
                : "outline-rotate-clockwise"
          }
        />
      }
      aria-label={props.t(type)}
      disabled={!view()?.open || busy()}
      onClick={() => void act({ type })}
    />
  )

  return (
    <div class="flex h-full min-h-0 flex-1 flex-col">
      <form
        class="flex items-center gap-1 border-b border-v2-border-border-muted px-2 py-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          if (!address().trim()) return
          setEditing(false)
          void act({ type: "navigate", url: address() })
        }}
      >
        {nav("back")}
        {nav("forward")}
        {nav("reload")}
        <input
          class="min-w-0 flex-1 rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-01 px-2 py-1 text-13-regular text-v2-text-text-base outline-none focus:border-v2-border-border-strong"
          placeholder={props.t("address.placeholder")}
          value={address()}
          spellcheck={false}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onInput={(event) => setAddress(event.currentTarget.value)}
        />
        <Show when={view()?.open}>
          <span class="flex items-center gap-1 px-1 text-12-regular text-v2-text-text-muted">
            <span class="size-1.5 rounded-full bg-[#3fb950]" classList={{ "opacity-40": busy() }} />
            {props.t("live")}
          </span>
        </Show>
      </form>
      <Show when={error()}>
        <div class="px-3 py-1.5 text-12-regular text-v2-text-text-muted truncate" title={error()}>
          {error()}
        </div>
      </Show>
      <div class="relative min-h-0 flex-1 overflow-auto bg-v2-background-bg-deep p-2">
        <Show
          when={view()?.open && view()}
          fallback={
            <div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <Icon name="outline-globe" class="text-v2-icon-icon-muted" />
              <span class="text-13-medium text-v2-text-text-base">{props.t("empty.title")}</span>
              <span class="text-12-regular text-v2-text-text-muted">{props.t("empty.description")}</span>
            </div>
          }
        >
          {(current) => (
            <img
              tabindex="0"
              class="w-full cursor-pointer rounded-md shadow outline-none focus:ring-1 focus:ring-v2-border-border-strong"
              alt={props.t("screen.label")}
              title={current().title}
              src={`data:image/jpeg;base64,${current().image}`}
              draggable={false}
              onClick={(event) => {
                event.currentTarget.focus()
                void act({ type: "click", ...point(event) })
              }}
              onWheel={onWheel}
              onKeyDown={onKey}
              onPaste={(event) => {
                const text = event.clipboardData?.getData("text/plain")
                if (!text) return
                event.preventDefault()
                void act({ type: "type", text })
              }}
            />
          )}
        </Show>
      </div>
    </div>
  )
}
