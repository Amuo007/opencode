import { Location } from "@opencode/core/location"
import { ChromeTools } from "@opencode/core/tool/plugin/chrome"
import { InvalidRequestError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { awaitPlugins, response } from "../location"

const live = Effect.gen(function* () {
  // The chrome plugin registers the Location's browser while it activates.
  yield* awaitPlugins
  const location = yield* Location.Service
  return ChromeTools.live(location.directory)
})

export const BrowserViewHandler = HttpApiBuilder.group(Api, "server.browserView", (handlers) =>
  handlers
    .handle("browserView.get", (ctx) =>
      response(
        Effect.gen(function* () {
          const browser = yield* live
          const image = ctx.query.image !== "false"
          return browser ? yield* Effect.promise(() => browser.view({ image })) : ChromeTools.closedView
        }),
      ),
    )
    .handle(
      "browserView.act",
      Effect.fn(function* (ctx) {
        const browser = yield* live
        if (!browser) return yield* new InvalidRequestError({ message: "The browser tools are not available here" })
        return yield* response(
          Effect.tryPromise({
            try: () => browser.act(ctx.payload).then(() => browser.view()),
            catch: (error) =>
              new InvalidRequestError({ message: error instanceof Error ? error.message : String(error) }),
          }),
        )
      }),
    ),
)
