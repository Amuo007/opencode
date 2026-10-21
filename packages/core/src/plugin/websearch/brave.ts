export * as WebSearchBrave from "./brave.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Duration, Effect, Schema, Scope } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { App } from "../../app.js"
import { WebSearchBuiltin } from "./builtin.js"

export const endpoint = "https://api.search.brave.com/res/v1/web/search"

const SearchResponse = Schema.Struct({
  web: Schema.Struct({
    results: Schema.Array(
      Schema.Struct({
        title: Schema.String,
        url: Schema.String,
        description: Schema.String.pipe(Schema.optional),
        page_age: Schema.String.pipe(Schema.optional),
      }),
    ),
  }).pipe(Schema.optional),
})

export const Plugin = define<HttpClient.HttpClient | Scope.Scope>({
  id: "opencode.websearch.brave",
  effect: Effect.fn("WebSearchBrave.Plugin")(function* (ctx) {
    const http = yield* HttpClient.HttpClient
    yield* ctx.integration.transform((editor) => {
      editor.update("brave", (integration) => (integration.name = "Brave Search"))
      editor.method.update({
        integrationID: "brave",
        method: { type: "key" },
      })
      editor.method.update({
        integrationID: "brave",
        method: { type: "env", names: ["BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY"] },
      })
    })
    yield* ctx.websearch.transform((editor) => {
      editor.add({
        id: "brave",
        name: "Brave Search",
        execute: (input) =>
          Effect.gen(function* () {
            const connection = yield* ctx.integration.connection.active("brave")
            const credential = connection ? yield* ctx.integration.connection.resolve(connection) : undefined
            if (credential?.type !== "key")
              return yield* Effect.fail(new Error("Brave Search needs an API key (set BRAVE_API_KEY or connect Brave)"))
            const url = new URL(endpoint)
            url.searchParams.set("q", input.query)
            url.searchParams.set("count", String(WebSearchBuiltin.MAX_RESULTS))
            const response = yield* HttpClient.withScope(HttpClient.filterStatusOk(http))
              .execute(
                HttpClientRequest.get(url.toString()).pipe(
                  HttpClientRequest.acceptJson,
                  HttpClientRequest.setHeaders({
                    "User-Agent": App.useragent(ctx.app),
                    "X-Subscription-Token": credential.key,
                  }),
                ),
              )
              .pipe(
                Effect.flatMap(HttpClientResponse.schemaBodyJson(SearchResponse)),
                Effect.scoped,
                Effect.timeoutOrElse({
                  duration: Duration.seconds(25),
                  orElse: () => Effect.fail(new Error("Brave Search request timed out")),
                }),
              )
            return (response.web?.results ?? []).map((item) => {
              const published = item.page_age ? Date.parse(item.page_age) : Number.NaN
              const content = item.description ? WebSearchBuiltin.text(item.description) : ""
              return {
                url: item.url,
                title: WebSearchBuiltin.text(item.title),
                ...(content ? { content } : {}),
                time: Number.isFinite(published) ? { published } : {},
              }
            })
          }),
      })
    })
  }),
})
