import { For, Show, createMemo, createResource, createSignal } from "solid-js"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Select } from "@opencode/ui/select"
import { TextField } from "@opencode/ui/text-field"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { SettingsList } from "@/settings/list"
import { showToast } from "@/shell/notifications/toast"

type ProjectMemories = {
  directory: string
  entries: ReadonlyArray<{ name: string; description: string; type: string; content: string }>
}

const TYPES = ["user", "feedback", "project", "reference"] as const

/** Saves one memory for a chosen project, the same way the agent's memory_save tool does. */
function DialogAddMemory(props: { projects: readonly string[]; onSaved: () => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [project, setProject] = createSignal(props.projects[0] ?? "")
  const [type, setType] = createSignal<(typeof TYPES)[number]>("user")
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [content, setContent] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const ready = () => !!project() && !!name().trim() && !!description().trim() && !!content().trim()

  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    if (!ready() || saving()) return
    setSaving(true)
    try {
      await serverSdk.api.memory.save({
        location: { directory: project() },
        name: name(),
        description: description(),
        type: type(),
        content: content(),
      })
      dialog.close()
      props.onSaved()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.extensions.memory.saved", { name: name().trim() }),
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
          title={language.t("settings.extensions.memory.add.title")}
          description={language.t("settings.extensions.memory.add.description")}
        />
      </DialogHeader>
      <form onSubmit={save} class="flex flex-col gap-4 px-5 pb-2 min-w-[min(440px,90vw)]">
        <div class="flex items-center gap-2">
          <Select
            options={[...props.projects]}
            current={project()}
            label={(item) => item.split("/").filter(Boolean).at(-1) ?? item}
            onSelect={(item) => item && setProject(item)}
          />
          <Select
            options={[...TYPES]}
            current={type()}
            label={(item) =>
              language.t(`settings.extensions.memory.type.${item}` as "settings.extensions.memory.type.user")
            }
            onSelect={(item) => item && setType(item)}
          />
        </div>
        <TextField
          autofocus
          label={language.t("settings.extensions.skill.name")}
          placeholder="prefers-bun"
          value={name()}
          onChange={setName}
        />
        <TextField
          label={language.t("settings.extensions.memory.summary")}
          placeholder={language.t("settings.extensions.memory.summary.placeholder")}
          value={description()}
          onChange={setDescription}
        />
        <TextField
          multiline
          label={language.t("settings.extensions.memory.content")}
          placeholder={language.t("settings.extensions.memory.content.placeholder")}
          value={content()}
          onChange={setContent}
          class="min-h-28"
        />
        <DialogFooter>
          <Button type="button" variant="neutral" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" variant="submit" disabled={saving() || !ready()}>
            {language.t("settings.extensions.memory.add.save")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

/** Every project's saved agent memories, with each memory's content on demand and a delete button. */
export function SettingsMemories() {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const dialog = useDialog()
  const [open, setOpen] = createSignal<string>()
  const [projects] = createResource(
    () => serverSdk.connection.status() === "connected",
    () =>
      serverSdk.api.project
        .list()
        .then((items) => items.map((item) => item.canonical))
        .catch(() => [] as string[]),
    { initialValue: [] },
  )
  const projectList = createMemo(() => projects.latest ?? [])

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
        <div class="flex items-center gap-3">
          <span class="text-13-regular text-v2-text-text-muted">{language.t("settings.extensions.memory.hint")}</span>
          <Button
            type="button"
            size="small"
            variant="neutral"
            icon="plus-small"
            disabled={projectList().length === 0}
            onClick={() =>
              dialog.show(() => <DialogAddMemory projects={projectList()} onSaved={() => void refetch()} />)
            }
          >
            {language.t("settings.extensions.memory.add.button")}
          </Button>
        </div>
      </div>
      <Show
        when={(memories.latest ?? []).length > 0}
        fallback={
          <div class="text-13-regular text-v2-text-text-muted py-4">
            {language.t("settings.extensions.memory.empty")}
          </div>
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
