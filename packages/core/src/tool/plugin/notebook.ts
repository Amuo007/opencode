/**
 * Jupyter notebook leaves. notebook_read lists cells with their ids, sources and text
 * outputs; notebook_edit replaces, inserts or deletes one cell through the same access,
 * permission and mutation path as the write tool.
 */
export * as NotebookTools from "./notebook.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import { ToolFailure } from "@opencode/ai"
import { Effect, Schema, Semaphore } from "effect"
import { randomBytes } from "node:crypto"
import { Environment } from "../../environment/index.js"
import { FileAccess } from "../../file-access.js"
import { FileMutation } from "../../file-mutation.js"
import { Permission } from "../../permission.js"
import { fileDiff } from "./file-diff.js"

export const namespace = "notebook"
const MAX_OUTPUT = 2000

type Cell = {
  cell_type: string
  id?: string
  source: string | string[]
  metadata?: Record<string, unknown>
  outputs?: Array<Record<string, unknown>>
  execution_count?: number | null
}
type Notebook = { cells: Cell[]; nbformat?: number; nbformat_minor?: number }

export const EditInput = Schema.Struct({
  path: Schema.String.annotate({ description: "Path to the .ipynb file" }),
  mode: Schema.Literals(["replace", "insert", "delete"]).annotate({
    description: "replace a cell's source, insert a new cell, or delete a cell",
  }),
  cell_id: Schema.optionalKey(Schema.String).annotate({
    description: "Target cell id from notebook_read. For insert, the new cell goes after it.",
  }),
  index: Schema.optionalKey(Schema.Int).annotate({
    description: "0-based cell index when the cell has no id. For insert, the position of the new cell.",
  }),
  source: Schema.optionalKey(Schema.String).annotate({ description: "New cell source (replace and insert)" }),
  cell_type: Schema.optionalKey(Schema.Literals(["code", "markdown", "raw"])).annotate({
    description: "Cell type for insert (default code), or to change the type on replace",
  }),
})
export type EditInput = typeof EditInput.Type

const sourceText = (source: string | string[]) => (Array.isArray(source) ? source.join("") : source)
// Jupyter stores sources as lines that keep their trailing newline.
const sourceLines = (text: string) => text.split(/(?<=\n)/).filter((line) => line !== "")

const outputText = (output: Record<string, unknown>) => {
  const data = output.data as Record<string, unknown> | undefined
  const text = output.text ?? data?.["text/plain"] ?? (output.ename ? `${String(output.ename)}: ${String(output.evalue)}` : undefined)
  if (text !== undefined) return sourceText(text as string | string[])
  if (data && Object.keys(data).some((key) => key.startsWith("image/"))) return "[image output]"
  return ""
}

export function describeNotebook(notebook: Notebook) {
  return notebook.cells
    .map((cell, index) => {
      const outputs = (cell.outputs ?? []).map(outputText).filter(Boolean).join("\n")
      const shown = outputs.length > MAX_OUTPUT ? `${outputs.slice(0, MAX_OUTPUT)}\n[output truncated]` : outputs
      return [
        `### Cell ${index}${cell.id ? ` (id: ${cell.id})` : ""} [${cell.cell_type}]`,
        sourceText(cell.source),
        ...(shown ? ["--- output ---", shown] : []),
      ].join("\n")
    })
    .join("\n\n")
}

export function applyEdit(notebook: Notebook, input: EditInput, newID = () => randomBytes(4).toString("hex")) {
  const cells = [...notebook.cells]
  const located = input.cell_id !== undefined ? cells.findIndex((cell) => cell.id === input.cell_id) : input.index
  if (input.cell_id !== undefined && located === -1) throw new Error(`No cell with id ${input.cell_id}`)

  if (input.mode === "insert") {
    const position =
      input.cell_id !== undefined ? (located ?? cells.length - 1) + 1 : Math.min(Math.max(input.index ?? cells.length, 0), cells.length)
    const type = input.cell_type ?? "code"
    const cell: Cell = {
      cell_type: type,
      ...((notebook.nbformat ?? 4) >= 4 && (notebook.nbformat_minor ?? 5) >= 5 ? { id: newID() } : {}),
      metadata: {},
      source: sourceLines(input.source ?? ""),
      ...(type === "code" ? { outputs: [], execution_count: null } : {}),
    }
    return { notebook: { ...notebook, cells: cells.toSpliced(position, 0, cell) }, index: position }
  }

  if (located === undefined || located < 0 || located >= cells.length)
    throw new Error(`Cell ${input.cell_id ?? input.index ?? "(none)"} does not exist; the notebook has ${cells.length} cells`)

  if (input.mode === "delete") return { notebook: { ...notebook, cells: cells.toSpliced(located, 1) }, index: located }

  if (input.source === undefined) throw new Error("replace needs source")
  const current = cells[located]
  const type = input.cell_type ?? current.cell_type
  const cell: Cell = {
    ...(Object.fromEntries(
      Object.entries(current).filter(([key]) => key !== "outputs" && key !== "execution_count"),
    ) as Cell),
    cell_type: type,
    source: sourceLines(input.source),
    // Changing code invalidates its old outputs.
    ...(type === "code" ? { outputs: [], execution_count: null } : {}),
  }
  return { notebook: { ...notebook, cells: cells.toSpliced(located, 1, cell) }, index: located }
}

const parse = (text: string) => {
  const value = JSON.parse(text) as Notebook
  if (!Array.isArray(value.cells)) throw new Error("Not a Jupyter notebook (no cells array)")
  return value
}

export const Plugin = {
  id: "opencode.tool.notebook",
  effect: Effect.fn("NotebookTools.Plugin")(function* (ctx: Context) {
    const access = yield* FileAccess.Service
    const fileMutation = yield* FileMutation.Service
    const environment = yield* Environment.Service
    const permission = yield* Permission.Service
    // Models often send several edits to one notebook in a single turn and those calls run in
    // parallel; serialize each file's read-modify-write so no edit is lost.
    const locks = new Map<string, Semaphore.Semaphore>()
    const lock = (file: string) => {
      const existing = locks.get(file)
      if (existing) return existing
      const created = Semaphore.makeUnsafe(1)
      locks.set(file, created)
      return created
    }

    yield* ctx.tool
      .transform((editor) => {
        editor.namespace({ name: namespace, description: "Read and edit Jupyter notebooks (.ipynb) cell by cell." })

        editor.add({
          name: "read",
          options: { namespace, codemode: false, permission: "read" },
          description:
            "Read a Jupyter notebook as numbered cells with ids, types, sources and text outputs. Use this instead of read for .ipynb files.",
          input: Schema.Struct({ path: Schema.String.annotate({ description: "Path to the .ipynb file" }) }),
          output: Schema.Struct({ resource: Schema.String, cells: Schema.Number }),
          execute: (input, context) =>
            Effect.gen(function* () {
              const target = yield* access.resolve({ path: input.path, kind: "file" })
              yield* access.authorizeExternal([target], context)
              yield* permission.assert({
                action: "read",
                resources: [target.resource],
                save: ["*"],
                metadata: { path: target.resource },
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.messageID, id: context.id },
              })
              const current = yield* FileMutation.readText(environment.files, target.absolute)
              const notebook = yield* Effect.try({ try: () => parse(current.text), catch: (error) => error })
              return {
                output: { resource: target.resource, cells: notebook.cells.length },
                content: `${target.resource}: ${notebook.cells.length} cells\n\n${describeNotebook(notebook)}`,
              }
            }).pipe(Effect.mapError((error) => new ToolFailure({ message: `Unable to read notebook ${input.path}`, error }))),
        })

        editor.add({
          name: "edit",
          options: { namespace, codemode: false, permission: "edit" },
          description:
            "Edit one cell of a Jupyter notebook: replace its source, insert a new cell, or delete it. Target cells by cell_id from notebook_read (or by 0-based index). Replacing a code cell clears its outputs.",
          input: EditInput,
          output: Schema.Struct({ resource: Schema.String, mode: Schema.String, index: Schema.Number, cells: Schema.Number }),
          execute: (input, context) =>
            Effect.gen(function* () {
              const target = yield* access.resolve({ path: input.path, kind: "file" })
              yield* access.authorizeExternal([target], context)
              const result = yield* lock(target.absolute).withPermit(
                Effect.gen(function* () {
                  const current = yield* FileMutation.readText(environment.files, target.absolute)
                  const edited = yield* Effect.try({
                    try: () => applyEdit(parse(current.text), input),
                    catch: (error) => error,
                  })
                  const next = JSON.stringify(edited.notebook, null, 1) + "\n"
                  yield* permission.assert({
                    action: "edit",
                    resources: [target.resource],
                    save: ["*"],
                    metadata: { files: [fileDiff(target.resource, current.text, next, "modified")] },
                    sessionID: context.sessionID,
                    agent: context.agent,
                    source: { type: "tool", messageID: context.messageID, id: context.id },
                  })
                  yield* fileMutation.writeTextPreservingBom({ target, content: next })
                  return edited
                }),
              )
              const output = { resource: target.resource, mode: input.mode, index: result.index, cells: result.notebook.cells.length }
              return {
                output,
                content: `${input.mode === "delete" ? "Deleted" : input.mode === "insert" ? "Inserted" : "Replaced"} cell ${result.index} in ${target.resource} (${output.cells} cells now).`,
              }
            }).pipe(Effect.mapError((error) => new ToolFailure({ message: `Unable to edit notebook ${input.path}`, error }))),
        })
      })
      .pipe(Effect.orDie)
  }),
}
