import { createMemo, createResource, type Accessor, type Component } from "solid-js"
import { Select } from "@opencode/ui/select"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection } from "@/runtime/server/registry"
import { useServerCtx } from "@/runtime/server/runtime"
import { SettingsRow } from "@/settings/row"
import { showToast } from "@/shell/notifications/toast"

const AUTOMATIC = "random"
const OFF = "off"

/** The server's web search provider: automatic failover, one pinned provider, or off. Saved to global config. */
export function createWebSearchController(server: Accessor<ServerConnection.Any>) {
  const language = useLanguage()
  const serverCtx = useServerCtx(server)

  const [state, actions] = createResource(
    () => ServerConnection.key(server()),
    async () => {
      const context = serverCtx()
      const [entries, providers] = await Promise.all([
        context.sdk.api.config.get().catch(() => []),
        context.sdk.api.websearch.providers().catch(() => ({ data: [] as Array<{ id: string; name: string }> })),
      ])
      const boundary = entries.findIndex((entry) => entry.type === "directory")
      const selection = (boundary === -1 ? entries : entries.slice(0, boundary))
        .flatMap((entry) => (entry.type === "document" && entry.info.websearch !== undefined ? [entry.info.websearch] : []))
        .at(-1)
      const current = selection === false ? OFF : (selection?.provider ?? AUTOMATIC)
      return { providers: providers.data, current }
    },
    { initialValue: { providers: [], current: AUTOMATIC } },
  )

  return {
    providers: () => state.latest.providers,
    current: () => state.latest.current,
    select: (value: string) => {
      if (value === state.latest.current) return
      const previous = state.latest
      actions.mutate({ ...previous, current: value })
      void serverCtx()
        .sdk.api.config.update({ websearch: value === OFF ? false : { provider: value } })
        .catch((error: unknown) => {
          actions.mutate(previous)
          showToast({
            variant: "error",
            title: language.t("common.requestFailed"),
            description: error instanceof Error ? error.message : language.t("common.requestFailed"),
          })
        })
    },
  }
}

export const WebSearchSetting: Component<{ controller: ReturnType<typeof createWebSearchController> }> = (props) => {
  const language = useLanguage()
  const options = createMemo(() => [
    { value: AUTOMATIC, label: language.t("settings.server.preferences.websearch.automatic") },
    ...props.controller.providers().map((provider) => ({ value: provider.id, label: provider.name })),
    { value: OFF, label: language.t("settings.server.preferences.websearch.off") },
  ])

  return (
    <SettingsRow
      title={language.t("settings.server.preferences.websearch.title")}
      description={language.t("settings.server.preferences.websearch.description")}
    >
      <Select
        data-action="settings-websearch"
        options={options()}
        current={options().find((option) => option.value === props.controller.current()) ?? options()[0]}
        placement="bottom-end"
        gutter={6}
        value={(option) => option.value}
        label={(option) => option.label}
        onSelect={(option) => option && props.controller.select(option.value)}
      />
    </SettingsRow>
  )
}
