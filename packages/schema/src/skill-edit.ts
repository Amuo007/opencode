export * as SkillEdit from "./skill-edit.js"

import { Schema } from "effect"

/** A skill written from the app into the global skills folder. */
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}
export const CreateInput = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  content: Schema.String,
}).annotate({ identifier: "SkillEdit.CreateInput" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  /** The global skills folder; skills inside it can be removed from the app. */
  directory: Schema.String,
  /** The written SKILL.md, when one was written. */
  path: Schema.String.pipe(Schema.optional),
}).annotate({ identifier: "SkillEdit.Info" })
