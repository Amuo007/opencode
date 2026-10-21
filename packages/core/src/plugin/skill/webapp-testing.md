# Web app testing

Test a web app the way a user would, with the built-in headless Chrome tools, and fix what you find.

## Workflow

1. Start the app with the shell tool in the background (`background: true`), for example `npm run dev`, `bun run dev` or `python3 -m http.server 8000`. Read its output file to learn the URL and port. Never block on a dev server in the foreground.
2. `chrome_open` the URL. If the page needs time to load data, use `chrome_wait` for a piece of text or a selector.
3. `chrome_snapshot` to read the page. It numbers every link, button and input; act on those numbers with `chrome_click`, `chrome_type` (set `submit: true` to press Enter), `chrome_select` for dropdowns and `chrome_press` for keys. Take a fresh snapshot after the page changes, because refs come from the latest snapshot.
4. `chrome_screenshot` to check layout and styling with your own eyes. Use `fullPage: true` for long pages.
5. `chrome_console` after each flow to catch JavaScript errors and failed requests (404s, CORS, 500s). Treat every error as a bug unless you can explain it.
6. `chrome_eval` for checks the other tools cannot do: app state, `localStorage`, computed styles, element counts.

## What to verify

- Every feature in the request works end to end: create, edit, delete, navigation, validation messages, empty states.
- State survives a reload when it should (`chrome_open` the same URL again).
- No console errors and no failed network requests.
- The page looks right: nothing overlaps, text is readable, controls are aligned.

## Fix loop

When something fails: read the relevant code, fix it, reload with `chrome_open`, and repeat the same steps until it passes. Report what you tested, what failed, what you changed and the final result. Stop background servers you started when you are done unless the user wants them running.
