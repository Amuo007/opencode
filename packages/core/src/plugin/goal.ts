export * as GoalPlugin from "./goal.js"

import { ToolFailure } from "@opencode/ai"
import { define } from "@opencode/plugin/effect/plugin"
import { Session } from "@opencode/schema/session"
import { Effect, Schema, Stream } from "effect"

// /goal <condition>: keep the agent working across turns until it calls goal_complete. After
// every finished turn the session is prompted to continue, up to MAX_ROUNDS. "/goal stop",
// an interrupted or failed turn, or reaching the limit ends the goal.

export const MAX_ROUNDS = 25
export const tool = "goal_complete"

type Goal = { condition: string; rounds: number }

export const kickoff = (condition: string) =>
  `Goal: ${condition}

Work autonomously until this goal is fully achieved and verified (run the code, the tests or the app to check). Do not stop to ask for confirmation unless something is truly blocked. When the goal is achieved and verified, call ${tool} with a short summary and the evidence. If it cannot be achieved, call ${tool} with achieved=false and explain why.`

export const nudge = (goal: Goal) =>
  `The goal is not marked complete yet (round ${goal.rounds} of ${MAX_ROUNDS}): ${goal.condition}

Continue working toward it. Verify your work. When it is achieved and verified, call ${tool}; if it cannot be achieved, call ${tool} with achieved=false and explain why.`

export const Plugin = define({
  id: "opencode.goal",
  effect: Effect.fn("GoalPlugin")(function* (ctx) {
    const goals = new Map<string, Goal>()

    yield* ctx.command.transform((editor) =>
      editor.add({
        name: "goal",
        description: "Keep working until a goal is achieved (/goal <condition>, /goal stop)",
        execute: (input) =>
          Effect.gen(function* () {
            const condition = input.prompt.text.trim()
            if (!condition || condition === "stop" || condition === "clear") {
              const had = goals.delete(input.sessionID)
              yield* ctx.session.synthetic({
                sessionID: input.sessionID,
                text: had ? "Goal cleared." : "No active goal. Use /goal <condition> to start one.",
              })
              return
            }
            goals.set(input.sessionID, { condition, rounds: 0 })
            yield* ctx.session.prompt({ ...input.prompt, sessionID: input.sessionID, text: kickoff(condition), delivery: input.delivery })
          }),
      }),
    )

    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name: tool,
          options: { codemode: false },
          description: `Mark the active /goal as finished. Call it only when the goal is achieved and verified, or with achieved=false when it cannot be achieved.`,
          input: Schema.Struct({
            summary: Schema.String.annotate({ description: "What was done and the evidence it works" }),
            achieved: Schema.optionalKey(Schema.Boolean).annotate({ description: "false if the goal cannot be achieved" }),
          }),
          output: Schema.Struct({ cleared: Schema.Boolean }),
          execute: (input, context) =>
            Effect.gen(function* () {
              const goal = goals.get(context.sessionID)
              if (!goal) return yield* new ToolFailure({ message: "There is no active goal in this session." })
              goals.delete(context.sessionID)
              const status = input.achieved === false ? "stopped (not achievable)" : "complete"
              return {
                output: { cleared: true },
                content: `Goal ${status} after ${goal.rounds} follow-up rounds: ${goal.condition}\nTell the user the result.`,
              }
            }),
        }),
      )
      .pipe(Effect.orDie)

    // The completion tool only exists while a goal is active.
    yield* ctx.session.hook("context", (event) =>
      Effect.sync(() => {
        if (!goals.has(event.sessionID)) delete event.tools[tool]
      }),
    )

    yield* ctx.event.subscribe().pipe(
      Stream.runForEach((event) =>
        Effect.gen(function* () {
          if (
            event.type !== "session.execution.succeeded" &&
            event.type !== "session.execution.failed" &&
            event.type !== "session.execution.interrupted"
          )
            return
          const sessionID = Session.ID.make(String((event.data as { sessionID: string }).sessionID))
          const goal = goals.get(sessionID)
          if (!goal) return
          if (event.type !== "session.execution.succeeded") {
            goals.delete(sessionID)
            return
          }
          if (goal.rounds >= MAX_ROUNDS) {
            goals.delete(sessionID)
            yield* ctx.session.synthetic({
              sessionID,
              text: `Goal stopped after ${MAX_ROUNDS} rounds without being marked complete: ${goal.condition}`,
            })
            return
          }
          goal.rounds += 1
          yield* ctx.session.prompt({ sessionID, text: nudge(goal), delivery: "queue" })
        }).pipe(Effect.catchCause((cause) => Effect.logWarning("goal follow-up failed", { cause }))),
      ),
      Effect.forkScoped({ startImmediately: true }),
    )
  }),
})
