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

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const strings = (value: unknown) => {
  if (!record(value)) return undefined
  const entries = Object.entries(value).flatMap(([key, item]) =>
    typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? [[key, String(item)]] : [],
  )
  return entries.length ? Object.fromEntries(entries) : undefined
}

// One server entry in any of the common formats: { command, args, env } (Claude Desktop, Cursor, VS Code),
// { url, headers } or { type: "http" | "sse", url } for remote servers, and OpenCode's own { type, command: [...] }.
function serverConfig(value: unknown): McpServerConfig | undefined {
  if (!record(value)) return undefined
  const url = [value.url, value.serverUrl, value.httpUrl].find((item) => typeof item === "string")
  if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) {
    const headers = strings(value.headers)
    return { type: "remote", url: url.trim(), ...(headers ? { headers } : {}) }
  }
  const args = Array.isArray(value.args) ? value.args.filter((item) => typeof item === "string") : []
  const command = Array.isArray(value.command)
    ? value.command.filter((item) => typeof item === "string")
    : typeof value.command === "string" && value.command.trim()
      ? [...(args.length ? [value.command.trim()] : parseCommand(value.command)), ...args]
      : []
  if (!command.length) return undefined
  const environment = strings(value.env) ?? strings(value.environment)
  return { type: "local", command, ...(environment ? { environment } : {}) }
}

/**
 * Reads the MCP configuration snippet a server's README gives: `{ "mcpServers": { ... } }` (Claude Desktop, Cursor),
 * `{ "servers": { ... } }` (VS Code), OpenCode's `{ "mcp": { ... } }`, a bare map of servers, a single `"name": { ... }`
 * entry without the outer braces, or one server object named by `name`.
 */
export function parseMcpJson(text: string, name: string): Array<{ name: string; config: McpServerConfig }> | string {
  const source = text.trim()
  if (!source) return "empty"
  const parsed = (() => {
    for (const candidate of [source, `{${source.replace(/,\s*$/, "")}}`]) {
      try {
        return JSON.parse(candidate) as unknown
      } catch {}
    }
  })()
  if (!record(parsed)) return "json"
  const single = serverConfig(parsed)
  if (single) return validName(name.trim()) ? [{ name: name.trim(), config: single }] : "name"
  const mcp = record(parsed.mcp) ? (record(parsed.mcp.servers) ? parsed.mcp.servers : parsed.mcp) : undefined
  const map = [parsed.mcpServers, parsed.servers, mcp, parsed.context_servers, parsed].find(record) ?? {}
  const servers = Object.entries(map).flatMap(([key, value]) => {
    const config = serverConfig(value)
    return config ? [{ name: key, config }] : []
  })
  if (!servers.length) return "servers"
  if (servers.some((server) => !validName(server.name))) return "name"
  return servers
}

export function DialogAddMcpServer(props: { onSaved: () => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [saving, setSaving] = createSignal(false)
  const [form, setForm] = createStore({
    name: "",
    type: "local" as "local" | "remote" | "json",
    command: "",
    url: "",
    environment: "",
    headers: "",
    json: "",
    err: {} as { name?: string; command?: string; url?: string; json?: string },
  })

  // The servers to add, or false after showing what is wrong.
  const servers = (): Array<{ name: string; config: McpServerConfig }> | false => {
    const name = form.name.trim()
    if (form.type === "json") {
      const result = parseMcpJson(form.json, name)
      if (typeof result !== "string") {
        setForm("err", {})
        return result
      }
      setForm("err", { json: language.t(`settings.extensions.mcp.add.json.${result}`) })
      return false
    }
    const config = buildConfig({ ...form, type: form.type === "local" ? "local" : "remote" })
    const nameError = validName(name) ? undefined : language.t("settings.extensions.mcp.add.name.invalid")
    setForm("err", {
      name: nameError,
      command: config === "command" ? language.t("settings.extensions.mcp.add.command.invalid") : undefined,
      url: config === "url" ? language.t("settings.extensions.mcp.add.url.invalid") : undefined,
    })
    if (nameError || typeof config === "string") return false
    return [{ name, config }]
  }

  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    if (saving()) return
    const added = servers()
    if (!added) return
    setSaving(true)
    try {
      await serverSdk.api.config.update({ mcp: Object.fromEntries(added.map((item) => [item.name, item.config])) })
      for (const item of added)
        await serverSdk.api.mcp.add({ server: item.name, config: item.config }).catch(() => undefined)
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.extensions.mcp.add.saved", { name: added.map((item) => item.name).join(", ") }),
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
            if (value === "local" || value === "remote" || value === "json") setForm("type", value)
          }}
        >
          <Tabs.List>
            <Tabs.Trigger value="local">{language.t("settings.extensions.mcp.add.local")}</Tabs.Trigger>
            <Tabs.Trigger value="remote">{language.t("settings.extensions.mcp.add.remote")}</Tabs.Trigger>
            <Tabs.Trigger value="json">{language.t("settings.extensions.mcp.add.json")}</Tabs.Trigger>
          </Tabs.List>
        </Tabs>
        <Show when={form.type === "json"}>
          <TextField
            multiline
            label={language.t("settings.extensions.mcp.add.json.label")}
            description={language.t("settings.extensions.mcp.add.json.description")}
            placeholder={'{ "mcpServers": { "github": { "command": "npx", "args": ["-y", "…"], "env": { … } } } }'}
            class="font-mono"
            value={form.json}
            onChange={(value) => setForm({ json: value, err: { ...form.err, json: undefined } })}
            validationState={form.err.json ? "invalid" : undefined}
            error={form.err.json}
          />
        </Show>
        <Show when={form.type === "remote"}>
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
        </Show>
        <Show when={form.type === "local"}>
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
