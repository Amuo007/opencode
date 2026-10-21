import { Show, createMemo, createResource, createSignal, type Accessor, type Component } from "solid-js"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Select } from "@opencode/ui/select"
import { TextField } from "@opencode/ui/text-field"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection } from "@/runtime/server/registry"
import { useServerCtx } from "@/runtime/server/runtime"
import { SettingsRow } from "@/settings/row"
import { showToast } from "@/shell/notifications/toast"

const AUTOMATIC = "random"
const OFF = "off"
// Providers that accept an API key; the built-in provider needs none.
const KEYED = ["brave", "tavily", "exa", "firecrawl", "parallel", "tinyfish"]

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
    saveKey: (integrationID: string, key: string) =>
      serverCtx().sdk.api.integration.connect.key({ integrationID, key }),
    savedKeys: (integrationID: string) =>
      serverCtx()
        .sdk.api.integration.get({ integrationID })
        .then((result) => result.data.connections.flatMap((item) => (item.type === "credential" ? [item.id] : [])))
        .catch(() => [] as string[]),
    removeKeys: (ids: readonly string[]) =>
      Promise.all(ids.map((credentialID) => serverCtx().sdk.api.credential.remove({ credentialID }))),
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

function DialogWebSearchKey(props: { controller: ReturnType<typeof createWebSearchController> }) {
  const dialog = useDialog()
  const language = useLanguage()
  const providers = createMemo(() => props.controller.providers().filter((provider) => KEYED.includes(provider.id)))
  const [provider, setProvider] = createSignal(providers()[0]?.id ?? "brave")
  const [key, setKey] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const [saved, { refetch }] = createResource(provider, (id) => props.controller.savedKeys(id), { initialValue: [] })
  const name = () => providers().find((item) => item.id === provider())?.name ?? provider()

  const remove = async () => {
    try {
      await props.controller.removeKeys(saved.latest)
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.server.preferences.websearch.key.removed", { provider: name() }),
      })
      void refetch()
    } catch (error) {
      showToast({
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    if (!key().trim() || saving()) return
    setSaving(true)
    try {
      const previous = saved.latest
      await props.controller.saveKey(provider(), key().trim())
      await props.controller.removeKeys(previous)
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.server.preferences.websearch.key.saved", { provider: name() }),
      })
    } catch (error) {
      showToast({
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup
          title={language.t("settings.server.preferences.websearch.key.title")}
          description={language.t("settings.server.preferences.websearch.key.description")}
        />
      </DialogHeader>
      <form onSubmit={save} class="flex flex-col gap-4 px-5 pb-2 min-w-[min(440px,90vw)]">
        <Select
          options={providers()}
          current={providers().find((item) => item.id === provider())}
          value={(item) => item.id}
          label={(item) => item.name}
          onSelect={(item) => item && setProvider(item.id)}
        />
        <Show when={saved.latest.length > 0}>
          <div class="flex items-center justify-between gap-3 text-13-regular text-v2-text-text-muted">
            <span>{language.t("settings.server.preferences.websearch.key.connected", { provider: name() })}</span>
            <Button type="button" size="small" variant="ghost" class="shrink-0" onClick={() => void remove()}>
              {language.t("settings.server.preferences.websearch.key.remove")}
            </Button>
          </div>
        </Show>
        <TextField
          autofocus
          type="password"
          label={language.t("settings.server.preferences.websearch.key.label")}
          placeholder="API key"
          value={key()}
          onChange={setKey}
        />
        <DialogFooter>
          <Button type="button" variant="neutral" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" variant="submit" disabled={saving() || !key().trim()}>
            {language.t("settings.server.preferences.websearch.key.save")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

export const WebSearchSetting: Component<{ controller: ReturnType<typeof createWebSearchController> }> = (props) => {
  const language = useLanguage()
  const dialog = useDialog()
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
      <Button
        type="button"
        size="small"
        variant="ghost"
        onClick={() => void dialog.show(() => <DialogWebSearchKey controller={props.controller} />)}
      >
        {language.t("settings.server.preferences.websearch.key.button")}
      </Button>
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
