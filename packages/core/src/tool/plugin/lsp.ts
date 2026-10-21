export * as LspTools from "./lsp.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import { ToolFailure } from "@opencode/ai"
import { ConfigLSP } from "@opencode/schema/config/lsp"
import { Effect, Schema } from "effect"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import { Config } from "../../config.js"
import { Permission } from "../../permission.js"

// Code intelligence through language servers: go to definition, references, hover, symbols and
// diagnostics. Servers are found on PATH (with npx fallbacks for TypeScript and Python) or set in
// the `lsp` config. After a successful edit, errors from an already running server for that file
// are appended to the edit result so the model sees type errors right away.

export const name = "lsp"

type ServerSpec = { id: string; extensions: string[]; commands: string[][]; env?: Record<string, string> }
type LspConfig = typeof ConfigLSP.Info.Type

export const defaults: ServerSpec[] = [
  {
    id: "typescript",
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
    commands: [
      ["typescript-language-server", "--stdio"],
      // npx brings its own TypeScript so projects without one installed still work.
      ["npx", "-y", "-p", "typescript", "-p", "typescript-language-server", "typescript-language-server", "--stdio"],
    ],
  },
  {
    id: "python",
    extensions: [".py", ".pyi"],
    commands: [
      ["pyright-langserver", "--stdio"],
      ["basedpyright-langserver", "--stdio"],
      ["pylsp"],
      ["npx", "-y", "-p", "pyright", "pyright-langserver", "--stdio"],
    ],
  },
  { id: "go", extensions: [".go"], commands: [["gopls"]] },
  { id: "rust", extensions: [".rs"], commands: [["rust-analyzer"]] },
  {
    id: "c",
    extensions: [".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh", ".hxx", ".m", ".mm"],
    commands: [["clangd"]],
  },
  { id: "swift", extensions: [".swift"], commands: [["sourcekit-lsp"]] },
  { id: "ruby", extensions: [".rb"], commands: [["solargraph", "stdio"], ["ruby-lsp"]] },
  { id: "lua", extensions: [".lua"], commands: [["lua-language-server"]] },
  { id: "zig", extensions: [".zig"], commands: [["zls"]] },
  { id: "php", extensions: [".php"], commands: [["intelephense", "--stdio"]] },
  { id: "csharp", extensions: [".cs"], commands: [["csharp-ls"]] },
  { id: "java", extensions: [".java"], commands: [["jdtls"]] },
  { id: "bash", extensions: [".sh", ".bash"], commands: [["bash-language-server", "start"]] },
  { id: "yaml", extensions: [".yaml", ".yml"], commands: [["yaml-language-server", "--stdio"]] },
]

const languageIds: Record<string, string> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascriptreact",
  ".py": "python",
  ".pyi": "python",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hh": "cpp",
  ".hxx": "cpp",
  ".m": "objective-c",
  ".mm": "objective-cpp",
  ".rs": "rust",
  ".rb": "ruby",
  ".cs": "csharp",
  ".sh": "shellscript",
  ".bash": "shellscript",
  ".yml": "yaml",
}
const languageId = (file: string) => {
  const extension = path.extname(file).toLowerCase()
  return languageIds[extension] ?? extension.slice(1)
}

export function onPath(command: string, env = process.env) {
  if (path.isAbsolute(command)) return existsSync(command)
  return (env.PATH ?? "").split(path.delimiter).some((dir) => dir && existsSync(path.join(dir, command)))
}

/** Picks the server for a file from config entries first, then the built-in list. */
export function resolveServer(file: string, config: LspConfig | undefined, has = onPath) {
  if (config === false) return undefined
  const extension = path.extname(file).toLowerCase()
  const configured = typeof config === "object" ? Object.entries(config) : []
  const disabled = new Set(configured.filter(([, entry]) => "disabled" in entry && entry.disabled === true).map(([id]) => id))
  const custom = configured.flatMap(([id, entry]): ServerSpec[] =>
    "command" in entry && entry.disabled !== true && (entry.extensions ?? []).includes(extension)
      ? [{ id, extensions: [...(entry.extensions ?? [])], commands: [[...entry.command]], env: entry.env ? { ...entry.env } : undefined }]
      : [],
  )
  return [...custom, ...defaults.filter((spec) => !disabled.has(spec.id) && spec.extensions.includes(extension))]
    .map((spec) => ({ ...spec, command: spec.commands.find((command) => has(command[0])) }))
    .find((spec): spec is ServerSpec & { command: string[] } => spec.command !== undefined)
}

/** Splits a stream of Content-Length framed JSON-RPC messages; returns the messages and the rest. */
export function decodeFrames(buffer: Buffer) {
  const messages: unknown[] = []
  let rest = buffer
  while (true) {
    const end = rest.indexOf("\r\n\r\n")
    if (end === -1) break
    const length = Number(rest.subarray(0, end).toString("ascii").match(/Content-Length:\s*(\d+)/i)?.[1])
    if (!Number.isFinite(length) || rest.length < end + 4 + length) break
    messages.push(JSON.parse(rest.subarray(end + 4, end + 4 + length).toString("utf8")))
    rest = rest.subarray(end + 4 + length)
  }
  return { messages, rest }
}

type Diagnostic = { range: Range; severity?: number; message: string; source?: string }
type Range = { start: { line: number; character: number }; end: { line: number; character: number } }

class Client {
  private id = 0
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private documents = new Map<string, { version: number; text: string }>()
  private waiters = new Map<string, Array<() => void>>()
  readonly diagnostics = new Map<string, Diagnostic[]>()
  ready: Promise<void>

  constructor(
    private child: ChildProcess,
    readonly root: string,
    readonly id_: string,
  ) {
    child.stdout?.on("data", (chunk: Buffer) => {
      const decoded = decodeFrames(Buffer.concat([this.buffer, chunk]))
      this.buffer = decoded.rest
      decoded.messages.forEach((message) => this.receive(message as Record<string, unknown>))
    })
    child.on("exit", () => this.pending.forEach((waiter) => waiter.reject(new Error("Language server exited"))))
    this.ready = this.request("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(root).href,
      workspaceFolders: [{ uri: pathToFileURL(root).href, name: path.basename(root) }],
      capabilities: {
        textDocument: {
          synchronization: { didSave: true, dynamicRegistration: false },
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { linkSupport: true },
          implementation: { linkSupport: true },
          references: {},
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          publishDiagnostics: { relatedInformation: false },
        },
        workspace: { symbol: {}, configuration: true, workspaceFolders: true },
      },
    }, 60_000).then(() => this.notify("initialized", {}))
  }

  get alive() {
    return this.child.exitCode === null && this.child.signalCode === null
  }

  private send(message: Record<string, unknown>) {
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }), "utf8")
    this.child.stdin?.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]))
  }

  private receive(message: Record<string, unknown>) {
    if (typeof message.id === "number" && !("method" in message)) {
      const waiter = this.pending.get(message.id)
      this.pending.delete(message.id)
      const error = message.error as { message?: string } | undefined
      if (error) waiter?.reject(new Error(error.message ?? "Language server error"))
      else waiter?.resolve(message.result)
      return
    }
    if (message.method === "textDocument/publishDiagnostics") {
      const params = message.params as { uri: string; diagnostics: Diagnostic[] }
      this.diagnostics.set(params.uri, params.diagnostics)
      this.waiters.get(params.uri)?.forEach((resolve) => resolve())
      this.waiters.delete(params.uri)
      return
    }
    // Answer server requests so servers that wait on them keep going.
    if ("id" in message && typeof message.method === "string") {
      const result =
        message.method === "workspace/configuration"
          ? ((message.params as { items?: unknown[] }).items ?? []).map(() => null)
          : message.method === "workspace/workspaceFolders"
            ? [{ uri: pathToFileURL(this.root).href, name: path.basename(this.root) }]
            : null
      this.send({ id: message.id, result })
    }
  }

  request(method: string, params: unknown, timeout = 30_000) {
    const id = ++this.id
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, timeout)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      this.send({ id, method, params })
    })
  }

  notify(method: string, params: unknown) {
    this.send({ method, params })
  }

  /** Opens or refreshes a file; resolves once fresh diagnostics arrive or after `wait` ms. */
  async sync(file: string, wait = 0) {
    await this.ready
    const uri = pathToFileURL(file).href
    const text = await readFile(file, "utf8")
    const current = this.documents.get(uri)
    if (current?.text === text) return uri
    const fresh = new Promise<void>((resolve) => {
      this.waiters.set(uri, [...(this.waiters.get(uri) ?? []), resolve])
      setTimeout(resolve, wait)
    })
    if (!current) {
      this.documents.set(uri, { version: 1, text })
      this.notify("textDocument/didOpen", { textDocument: { uri, languageId: languageId(file), version: 1, text } })
    }
    if (current) {
      const version = current.version + 1
      this.documents.set(uri, { version, text })
      this.notify("textDocument/didChange", { textDocument: { uri, version }, contentChanges: [{ text }] })
      this.notify("textDocument/didSave", { textDocument: { uri }, text })
    }
    if (wait > 0) await fresh
    return uri
  }

  async close() {
    await this.request("shutdown", null, 3000).catch(() => undefined)
    this.notify("exit", null)
    this.child.kill()
  }
}

const severities = ["", "error", "warning", "info", "hint"]
const symbolKinds = [
  "",
  "file",
  "module",
  "namespace",
  "package",
  "class",
  "method",
  "property",
  "field",
  "constructor",
  "enum",
  "interface",
  "function",
  "variable",
  "constant",
  "string",
  "number",
  "boolean",
  "array",
  "object",
  "key",
  "null",
  "enum member",
  "struct",
  "event",
  "operator",
  "type parameter",
]

export const formatDiagnostics = (file: string, diagnostics: Diagnostic[], limit = 50) =>
  diagnostics
    .toSorted((a, b) => (a.severity ?? 1) - (b.severity ?? 1) || a.range.start.line - b.range.start.line)
    .slice(0, limit)
    .map(
      (item) =>
        `${file}:${item.range.start.line + 1}:${item.range.start.character + 1} ${severities[item.severity ?? 1] ?? "error"}: ${item.message.replace(/\s+/g, " ")}${item.source ? ` (${item.source})` : ""}`,
    )
    .join("\n")

export const Input = Schema.Struct({
  operation: Schema.Literals([
    "definition",
    "references",
    "implementation",
    "hover",
    "symbols",
    "workspace_symbols",
    "diagnostics",
  ]).annotate({
    description:
      "definition / references / implementation / hover need path + line + (character or symbol); symbols lists a file's outline; workspace_symbols searches by query; diagnostics reports errors for a file",
  }),
  path: Schema.optionalKey(Schema.String).annotate({ description: "File path (absolute or relative to the project)" }),
  line: Schema.optionalKey(Schema.Int).annotate({ description: "1-based line number" }),
  character: Schema.optionalKey(Schema.Int).annotate({ description: "1-based column" }),
  symbol: Schema.optionalKey(Schema.String).annotate({
    description: "Identifier to target on that line, instead of an exact column",
  }),
  query: Schema.optionalKey(Schema.String).annotate({ description: "Search text for workspace_symbols" }),
})
export type Input = typeof Input.Type

export const Plugin = {
  id: "opencode.tool.lsp",
  effect: Effect.fn("LspTools.Plugin")(function* (ctx: Context) {
    const permission = yield* Permission.Service
    const config = yield* Config.Service
    const root = ctx.location.project.directory
    const clients = new Map<string, Promise<Client>>()
    yield* Effect.addFinalizer(() =>
      Effect.promise(() =>
        Promise.all([...clients.values()].map((client) => client.then((item) => item.close()).catch(() => undefined))),
      ),
    )

    const settings = () => Effect.runPromise(config.entries().pipe(Effect.map((entries) => Config.latest(entries, "lsp"))))

    const clientFor = async (file: string, start = true) => {
      const spec = resolveServer(file, await settings().catch(() => undefined))
      if (!spec) return undefined
      const existing = clients.get(spec.id)
      if (existing) {
        const client = await existing.catch(() => undefined)
        if (client?.alive) return client
        clients.delete(spec.id)
      }
      if (!start) return undefined
      const created = Promise.resolve().then(() => {
        const child = spawn(spec.command[0], spec.command.slice(1), {
          cwd: root,
          env: { ...process.env, ...spec.env },
          stdio: ["pipe", "pipe", "ignore"],
        })
        const client = new Client(child, root, spec.id)
        return client.ready.then(() => client)
      })
      clients.set(spec.id, created)
      created.catch(() => clients.delete(spec.id))
      return created
    }

    const relative = (file: string) => {
      const value = path.relative(root, file)
      return value.startsWith("..") ? file : value
    }

    const lineText = async (file: string, line: number) =>
      (await readFile(file, "utf8").catch(() => "")).split("\n")[line]?.trim() ?? ""

    const formatLocations = async (value: unknown) => {
      const items = (Array.isArray(value) ? value : value ? [value] : []) as Array<Record<string, unknown>>
      const lines = await Promise.all(
        items.slice(0, 100).map(async (item) => {
          const uri = String(item.targetUri ?? item.uri ?? "")
          const range = (item.targetSelectionRange ?? item.range) as Range | undefined
          if (!uri.startsWith("file:") || !range) return uri
          const file = fileURLToPath(uri)
          return `${relative(file)}:${range.start.line + 1}:${range.start.character + 1}  ${await lineText(file, range.start.line)}`
        }),
      )
      return lines.length ? lines.join("\n") + (items.length > 100 ? `\n[${items.length - 100} more]` : "") : "No results."
    }

    const formatSymbols = (value: unknown, depth = 0): string[] =>
      ((value ?? []) as Array<Record<string, unknown>>).flatMap((item) => {
        const range = (item.selectionRange ?? (item.location as { range?: Range } | undefined)?.range ?? item.range) as
          | Range
          | undefined
        const location = item.location as { uri?: string } | undefined
        const where = location?.uri?.startsWith("file:") ? `${relative(fileURLToPath(location.uri))}:` : ""
        return [
          `${"  ".repeat(depth)}${symbolKinds[Number(item.kind)] ?? "symbol"} ${String(item.name)} (${where}${(range?.start.line ?? 0) + 1})`,
          ...formatSymbols(item.children, depth + 1),
        ]
      })

    const position = async (file: string, input: Input) => {
      if (input.line === undefined) {
        if (!input.symbol) throw new Error("Give line (1-based) with character or symbol")
        const pattern = new RegExp(`\\b${input.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
        const lines = (await readFile(file, "utf8")).split("\n")
        const index = lines.findIndex((text) => pattern.test(text))
        if (index === -1) throw new Error(`Symbol ${input.symbol} not found in ${relative(file)}`)
        return { line: index, character: lines[index].search(pattern) }
      }
      const line = input.line - 1
      if (input.character !== undefined) return { line, character: input.character - 1 }
      const text = (await readFile(file, "utf8")).split("\n")[line] ?? ""
      const found = input.symbol ? text.indexOf(input.symbol) : text.search(/\S/)
      return { line, character: Math.max(found, 0) }
    }

    const execute = async (input: Input) => {
      if (input.operation === "workspace_symbols") {
        const anchor = input.path ? path.resolve(ctx.location.directory, input.path) : undefined
        const client = anchor ? await clientFor(anchor) : await [...clients.values()][0]
        if (!client)
          throw new Error("No language server is running; pass a path so one can start for that language")
        await client.ready
        return formatSymbols(await client.request("workspace/symbol", { query: input.query ?? "" })).slice(0, 200).join("\n") || "No results."
      }
      if (!input.path) throw new Error("path is required")
      const file = path.resolve(ctx.location.directory, input.path)
      if (!existsSync(file)) throw new Error(`File not found: ${input.path}`)
      const client = await clientFor(file)
      if (!client)
        throw new Error(
          `No language server for ${path.extname(file) || file}. Install one (e.g. typescript-language-server, pyright, gopls, rust-analyzer, clangd) or configure it under "lsp" in opencode.json.`,
        )
      const uri = await client.sync(file, input.operation === "diagnostics" ? 5000 : 0)
      if (input.operation === "diagnostics") {
        const diagnostics = client.diagnostics.get(uri) ?? []
        return diagnostics.length ? formatDiagnostics(relative(file), diagnostics) : `No problems found in ${relative(file)}.`
      }
      if (input.operation === "symbols")
        return formatSymbols(await client.request("textDocument/documentSymbol", { textDocument: { uri } })).join("\n") || "No symbols."
      const params = { textDocument: { uri }, position: await position(file, input) }
      if (input.operation === "hover") {
        const result = (await client.request("textDocument/hover", params)) as { contents?: unknown } | null
        const contents = result?.contents
        const text = Array.isArray(contents)
          ? contents.map((item) => (typeof item === "string" ? item : String((item as { value?: string }).value ?? ""))).join("\n\n")
          : typeof contents === "string"
            ? contents
            : String((contents as { value?: string } | undefined)?.value ?? "")
        return text.trim() || "No hover information."
      }
      const method =
        input.operation === "definition"
          ? "textDocument/definition"
          : input.operation === "implementation"
            ? "textDocument/implementation"
            : "textDocument/references"
      return formatLocations(
        await client.request(method, input.operation === "references" ? { ...params, context: { includeDeclaration: true } } : params),
      )
    }

    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          options: { codemode: false },
          description:
            "Code intelligence from a language server: jump to a definition or implementation, find all references, show the type and docs of a symbol (hover), list a file's symbols, search symbols across the project, or get a file's errors and warnings. Prefer this over grep when you need exact, type-aware answers. Lines and columns are 1-based; you can pass symbol instead of an exact column.",
          input: Input,
          output: Schema.Struct({ output: Schema.String }),
          execute: (input, context) =>
            Effect.gen(function* () {
              yield* permission
                .assert({
                  action: name,
                  resources: [input.path ?? input.query ?? "*"],
                  save: ["*"],
                  metadata: input,
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source: { type: "tool", messageID: context.messageID, id: context.id },
                })
                .pipe(Effect.mapError((error) => new ToolFailure({ message: "Permission denied: lsp", error })))
              const output = yield* Effect.tryPromise({
                try: () => execute(input),
                catch: (error) =>
                  new ToolFailure({ message: error instanceof Error ? error.message : String(error), error }),
              })
              return { output: { output }, content: output }
            }),
        }),
      )
      .pipe(Effect.orDie)

    // After successful edits, report new errors from a language server that is already running.
    yield* ctx.tool.hook("execute.after", (event) =>
      Effect.gen(function* () {
        if (event.status !== "completed" || !["edit", "write", "patch"].includes(event.tool)) return
        if (process.env.OPENCODE_DISABLE_LSP_DIAGNOSTICS === "1") return
        const input = event.input as Record<string, unknown>
        const files = [input.path, input.filePath].filter((item): item is string => typeof item === "string")
        const notes = yield* Effect.promise(() =>
          Promise.all(
            files.map(async (item) => {
              const file = path.resolve(ctx.location.directory, item)
              const client = await clientFor(file, false).catch(() => undefined)
              if (!client || !existsSync(file)) return ""
              const uri = await client.sync(file, 3000).catch(() => undefined)
              const errors = uri ? (client.diagnostics.get(uri) ?? []).filter((item) => (item.severity ?? 1) === 1) : []
              return errors.length ? formatDiagnostics(relative(file), errors, 10) : ""
            }),
          ),
        )
        const text = notes.filter(Boolean).join("\n")
        if (!text) return
        const content = event.result.content
        const note = `\n\nLanguage server errors after this change:\n${text}`
        event.result = {
          ...event.result,
          content: typeof content === "string" ? content + note : [...(content ?? []), { type: "text", text: note }],
        }
      }),
    )
  }),
}
