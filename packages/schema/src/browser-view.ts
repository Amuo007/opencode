export * as BrowserView from "./browser-view.js"

import { Schema } from "effect"

/** The page the agent's headless browser shows, for the session UI's live view. */
export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  open: Schema.Boolean,
  url: Schema.String,
  title: Schema.String,
  width: Schema.Number,
  height: Schema.Number,
  /** A JPEG of the viewport, base64 encoded. Empty while no browser is open. */
  image: Schema.String,
  /** The element an inspect action found. */
  element: Schema.optional(
    Schema.Struct({ label: Schema.String, selector: Schema.String, text: Schema.String, role: Schema.String }),
  ),
}).annotate({ identifier: "BrowserView.Info" })

/** Something the user does in the live view: the agent's browser performs it on its page. */
export type Action = Schema.Schema.Type<typeof Action>
export const Action = Schema.Union([
  Schema.Struct({ type: Schema.Literal("navigate"), url: Schema.String }),
  Schema.Struct({ type: Schema.Literal("click"), x: Schema.Number, y: Schema.Number }),
  Schema.Struct({ type: Schema.Literal("inspect"), x: Schema.Number, y: Schema.Number }),
  Schema.Struct({ type: Schema.Literal("scroll"), x: Schema.Number, y: Schema.Number, deltaY: Schema.Number }),
  Schema.Struct({ type: Schema.Literal("type"), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal("key"), key: Schema.String }),
  Schema.Struct({ type: Schema.Literals(["back", "forward", "reload"]) }),
]).annotate({ identifier: "BrowserView.Action" })
