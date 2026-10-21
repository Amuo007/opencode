import { InvalidRequestError } from "@opencode/protocol/errors"
import { Global } from "@opencode/util/global"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Api } from "../api"
import { response } from "../location"

const root = () => path.join(Global.Path.config, "skills")

/** A folder-safe skill name: lowercase letters, digits and dashes. */
export const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)

export const skillFile = (input: { name: string; description: string; content: string }) =>
  `---\nname: ${input.name}\ndescription: ${JSON.stringify(input.description.replace(/\s+/g, " ").trim())}\n---\n\n${input.content.trim()}\n`

const invalid = (message: string) => new InvalidRequestError({ message })

export const SkillEditHandler = HttpApiBuilder.group(Api, "server.skillEdit", (handlers) =>
  handlers
    .handle("skillEdit.root", () => response(Effect.succeed({ directory: root() })))
    .handle(
      "skillEdit.create",
      Effect.fn(function* (ctx) {
        const name = slug(ctx.payload.name)
        if (!name) return yield* invalid("A skill name needs letters or numbers")
        if (!ctx.payload.content.trim()) return yield* invalid("Write the skill's instructions")
        const file = path.join(root(), name, "SKILL.md")
        yield* Effect.tryPromise({
          try: async () => {
            await mkdir(path.dirname(file), { recursive: true })
            await writeFile(file, skillFile({ ...ctx.payload, name }))
          },
          catch: (error) =>
            invalid(`Could not write the skill: ${error instanceof Error ? error.message : String(error)}`),
        })
        return yield* response(Effect.succeed({ directory: root(), path: file }))
      }),
    )
    .handle(
      "skillEdit.remove",
      Effect.fn(function* (ctx) {
        const name = slug(ctx.params.name)
        if (!name) return yield* invalid("Unknown skill")
        const directory = path.join(root(), name)
        yield* Effect.tryPromise({
          try: () => rm(directory, { recursive: true, force: true }),
          catch: (error) =>
            invalid(`Could not remove the skill: ${error instanceof Error ? error.message : String(error)}`),
        })
        return yield* response(Effect.succeed({ directory: root() }))
      }),
    ),
)
