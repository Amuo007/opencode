import { createEffect, lazy, onCleanup, Suspense } from "solid-js"
import { Command, MenuItem, onIdle, Panel, type PanelTab, type Setup } from "../sdk"
import type AgentBrowser from "./index"

const setup: Setup<typeof AgentBrowser> = (ctx) => {
  const AgentBrowserPanel = lazy(() => import("./panel"))
  onCleanup(onIdle(() => void AgentBrowserPanel.preload()))

  const open = () => {
    const session = ctx.sessions.current()
    if (session) ctx.layout.open(`${ctx.id}:main`, session, { tab: "select" })
  }

  // Opens the panel when the agent opens its browser or navigates it to another page in the routed session, like the
  // desktop's browser pane. Watches without screenshots. A session whose auto-opened panel the user closed is not
  // opened again; the set outlives the effect, which re-runs whenever the routed session object changes.
  const opened = new Set<string>()
  const dismissed = new Set<string>()
  createEffect(() => {
    const session = ctx.sessions.current()
    if (!session) return
    const key = `${ctx.id}:main`
    const state = { seen: undefined as { open: boolean; url: string } | undefined }
    const check = async () => {
      if (document.hidden) return
      const view = await session.server.client.browserView
        .get({ location: { directory: session.directory }, image: "false" })
        .then((result) => result.data)
        .catch(() => undefined)
      if (!view) return
      const closed = ctx.layout.state(key, session) === "closed"
      if (opened.has(session.key) && closed) dismissed.add(session.key)
      const moved = state.seen !== undefined && view.open && (!state.seen.open || view.url !== state.seen.url)
      if (moved && closed && !dismissed.has(session.key)) {
        ctx.layout.open(key, session, { tab: "select", background: true })
        opened.add(session.key)
      }
      state.seen = { open: view.open, url: view.url }
    }
    void check()
    const timer = setInterval(() => void check(), 3000)
    onCleanup(() => clearInterval(timer))
  })

  // One tab object for every session, so a session switch does not remount its trigger.
  const tab: PanelTab = {
    id: "main",
    get title() {
      return ctx.t("tab.title")
    },
    closable: "hover",
  }

  ctx.add(
    Command,
    (): Command => ({
      id: "open",
      title: ctx.t("command.open"),
      group: ctx.t("command.category"),
      section: "navigation",
      slash: { name: "browser" },
      enabled: !!ctx.sessions.current(),
      run: open,
    }),
  )

  ctx.add(MenuItem, (): MenuItem | undefined =>
    ctx.sessions.current()
      ? { menu: "session.panel", id: "open", title: ctx.t("tab.title"), icon: "outline-globe", order: 21, run: open }
      : undefined,
  )

  ctx.add(Panel, {
    id: "main",
    region: "side",
    list: (input) => (input.open.includes("main") ? [tab] : []),
    render: (props) => (
      <Suspense>
        <AgentBrowserPanel session={props.session} screen={props.screen} t={ctx.t} />
      </Suspense>
    ),
  })
}

export default setup
