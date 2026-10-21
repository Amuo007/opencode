import { BrowserView } from "@opencode/schema/browser-view"
import { Location } from "@opencode/schema/location"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { InvalidRequestError, ServiceUnavailableError } from "../errors.js"
import { LocationQuery, locationQueryOpenApi } from "./location.js"

export const BrowserViewGroup = HttpApiGroup.make("server.browserView")
  .add(
    HttpApiEndpoint.get("browserView.get", "/api/experimental/browser", {
      query: LocationQuery,
      success: Location.response(BrowserView.Info),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "experimental.browserView.get",
          summary: "Agent browser view",
          description: "The location's agent browser page: URL, title and a JPEG of the viewport.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("browserView.act", "/api/experimental/browser", {
      query: LocationQuery,
      payload: BrowserView.Action,
      success: Location.response(BrowserView.Info),
      error: [InvalidRequestError, ServiceUnavailableError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "experimental.browserView.act",
          summary: "Act in the agent browser",
          description: "Navigate, click, scroll, type or press a key in the location's agent browser, then return its view.",
        }),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "browser", description: "Experimental agent browser view routes." }))
