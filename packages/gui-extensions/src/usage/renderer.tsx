import { lazy, onCleanup, Suspense } from "solid-js"
import { Command, onIdle, SettingsPage, type Setup } from "../sdk"
import type definition from "./index"

const setup: Setup<typeof definition> = (ctx) => {
  const Page = lazy(() => import("./page"))
  onCleanup(onIdle(() => void Page.preload()))

  // The routed session's server, or the first one the app lists.
  const server = () =>
    ctx.sessions.current()?.server ??
    ctx.servers
      .list()
      .map((id) => ctx.servers.get(id))
      .find((item) => item !== undefined)

  ctx.add(SettingsPage, {
    id: "usage",
    icon: "status",
    get title() {
      return ctx.t("title")
    },
    get entries() {
      return [{ id: "usage", title: ctx.t("title"), keywords: "tokens cost statistics stats activity models" }]
    },
    render: () => (
      <Suspense>
        <Page server={server} t={ctx.t} locale={() => ctx.locale.locale()} />
      </Suspense>
    ),
  })

  ctx.add(
    Command,
    (): Command => ({
      id: "open",
      title: ctx.t("command.open"),
      group: ctx.t("command.category"),
      section: "navigation",
      slash: { name: "usage" },
      run: () => ctx.layout.settings("usage"),
    }),
  )
}

export default setup
