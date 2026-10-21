import { lazy, onCleanup, Suspense } from "solid-js"
import { Command, MenuItem, onIdle, Panel, type PanelTab, type Setup } from "../sdk"
import type AgentBrowser from "./index"

const setup: Setup<typeof AgentBrowser> = (ctx) => {
  const AgentBrowserPanel = lazy(() => import("./panel"))
  onCleanup(onIdle(() => void AgentBrowserPanel.preload()))

  const open = () => {
    const session = ctx.sessions.current()
    if (session) ctx.layout.open(`${ctx.id}:main`, session, { tab: "select" })
  }

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
        <AgentBrowserPanel session={props.session} t={ctx.t} />
      </Suspense>
    ),
  })
}

export default setup
