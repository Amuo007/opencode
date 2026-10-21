import { For, Show, createResource, createSignal } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { SettingsList } from "@/settings/list"
import { showToast } from "@/shell/notifications/toast"

type ProjectMemories = {
  directory: string
  entries: ReadonlyArray<{ name: string; description: string; type: string; content: string }>
}

/** Every project's saved agent memories, with each memory's content on demand and a delete button. */
export function SettingsMemories() {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [open, setOpen] = createSignal<string>()

  const [memories, { refetch }] = createResource(
    () => serverSdk.connection.status() === "connected",
    async () => {
      const projects = await serverSdk.api.project.list().catch(() => [])
      const lists = await Promise.all(
        projects.map((project) =>
          serverSdk.api.memory
            .list({ location: { directory: project.canonical } })
            .then((result): ProjectMemories => ({ directory: project.canonical, entries: result.data.entries }))
            .catch((): ProjectMemories => ({ directory: project.canonical, entries: [] })),
        ),
      )
      return lists.filter((item) => item.entries.length > 0)
    },
    { initialValue: [] },
  )

  const remove = async (directory: string, name: string) => {
    try {
      await serverSdk.api.memory.remove({ name, location: { directory } })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.extensions.memory.removed", { name }),
      })
      void refetch()
    } catch (error) {
      showToast({
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <div class="settings-section">
      <div class="flex items-center justify-between">
        <span class="settings-extension-heading text-13-medium">{language.t("settings.extensions.memory.title")}</span>
        <span class="text-13-regular text-v2-text-text-muted">{language.t("settings.extensions.memory.hint")}</span>
      </div>
      <Show
        when={(memories.latest ?? []).length > 0}
        fallback={
          <div class="text-13-regular text-v2-text-text-muted py-4">{language.t("settings.extensions.memory.empty")}</div>
        }
      >
        <For each={memories.latest ?? []}>
          {(project) => (
            <div class="flex flex-col gap-1 pt-3">
              <span class="text-12-medium text-v2-text-text-muted truncate" title={project.directory}>
                {project.directory}
              </span>
              <SettingsList variant="catalog">
                <For each={project.entries}>
                  {(entry) => {
                    const key = () => `${project.directory}:${entry.name}`
                    return (
                      <div class="flex flex-col">
                        <div class="settings-extension-row">
                          <button
                            type="button"
                            class="settings-extension-lead text-left min-w-0"
                            onClick={() => setOpen(open() === key() ? undefined : key())}
                          >
                            <Icon name="bullet-list" class="text-v2-icon-icon-muted shrink-0" />
                            <span class="flex flex-col min-w-0">
                              <span class="settings-extension-name truncate">
                                {entry.name}
                                <Show when={entry.type}>
                                  <span class="text-11-regular text-v2-text-text-muted ml-2">{entry.type}</span>
                                </Show>
                              </span>
                              <span class="text-12-regular text-v2-text-text-muted truncate">{entry.description}</span>
                            </span>
                          </button>
                          <IconButton
                            type="button"
                            icon={<Icon name="trash" />}
                            variant="ghost"
                            aria-label={language.t("settings.extensions.memory.remove", { name: entry.name })}
                            onClick={() => void remove(project.directory, entry.name)}
                          />
                        </div>
                        <Show when={open() === key()}>
                          <pre class="text-12-regular text-v2-text-text-base whitespace-pre-wrap px-3 pb-3 font-sans">
                            {entry.content}
                          </pre>
                        </Show>
                      </div>
                    )
                  }}
                </For>
              </SettingsList>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}
