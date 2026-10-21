# Frontend design

Build interfaces that look deliberate and finished, then check them visually.

## Before writing code

- Decide the purpose of each screen and its most important action. Give that action the strongest visual weight.
- Pick a small system and stick to it: one font family (two at most), a type scale (for example 12/14/16/20/28/40 px), a spacing scale (4/8/12/16/24/32/48 px), a corner radius, and 1-2 accent colors on neutral grays.
- Define colors and sizes as CSS custom properties on `:root`, and add a dark theme with `@media (prefers-color-scheme: dark)` when it fits the product.

## Layout and detail

- Use CSS grid and flexbox; align things to a shared edge; keep line length around 60-75 characters for reading text.
- Give interactive elements clear hover, focus-visible, active and disabled states. Make hit areas at least 40 px.
- Design empty, loading and error states, not just the happy path.
- Prefer subtle borders and soft shadows over heavy outlines. Avoid more than three levels of emphasis on one screen.
- Use semantic HTML (button, nav, main, label, form) so the page works with the keyboard and screen readers. Every input needs a label.
- Make it responsive: check that nothing overflows at phone width (about 375 px) and that wide screens do not stretch content edge to edge.

## Check your work

Open the page with `chrome_open`, look at it with `chrome_screenshot`, and fix spacing, alignment and contrast issues you see. Check responsive layouts with `chrome_resize` (`preset: "phone"`, `"tablet"`, `"desktop"`) followed by `chrome_screenshot`, then switch back with `preset: "laptop"`. Iterate until it looks polished, then describe the design choices briefly.
