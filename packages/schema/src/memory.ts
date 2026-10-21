export * as Memory from "./memory.js"

import { Schema } from "effect"

export interface Entry extends Schema.Schema.Type<typeof Entry> {}
export const Entry = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  type: Schema.String,
  content: Schema.String,
}).annotate({ identifier: "Memory.Entry" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  directory: Schema.String,
  entries: Schema.Array(Entry),
}).annotate({ identifier: "Memory.Info" })

export interface SaveInput extends Schema.Schema.Type<typeof SaveInput> {}
export const SaveInput = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  type: Schema.Literals(["user", "feedback", "project", "reference"]),
  content: Schema.String,
}).annotate({ identifier: "Memory.SaveInput" })
