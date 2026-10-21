export * as MemoryTools from "./memory.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { SystemPart, ToolFailure } from "@opencode/ai"
import { Tool } from "@opencode/schema/tool"
import { Global } from "@opencode/util/global"
import { Effect, Schema } from "effect"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Permission } from "../../permission.js"

// Persistent memory that survives sessions and compaction: one Markdown file per fact in a
// per-project folder, plus a MEMORY.md index that is added to every request's system prompt.

export const namespace = "memory"
export const INDEX = "MEMORY.md"
const MAX_INDEX_CHARS = 12_000
const Types = ["user", "feedback", "project", "reference"] as const

export const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)

// Matches how the project directory is named under the memory root, e.g. /a/b c -> -a-b-c.
export const projectKey = (directory: string) => directory.replace(/[^A-Za-z0-9]+/g, "-")

export const format = (input: { name: string; description: string; type: string; content: string }) =>
  `---\nname: ${input.name}\ndescription: ${input.description.replace(/\n/g, " ")}\nmetadata:\n  type: ${input.type}\n---\n\n${input.content.trim()}\n`

export const indexLine = (name: string, description: string) =>
  `- [${name}](${name}.md) — ${description.replace(/\n/g, " ").trim()}`

export const upsertIndex = (index: string, name: string, description: string) => {
  const line = indexLine(name, description)
  const lines = index.split("\n").filter((item) => item.trim() !== "")
  const position = lines.findIndex((item) => item.includes(`(${name}.md)`))
  if (position === -1) return [...lines, line].join("\n") + "\n"
  return lines.toSpliced(position, 1, line).join("\n") + "\n"
}

export const removeFromIndex = (index: string, name: string) =>
  index
    .split("\n")
    .filter((item) => item.trim() !== "" && !item.includes(`(${name}.md)`))
    .join("\n") + "\n"

export const instructions = (directory: string, index: string) => `# Persistent memory

You have a persistent memory for this project at ${directory}. It survives new sessions and context compaction. The index below lists every saved memory; read one with memory_read when it looks relevant to the task.

Save a memory with memory_save when you learn something worth knowing in a future session that the code, git history or AGENTS.md do not already record:
- user: who the user is, their role, expertise and preferences
- feedback: corrections or confirmed approaches the user gave you, with the reason
- project: ongoing goals, decisions, deadlines or constraints (use absolute dates)
- reference: where to find things (URLs, dashboards, tickets, commands)
Update an existing memory instead of creating a duplicate, and delete memories that turn out to be wrong. Never store secrets, passwords or API keys. Memories reflect what was true when written: verify a remembered file, function or flag still exists before relying on it.

## Memory index (${INDEX})
${index.trim() ? (index.length > MAX_INDEX_CHARS ? `${index.slice(0, MAX_INDEX_CHARS)}\n[index truncated]` : index.trim()) : "(empty - nothing saved yet)"}`

const Output = Schema.Struct({ output: Schema.String })

export const Plugin = {
  id: "opencode.tool.memory",
  effect: Effect.fn("MemoryTools.Plugin")(function* (ctx: Context) {
    const permission = yield* Permission.Service
    const global = yield* Global.Service
    const directory = path.join(global.data, "memory", projectKey(ctx.location.project.directory))
    const indexFile = path.join(directory, INDEX)
    const readIndex = () => readFile(indexFile, "utf8").catch(() => "")

    const hook = (event: SessionHooks["context"]) =>
      Effect.promise(readIndex).pipe(
        Effect.map((index) => {
          event.system.push(SystemPart.make(instructions(directory, index)))
        }),
      )
    yield* ctx.session.hook("context", hook)
    yield* ctx.session.hook("compaction", hook)
    yield* ctx.session.hook("generate", hook)

    const allow = (context: Tool.Context, resource: string, metadata: Record<string, unknown>) =>
      permission
        .assert({
          action: namespace,
          resources: [resource],
          save: ["*"],
          metadata,
          sessionID: context.sessionID,
          agent: context.agent,
          source: { type: "tool", messageID: context.messageID, id: context.id },
        })
        .pipe(Effect.mapError((error) => new ToolFailure({ message: "Permission denied: memory", error })))

    const io = <A>(message: string, task: () => Promise<A>) =>
      Effect.tryPromise({
        try: task,
        catch: (error) =>
          new ToolFailure({ message: `${message}: ${error instanceof Error ? error.message : String(error)}`, error }),
      })

    yield* ctx.tool
      .transform((editor) => {
        editor.namespace({
          name: namespace,
          description: "Persistent memory for this project that survives sessions and compaction.",
        })
        const options = { namespace, permission: namespace, codemode: false } as const

        editor.add({
          name: "save",
          options,
          description:
            "Save or update one memory (one fact per memory). Reusing a name replaces that memory. Keep content short and specific; for feedback and project memories add a **Why:** line and a **How to apply:** line.",
          input: Schema.Struct({
            name: Schema.String.annotate({ description: "Short kebab-case name, e.g. prefers-bun-over-npm" }),
            description: Schema.String.annotate({ description: "One-line summary used to decide relevance later" }),
            type: Schema.Literals(Types).annotate({ description: "user, feedback, project or reference" }),
            content: Schema.String.annotate({ description: "The memory itself, in Markdown" }),
          }),
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              const name = slug(input.name)
              if (!name) return yield* new ToolFailure({ message: "Memory name must contain letters or numbers" })
              yield* allow(context, name, { name, type: input.type })
              yield* io("Could not save the memory", async () => {
                await mkdir(directory, { recursive: true })
                await writeFile(path.join(directory, `${name}.md`), format({ ...input, name }))
                await writeFile(indexFile, upsertIndex(await readIndex(), name, input.description))
              })
              const output = `Saved memory "${name}" (${input.type}).`
              return { output: { output }, content: output }
            }),
        })

        editor.add({
          name: "read",
          options,
          description: "Read one saved memory by name, or the whole index when name is omitted.",
          input: Schema.Struct({
            name: Schema.optionalKey(Schema.String).annotate({ description: "Memory name from the index" }),
          }),
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              const name = input.name === undefined ? undefined : slug(input.name)
              yield* allow(context, name ?? INDEX, {})
              const output = yield* io("Could not read the memory", async () => {
                if (name === undefined) return (await readIndex()) || "(no memories saved yet)"
                return readFile(path.join(directory, `${name}.md`), "utf8")
              })
              return { output: { output }, content: output }
            }),
        })

        editor.add({
          name: "delete",
          options,
          description: "Delete a memory that is wrong or no longer useful.",
          input: Schema.Struct({ name: Schema.String.annotate({ description: "Memory name from the index" }) }),
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              const name = slug(input.name)
              yield* allow(context, name, {})
              yield* io("Could not delete the memory", async () => {
                await rm(path.join(directory, `${name}.md`), { force: true })
                await writeFile(indexFile, removeFromIndex(await readIndex(), name))
              })
              const output = `Deleted memory "${name}".`
              return { output: { output }, content: output }
            }),
        })
      })
      .pipe(Effect.orDie)
  }),
}
