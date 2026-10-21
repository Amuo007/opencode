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
