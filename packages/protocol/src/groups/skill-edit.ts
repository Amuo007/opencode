import { Location } from "@opencode/schema/location"
import { SkillEdit } from "@opencode/schema/skill-edit"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { InvalidRequestError } from "../errors.js"
import { LocationQuery, locationQueryOpenApi } from "./location.js"

export const SkillEditGroup = HttpApiGroup.make("server.skillEdit")
  .add(
    HttpApiEndpoint.get("skillEdit.root", "/api/experimental/skill-files", {
      query: LocationQuery,
      success: Location.response(SkillEdit.Info),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "experimental.skillEdit.root",
          summary: "Global skills folder",
          description: "The folder where skills created from the app are written.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("skillEdit.create", "/api/experimental/skill-files", {
      query: LocationQuery,
      payload: SkillEdit.CreateInput,
      success: Location.response(SkillEdit.Info),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "experimental.skillEdit.create",
          summary: "Create or replace a skill",
          description: "Writes <global skills folder>/<name>/SKILL.md; the skill is picked up without a restart.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.delete("skillEdit.remove", "/api/experimental/skill-files/:name", {
      params: { name: Schema.String },
      query: LocationQuery,
      success: Location.response(SkillEdit.Info),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "experimental.skillEdit.remove",
          summary: "Remove a skill",
          description: "Deletes a skill folder from the global skills folder.",
        }),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "skill files", description: "Experimental skill editing routes." }))
