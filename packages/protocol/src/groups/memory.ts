import { Location } from "@opencode/schema/location"
import { Memory } from "@opencode/schema/memory"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"
import { InvalidRequestError } from "../errors.js"
import { LocationQuery, locationQueryOpenApi } from "./location.js"

export const MemoryGroup = HttpApiGroup.make("server.memory")
  .add(
    HttpApiEndpoint.get("memory.list", "/api/experimental/memory", {
      query: LocationQuery,
      success: Location.response(Memory.Info),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "experimental.memory.list",
          summary: "List memories",
          description: "List the persistent memories saved for the location's project.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("memory.save", "/api/experimental/memory", {
      query: LocationQuery,
      payload: Memory.SaveInput,
      success: Location.response(Memory.Info),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "experimental.memory.save",
          summary: "Save memory",
          description: "Save or replace one persistent memory of the location's project and update the index.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.delete("memory.remove", "/api/experimental/memory/:name", {
      params: { name: Schema.String },
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "experimental.memory.remove",
          summary: "Remove memory",
          description: "Delete one persistent memory of the location's project and drop it from the index.",
        }),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "memory", description: "Experimental persistent memory routes." }))
