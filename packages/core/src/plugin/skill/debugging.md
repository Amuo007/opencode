# Systematic debugging

Find the real cause of a bug before changing code.

1. **Reproduce.** Get a reliable reproduction: a failing test, a command, or exact steps. Run it and read the full error and stack trace. If you cannot reproduce it, gather more facts instead of guessing.
2. **Locate.** Follow the stack trace or the data flow to the code involved. Use `lsp` (definition, references, hover) to understand types and callers precisely, and `grep` for strings from error messages.
3. **Hypothesize.** State one specific cause that explains all the symptoms. If several are possible, design a quick check that tells them apart (a log line, a smaller input, a debugger print).
4. **Verify the cause.** Confirm the hypothesis with evidence before fixing. Do not stack speculative changes.
5. **Fix the cause, not the symptom.** Make the smallest change that fixes the root cause. Check other callers that share the same bug.
6. **Prove it.** Add or update a test that failed before the fix and passes after. Re-run the original reproduction and the related test suite. Check `lsp` diagnostics for new errors.
7. **Report.** Explain the cause, the fix and how you verified it. If you changed behavior, say what callers will notice.

For web apps, use the chrome tools: `chrome_console` for errors, `chrome_eval` to inspect state, `chrome_screenshot` to see the result.
