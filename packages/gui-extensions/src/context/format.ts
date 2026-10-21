export function createSessionContextFormatter(locale: string) {
  // The fields luxon's DATETIME_MED preset passed to Intl; output is identical.
  const dateTime = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  })

  return {
    number(value: number | null | undefined) {
      if (value === undefined) return "—"

      if (value === null) return "—"

      return value.toLocaleString(locale)
    },
    percent(value: number | null | undefined) {
      if (value === undefined) return "—"

      if (value === null) return "—"

      return value.toLocaleString(locale) + "%"
    },
    time(value: number | undefined) {
      if (!value) return "—"

      return dateTime.format(value)
    },
  }
}

type TimedMessage = {
  type: string
  time: { created: number; streamed?: number; completed?: number }
  tokens?: { output: number; reasoning: number }
}

/** Generated tokens per second for the latest reply and across the session (time includes reading the prompt). */
export function outputSpeed(messages: readonly TimedMessage[]) {
  const samples = messages.flatMap((message) => {
    if (message.type !== "assistant" || !message.tokens) return []
    const end = message.time.streamed ?? message.time.completed
    const tokens = message.tokens.output + message.tokens.reasoning
    if (!end || end <= message.time.created || tokens <= 0) return []
    return [{ tokens, seconds: (end - message.time.created) / 1000 }]
  })
  const last = samples.at(-1)
  const total = samples.reduce((sum, item) => ({ tokens: sum.tokens + item.tokens, seconds: sum.seconds + item.seconds }), {
    tokens: 0,
    seconds: 0,
  })
  return {
    last: last ? last.tokens / last.seconds : undefined,
    average: total.seconds > 0 ? total.tokens / total.seconds : undefined,
  }
}
