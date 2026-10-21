export * as PlanExitTool from "./plan-exit.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { ToolFailure } from "@opencode/ai"
import { Agent } from "@opencode/schema/agent"
import { Effect, Schema } from "effect"
import { Form } from "../../form.js"

// Plan mode's exit: the Plan agent presents its finished plan, the user approves it or asks for
// changes, and approval switches the session to the Build agent, which implements it in the same turn.

export const name = "plan_exit"
const plan = Agent.ID.make("plan")
const build = Agent.ID.make("build")
export const APPROVE = "Approve and build"
const REVISE = "Keep planning"

export const description = `Present your finished plan to the user for approval. Only available in Plan mode.

Call this once the plan is complete and concrete: the files to change, the steps in order, and how you will verify the result. If the user approves, the session switches to the Build agent and you implement the plan right away. If the user asks for changes, revise the plan and call this tool again.`

export const Input = Schema.Struct({
  plan: Schema.String.annotate({ description: "The complete plan in Markdown" }),
})

const Output = Schema.Struct({ approved: Schema.Boolean, feedback: Schema.optionalKey(Schema.String) })

export const Plugin = {
  id: "opencode.tool.plan-exit",
  effect: Effect.fn("PlanExitTool.Plugin")(function* (ctx: Context) {
    const forms = yield* Form.Service

    // Only the Plan agent sees the tool.
    const hook = (event: SessionHooks["context"]) =>
      Effect.sync(() => {
        if (event.agent !== plan) delete event.tools[name]
      })
    yield* ctx.session.hook("context", hook)
    yield* ctx.session.hook("generate", hook)

    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          options: { codemode: false },
          description,
          input: Input,
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              // Asked as a question form so every client (TUI, web, desktop) already knows how to show it.
              const response = yield* forms.ask({
                sessionID: context.sessionID,
                title: "Plan",
                metadata: { kind: "question", tool: { messageID: context.messageID, id: context.id } },
                fields: [
                  {
                    key: "q0",
                    title: "Approve plan?",
                    description: `${input.plan}\n\nApprove this plan and start building? Pick "${REVISE}" or type what to change.`,
                    type: "string",
                    options: [
                      { value: APPROVE, label: APPROVE, description: "Switch to Build and implement the plan" },
                      { value: REVISE, label: REVISE, description: "Stay in Plan mode and refine it" },
                    ],
                    custom: true,
                  },
                ],
              })
              if (response.status === "cancelled")
                return yield* new ToolFailure({
                  message: response.message ?? "The user dismissed the plan approval. Ask what they want to change.",
                })
              const answer = response.answer.q0
              const choice = Array.isArray(answer) ? answer.join(", ") : String(answer ?? "")
              if (choice !== APPROVE) {
                const feedback = choice === REVISE ? "The user wants to keep planning." : choice
                return {
                  output: { approved: false, feedback },
                  content: `The plan was not approved. User feedback: ${feedback}\nRevise the plan and call ${name} again when it is ready.`,
                }
              }
              // The switch applies to the next step of this same turn, so implementation starts right away.
              yield* ctx.session.switchAgent({ sessionID: context.sessionID, agent: build })
              return {
                output: { approved: true },
                content:
                  "The user approved the plan. You are now the Build agent with full tools: implement the approved plan step by step and verify the result.",
              }
            }).pipe(
              Effect.mapError((error) =>
                error instanceof ToolFailure ? error : new ToolFailure({ message: "Unable to present the plan", error }),
              ),
            ),
        }),
      )
      .pipe(Effect.orDie)
  }),
}
