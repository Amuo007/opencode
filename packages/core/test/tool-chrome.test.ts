import { describe, expect, test } from "bun:test"
import { ChromeTools } from "@opencode/core/tool/plugin/chrome"

describe("ChromeTools", () => {
  test("prefers a configured browser path", () => {
    const list = ChromeTools.candidates("darwin", { OPENCODE_BROWSER_PATH: "/custom/chrome" })
    expect(list[0]).toBe("/custom/chrome")
    expect(list).toContain("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
  })

  test("searches PATH on Linux", () => {
    expect(ChromeTools.candidates("linux", { PATH: "/usr/bin:/opt/bin" })).toContain("/opt/bin/chromium")
  })

  test("checks Program Files on Windows", () => {
    const list = ChromeTools.candidates("win32", { PROGRAMFILES: "C:\\Program Files" })
    expect(list.some((item) => item.endsWith("chrome.exe"))).toBe(true)
  })
})

describe("webfetch script shells", () => {
  test("detects JavaScript app shells", async () => {
    const { isScriptShell } = await import("@opencode/core/tool/plugin/webfetch")
    expect(isScriptShell('<div id="root"></div><script src="/app.js"></script>')).toBe(true)
    expect(isScriptShell("<p>Plain page</p>")).toBe(false)
    expect(isScriptShell(`<p>${"long text ".repeat(40)}</p><div id="root"></div><script></script>`)).toBe(false)
  })
})

describe("agent browser addresses", () => {
  test("adds a scheme to typed addresses", () => {
    expect(ChromeTools.normalizeURL("localhost:3000")).toBe("http://localhost:3000")
    expect(ChromeTools.normalizeURL("127.0.0.1:8080/app")).toBe("http://127.0.0.1:8080/app")
    expect(ChromeTools.normalizeURL("example.com")).toBe("https://example.com")
    expect(ChromeTools.normalizeURL(" https://a.dev/x ")).toBe("https://a.dev/x")
    expect(ChromeTools.normalizeURL("about:blank")).toBe("about:blank")
  })

  test("reports no view for a Location without a browser", () => {
    expect(ChromeTools.live("/no/such/location")).toBeUndefined()
    expect(ChromeTools.closedView.open).toBe(false)
  })
})

describe("agent browser network log", () => {
  test("formats requests with status or failure", () => {
    expect(ChromeTools.formatRequest({ id: "1", method: "GET", url: "http://x/api", type: "Fetch", status: 404 })).toBe(
      "GET 404 fetch http://x/api",
    )
    expect(
      ChromeTools.formatRequest({ id: "2", method: "POST", url: "http://x/save", type: "XHR", error: "net::ERR_FAILED" }),
    ).toBe("POST FAILED (net::ERR_FAILED) xhr http://x/save")
    expect(ChromeTools.formatRequest({ id: "3", method: "GET", url: "http://x/slow", type: "Script" })).toBe(
      "GET pending script http://x/slow",
    )
  })
})
