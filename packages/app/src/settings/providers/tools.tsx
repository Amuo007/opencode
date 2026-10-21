import { For, createResource } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { Switch } from "@opencode/ui/switch"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { SettingsList } from "@/settings/list"
import { showToast } from "@/shell/notifications/toast"

// Tool groups by permission name. Switching one off adds a global deny rule for every resource, which removes its
// tools from the model, so small local models get a shorter prompt.
const GROUPS = ["chrome", "websearch", "webfetch", "memory", "terminal", "screenshot", "lsp", "notify"] as const

type Rule = { action?: string; resource?: string; effect?: string }

/** Switches for the agent's optional tool groups, saved to the global config. */
export function SettingsTools() {
  const language = useLanguage()
  const serverSdk = useServerSDK()

  const [disabled, { mutate }] = createResource(
    () => serverSdk.connection.status() === "connected",
    async () => {
      const entries = await serverSdk.api.config.get().catch(() => [])
      const boundary = entries.findIndex((entry) => entry.type === "directory")
      const rules = (boundary === -1 ? entries : entries.slice(0, boundary)).flatMap((entry) =>
        entry.type === "document" ? ((entry.info.permissions ?? []) as readonly Rule[]) : [],
      )
      return new Set(
        GROUPS.filter((group) => {
          const last = rules.findLast((rule) => rule.action === group)
          return last?.resource === "*" && last.effect === "deny"
        }),
      )
    },
    { initialValue: new Set<string>() },
  )

  const toggle = async (group: string, on: boolean) => {
    const previous = disabled.latest
    const next = new Set(previous)
    if (on) next.delete(group)
    else next.add(group)
    mutate(next)
    try {
      // The switch already shows the new state; reading the config back now could return it before the server
      // reloaded the file.
      await serverSdk.api.config.update({ tools: { [group]: on } })
    } catch (error) {
      mutate(previous)
      showToast({
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <div class="settings-section">
      <div class="flex flex-col gap-0.5">
        <span class="settings-extension-heading text-13-medium">{language.t("settings.extensions.tools.title")}</span>
        <span class="text-12-regular text-v2-text-text-muted">{language.t("settings.extensions.tools.hint")}</span>
      </div>
      <SettingsList variant="catalog">
        <For each={GROUPS}>
          {(group) => (
            <div class="settings-extension-row">
              <div class="settings-extension-lead min-w-0">
                <Icon name="settings-gear" class="text-v2-icon-icon-muted shrink-0" />
                <span class="flex flex-col min-w-0">
                  <span class="settings-extension-name truncate">
                    {language.t(`settings.extensions.tools.${group}` as "settings.extensions.tools.chrome")}
                  </span>
                  <span class="text-12-regular text-v2-text-text-muted truncate">
                    {language.t(
                      `settings.extensions.tools.${group}.description` as "settings.extensions.tools.chrome.description",
                    )}
                  </span>
                </span>
              </div>
              <Switch
                checked={!disabled.latest.has(group)}
                onChange={(checked) => void toggle(group, checked)}
                hideLabel
              >
                {language.t(`settings.extensions.tools.${group}` as "settings.extensions.tools.chrome")}
              </Switch>
            </div>
          )}
        </For>
      </SettingsList>
    </div>
  )
}
