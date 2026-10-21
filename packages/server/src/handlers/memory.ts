import { Location } from "@opencode/core/location"
import { MemoryTools } from "@opencode/core/tool/plugin/memory"
import { Global } from "@opencode/util/global"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/http-api"
import { Api } from "../api"
import { response } from "../location"

const directory = Effect.gen(function* () {
  const location = yield* Location.Service
  return MemoryTools.directoryFor(Global.Path.data, location.project.directory)
})

export const MemoryHandler = HttpApiBuilder.group(Api, "server.memory", (handlers) =>
  handlers
    .handle("memory.list", () =>
      response(
        Effect.gen(function* () {
          const dir = yield* directory
          return { directory: dir, entries: yield* Effect.promise(() => MemoryTools.list(dir)) }
        }),
      ),
    )
    .handle(
      "memory.remove",
      Effect.fn(function* (ctx) {
        const dir = yield* directory
        const name = MemoryTools.slug(ctx.params.name)
        if (name) yield* Effect.promise(() => MemoryTools.remove(dir, name))
        return HttpApiSchema.NoContent.make()
      }),
    ),
)
