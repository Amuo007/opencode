import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Tabs } from "@opencode/ui/tabs"
import { TextField } from "@opencode/ui/text-field"
import { Show, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { showToast } from "@/shell/notifications/toast"

export type McpServerConfig =
  | { type: "local"; command: string[]; environment?: Record<string, string> }
  | { type: "remote"; url: string; headers?: Record<string, string> }

/** Splits a command line into arguments, honouring single and double quotes. */
export function parseCommand(input: string) {
  return [...input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((match) => match[1] ?? match[2] ?? match[3] ?? "")
}

/** Reads `KEY=value` or `Key: value` lines into a record, skipping blanks and comments. */
export function parsePairs(input: string, separator: "=" | ":") {
  const entries = input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes(separator))
    .map((line) => {
      const index = line.indexOf(separator)
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()] as const
    })
    .filter(([key]) => key)
  return entries.length ? Object.fromEntries(entries) : undefined
}

export const validName = (name: string) => /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)

export function buildConfig(form: {
  type: "local" | "remote"
  command: string
  url: string
  environment: string
  headers: string
}): McpServerConfig | string {
  if (form.type === "local") {
    const command = parseCommand(form.command)
    if (!command.length) return "command"
    const environment = parsePairs(form.environment, "=")
    return { type: "local", command, ...(environment ? { environment } : {}) }
  }
  const url = form.url.trim()
  if (!/^https?:\/\//i.test(url)) return "url"
  const headers = parsePairs(form.headers, ":")
  return { type: "remote", url, ...(headers ? { headers } : {}) }
}

export function DialogAddMcpServer(props: { onSaved: () => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [saving, setSaving] = createSignal(false)
  const [form, setForm] = createStore({
    name: "",
    type: "local" as "local" | "remote",
    command: "",
    url: "",
    environment: "",
    headers: "",
    err: {} as { name?: string; command?: string; url?: string },
  })

  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    if (saving()) return
    const name = form.name.trim()
    const config = buildConfig(form)
    const nameError = validName(name) ? undefined : language.t("settings.extensions.mcp.add.name.invalid")
    setForm("err", {
      name: nameError,
      command: config === "command" ? language.t("settings.extensions.mcp.add.command.invalid") : undefined,
      url: config === "url" ? language.t("settings.extensions.mcp.add.url.invalid") : undefined,
    })
    if (nameError || typeof config === "string") return
    setSaving(true)
    try {
      await serverSdk.api.config.update({ mcp: { [name]: config } })
      await serverSdk.api.mcp.add({ server: name, config }).catch(() => undefined)
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.extensions.mcp.add.saved", { name }),
      })
      props.onSaved()
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
          title={language.t("settings.extensions.mcp.add.title")}
          description={language.t("settings.extensions.mcp.add.description")}
        />
      </DialogHeader>
      <form onSubmit={save} class="flex flex-col gap-4 px-5 pb-2 min-w-[min(480px,90vw)]">
        <TextField
          autofocus
          label={language.t("settings.extensions.mcp.add.name")}
          placeholder="filesystem"
          value={form.name}
          onChange={(value) => setForm({ name: value, err: { ...form.err, name: undefined } })}
          validationState={form.err.name ? "invalid" : undefined}
          error={form.err.name}
        />
        <Tabs
          variant="pill"
          value={form.type}
          onChange={(value) => {
            if (value === "local" || value === "remote") setForm("type", value)
          }}
        >
          <Tabs.List>
            <Tabs.Trigger value="local">{language.t("settings.extensions.mcp.add.local")}</Tabs.Trigger>
            <Tabs.Trigger value="remote">{language.t("settings.extensions.mcp.add.remote")}</Tabs.Trigger>
          </Tabs.List>
        </Tabs>
        <Show
          when={form.type === "local"}
          fallback={
            <>
              <TextField
                label={language.t("settings.extensions.mcp.add.url")}
                placeholder="https://mcp.example.com/mcp"
                value={form.url}
                onChange={(value) => setForm({ url: value, err: { ...form.err, url: undefined } })}
                validationState={form.err.url ? "invalid" : undefined}
                error={form.err.url}
              />
              <TextField
                multiline
                label={language.t("settings.extensions.mcp.add.headers")}
                description={language.t("settings.extensions.mcp.add.headers.description")}
                placeholder="Authorization: Bearer …"
                value={form.headers}
                onChange={(value) => setForm("headers", value)}
              />
            </>
          }
        >
          <TextField
            label={language.t("settings.extensions.mcp.add.command")}
            description={language.t("settings.extensions.mcp.add.command.description")}
            placeholder="npx -y @modelcontextprotocol/server-filesystem ~/projects"
            value={form.command}
            onChange={(value) => setForm({ command: value, err: { ...form.err, command: undefined } })}
            validationState={form.err.command ? "invalid" : undefined}
            error={form.err.command}
          />
          <TextField
            multiline
            label={language.t("settings.extensions.mcp.add.environment")}
            description={language.t("settings.extensions.mcp.add.environment.description")}
            placeholder="API_KEY=…"
            value={form.environment}
            onChange={(value) => setForm("environment", value)}
          />
        </Show>
        <DialogFooter>
          <Button type="button" variant="neutral" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" variant="submit" disabled={saving()}>
            {language.t("settings.extensions.mcp.add.save")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
