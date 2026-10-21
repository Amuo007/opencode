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
      ChromeTools.formatRequest({
        id: "2",
        method: "POST",
        url: "http://x/save",
        type: "XHR",
        error: "net::ERR_FAILED",
      }),
    ).toBe("POST FAILED (net::ERR_FAILED) xhr http://x/save")
    expect(ChromeTools.formatRequest({ id: "3", method: "GET", url: "http://x/slow", type: "Script" })).toBe(
      "GET pending script http://x/slow",
    )
  })
})

describe("chrome key events", () => {
  test("named keys and characters", () => {
    expect(ChromeTools.keyEvent("Enter", "linux")).toMatchObject({
      key: "Enter",
      windowsVirtualKeyCode: 13,
      text: "\r",
    })
    expect(ChromeTools.keyEvent("a", "linux")).toEqual({
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      modifiers: 0,
      text: "a",
    })
    expect(ChromeTools.keyEvent("+", "linux")).toMatchObject({ key: "+", modifiers: 0, text: "+" })
  })

  test("combinations set modifiers and type no text", () => {
    expect(ChromeTools.keyEvent("Control+A", "linux")).toEqual({
      key: "A",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      modifiers: 2,
    })
    expect(ChromeTools.keyEvent("Shift+Tab", "linux")).toMatchObject({ key: "Tab", modifiers: 8 })
    expect(ChromeTools.keyEvent("Shift+A", "linux")).toMatchObject({ modifiers: 8, text: "A" })
    expect(ChromeTools.keyEvent("Control++", "linux")).toMatchObject({ key: "+", modifiers: 2 })
    expect(ChromeTools.keyEvent("Hello+World", "linux")).toMatchObject({ key: "Hello+World", modifiers: 0 })
  })

  test("editing shortcuts name the command on macOS", () => {
    expect(ChromeTools.keyEvent("Control+a", "darwin")).toMatchObject({ modifiers: 4, commands: ["selectAll"] })
    expect(ChromeTools.keyEvent("Meta+Shift+Z", "darwin")).toMatchObject({ modifiers: 12, commands: ["redo"] })
    expect(ChromeTools.keyEvent("Meta+z", "darwin")).toMatchObject({ commands: ["undo"] })
    expect(ChromeTools.keyEvent("Meta+ArrowLeft", "darwin")).not.toHaveProperty("commands")
    expect(ChromeTools.keyEvent("Control+a", "linux")).not.toHaveProperty("commands")
  })
})
