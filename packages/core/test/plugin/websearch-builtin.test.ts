import { describe, expect, test } from "bun:test"
import { WebSearchBuiltin } from "@opencode/core/plugin/websearch/builtin"

const duckduckgoPage = `<div id="links" class="results">
  <div class="result results_links results_links_deep web-result ">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fbun.sh%2F&amp;rut=540c">Bun &mdash; A fast all-in-one JavaScript runtime</a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fbun.sh%2F">Bundle, install, and run JavaScript &amp; TypeScript &#8212; all in <b>Bun</b>.</a>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result result--ad">
    <div class="links_main links_deep result__body">
      <h2 class="result__title"><a class="result__a" href="https://ads.example.com">Ad</a></h2>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result ">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FBun_(software)&amp;rut=0022">Bun (software) - Wikipedia</a>
      </h2>
    </div>
  </div>
</div>`

const bingPage = `<ol id="b_results"><li class="b_algo" data-id iid=SERP.5348><div class="b_tpcn"></div>
  <h2><a href="https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1aHR0cHM6Ly9idW4uc2gvZG9jcw&amp;ntb=1" h="ID=SERP">Bun <strong>docs</strong></a></h2>
  <div class="b_caption"><p class="b_lineclamp2">Bun is a fast JavaScript runtime &amp; toolkit.</p></div></li>
  <li class="b_algo"><h2><a href="https://example.com/direct">Direct link</a></h2></li></ol>`

const mojeekPage = `<ul class="results-standard"><li class="r1"><a class="ob" href="https://bun.sh/">bun.sh</a>
  <h2><a class="title" href="https://bun.sh/">Bun runtime</a></h2><p class="s">A fast runtime.</p></li></ul>`

describe("WebSearchBuiltin", () => {
  test("parses DuckDuckGo results, unwraps redirect links, and skips ads", () => {
    expect(WebSearchBuiltin.duckduckgo.parse(duckduckgoPage)).toEqual([
      {
        url: "https://bun.sh/",
        title: "Bun \u2014 A fast all-in-one JavaScript runtime",
        content: "Bundle, install, and run JavaScript & TypeScript — all in Bun.",
      },
      { url: "https://en.wikipedia.org/wiki/Bun_(software)", title: "Bun (software) - Wikipedia" },
    ])
  })

  test("parses Bing results and decodes tracking links", () => {
    expect(WebSearchBuiltin.bing.parse(bingPage)).toEqual([
      { url: "https://bun.sh/docs", title: "Bun docs", content: "Bun is a fast JavaScript runtime & toolkit." },
      { url: "https://example.com/direct", title: "Direct link" },
    ])
  })

  test("parses Mojeek results", () => {
    expect(WebSearchBuiltin.mojeek.parse(mojeekPage)).toEqual([
      { url: "https://bun.sh/", title: "Bun runtime", content: "A fast runtime." },
    ])
  })

  test("detects anti-bot pages", () => {
    expect(WebSearchBuiltin.blocked(202, "")).toBe(true)
    expect(WebSearchBuiltin.blocked(200, "<html><head><title>Captcha</title></head></html>")).toBe(true)
    expect(WebSearchBuiltin.blocked(200, '<div class="anomaly-modal"></div>')).toBe(true)
    expect(WebSearchBuiltin.blocked(200, duckduckgoPage)).toBe(false)
  })

  test("strips tags and decodes entities", () => {
    expect(WebSearchBuiltin.text("<b>A</b> &amp; &#x42; &#67;&nbsp;d")).toBe("A & B C d")
  })
})

describe("websearch domain filters", () => {
  test("scopes queries and filters results by domain", async () => {
    const { WebSearchTool } = await import("@opencode/core/tool/plugin/websearch")
    const input = { query: "bun test", allowed_domains: ["bun.sh"], blocked_domains: ["spam.bun.sh"] }
    expect(WebSearchTool.scopedQuery(input)).toBe("bun test site:bun.sh")
    expect(WebSearchTool.scopedQuery({ query: "plain" })).toBe("plain")
    expect(
      WebSearchTool.filterResults(input, [
        { url: "https://bun.sh/docs" },
        { url: "https://www.bun.sh/x" },
        { url: "https://spam.bun.sh/y" },
        { url: "https://example.com" },
      ]).map((item) => item.url),
    ).toEqual(["https://bun.sh/docs", "https://www.bun.sh/x"])
  })
})
