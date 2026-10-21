export * as WebSearchBuiltin from "./builtin.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Duration, Effect, Scope } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { collectBoundedResponseBody } from "../../tool/http-body.js"

// Keyless search that reads public result pages directly, so web search keeps working when every
// hosted search API is unreachable or rate limited. Engines are tried in order; a CAPTCHA, an
// anti-bot status, or an empty page moves on to the next engine.

export const MAX_RESULTS = 8
const MAX_PAGE_BYTES = 2 * 1024 * 1024
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"

export type Hit = { url: string; title: string; content?: string }

export type Engine = {
  name: string
  url: (query: string) => string
  parse: (html: string) => Hit[]
}

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  middot: "\u00b7",
}

export function text(html: string) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, code: string) => {
      if (entities[code.toLowerCase()]) return entities[code.toLowerCase()]
      if (code.startsWith("#x") || code.startsWith("#X"))
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
      if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10))
      return match
    })
    .replace(/\s+/g, " ")
    .trim()
}

const attribute = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1] ??
  tag.match(new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`, "i"))?.[1]

const isWebURL = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

const unique = (hits: Hit[]) =>
  hits
    .filter((hit, index) => isWebURL(hit.url) && hits.findIndex((other) => other.url === hit.url) === index)
    .slice(0, MAX_RESULTS)

export function duckduckgoTarget(href: string) {
  const decoded = text(href)
  const absolute = decoded.startsWith("//") ? `https:${decoded}` : decoded
  try {
    const url = new URL(absolute)
    return url.searchParams.get("uddg") ?? absolute
  } catch {
    return absolute
  }
}

export function bingTarget(href: string) {
  const decoded = text(href)
  try {
    const url = new URL(decoded)
    const encoded = url.hostname.endsWith("bing.com") ? url.searchParams.get("u") : null
    if (!encoded?.startsWith("a1")) return decoded
    return Buffer.from(encoded.slice(2).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
  } catch {
    return decoded
  }
}

export const duckduckgo: Engine = {
  name: "DuckDuckGo",
  url: (query) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
  parse: (html) =>
    unique(
      html
        .split(/<div class="result(?=[\s"])/)
        .slice(1)
        .flatMap((block) => {
          if (/^[^>]*result--ad/.test(block) || block.includes("badge--ad")) return []
          const anchor = block.match(/<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/)
          const href = anchor ? attribute(anchor[0], "href") : undefined
          if (!anchor || !href) return []
          const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/)?.[1]
          const content = snippet ? text(snippet) : ""
          return [{ url: duckduckgoTarget(href), title: text(anchor[1]), ...(content ? { content } : {}) }]
        }),
    ),
}

export const bing: Engine = {
  name: "Bing",
  url: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en&cc=us`,
  parse: (html) =>
    unique(
      html
        .split(/<li class="b_algo"/)
        .slice(1)
        .flatMap((block) => {
          const heading = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1]
          const anchor = heading?.match(/<a[^>]*>([\s\S]*?)<\/a>/)
          const href = anchor ? attribute(anchor[0], "href") : undefined
          if (!anchor || !href) return []
          const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1]
          const content = snippet ? text(snippet) : ""
          return [{ url: bingTarget(href), title: text(anchor[1]), ...(content ? { content } : {}) }]
        }),
    ),
}

export const mojeek: Engine = {
  name: "Mojeek",
  url: (query) => `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`,
  parse: (html) =>
    unique(
      html
        .split(/<li class="r\d*"|<li>\s*<a class="ob"/)
        .slice(1)
        .flatMap((block) => {
          const anchor =
            block.match(/<a[^>]*class="ob"[^>]*>([\s\S]*?)<\/a>/) ?? block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/)
          const href = anchor ? attribute(anchor[0], "href") : undefined
          if (!anchor || !href) return []
          const title = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1]
          const snippet = block.match(/<p class="s"[^>]*>([\s\S]*?)<\/p>/)?.[1]
          const content = snippet ? text(snippet) : ""
          return [{ url: text(href), title: text(title ?? anchor[1]), ...(content ? { content } : {}) }]
        }),
    ),
}

export const engines = [duckduckgo, bing, mojeek] as const

export function blocked(status: number, html: string) {
  if (status === 202 || status === 403 || status === 429 || status >= 500) return true
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.toLowerCase() ?? ""
  return title.includes("captcha") || /anomaly-modal|g-recaptcha|cf-challenge|challenge-form/i.test(html)
}

export const Plugin = define<HttpClient.HttpClient | Scope.Scope>({
  id: "opencode.websearch.builtin",
  effect: Effect.fn("WebSearchBuiltin.Plugin")(function* (ctx) {
    const http = yield* HttpClient.HttpClient
    const fetchPage = (url: string) =>
      Effect.gen(function* () {
        const response = yield* HttpClient.withScope(http).execute(
          HttpClientRequest.get(url).pipe(
            HttpClientRequest.setHeaders({
              "User-Agent": userAgent,
              Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
            }),
          ),
        )
        const body = yield* collectBoundedResponseBody(
          response,
          MAX_PAGE_BYTES,
          () => new Error(`search page exceeded ${MAX_PAGE_BYTES} bytes`),
        )
        return { status: response.status, html: body.toString("utf8") }
      }).pipe(
        Effect.scoped,
        Effect.timeoutOrElse({
          duration: Duration.seconds(15),
          orElse: () => Effect.fail(new Error(`search page request timed out: ${url}`)),
        }),
      )

    yield* ctx.websearch.transform((editor) => {
      editor.add({
        id: "builtin",
        name: "Built-in (DuckDuckGo, Bing, Mojeek)",
        execute: (input) =>
          Effect.gen(function* () {
            const failures: string[] = []
            for (const engine of engines) {
              const page = yield* fetchPage(engine.url(input.query)).pipe(Effect.result)
              if (page._tag === "Failure") {
                failures.push(`${engine.name}: ${String(page.failure)}`)
                continue
              }
              if (blocked(page.success.status, page.success.html)) {
                failures.push(`${engine.name}: blocked (HTTP ${page.success.status})`)
                continue
              }
              const hits = engine.parse(page.success.html)
              if (hits.length) return hits.map((hit) => ({ ...hit, time: {} }))
              failures.push(`${engine.name}: no results`)
            }
            return yield* Effect.fail(new Error(`Built-in web search found nothing (${failures.join("; ")})`))
          }),
      })
    })
  }),
})
