# Git workflow

Keep history clean and never lose the user's work.

- Run `git status` and `git diff` before committing. Commit only files that belong to the change; never commit secrets, `.env` files, build output or large binaries.
- Write commit messages as `type(scope): summary` (feat, fix, docs, refactor, test, chore) with a short body explaining why, unless the repository uses another convention (check `git log --oneline -20`).
- Work on a branch for anything non-trivial: `git switch -c short-name`. Do not commit directly to `main` or the default branch unless the user asks.
- Make small, focused commits that each build and pass tests.
- Never run destructive commands (`git reset --hard`, `git push --force`, `git clean -fd`, `git checkout -- .`, `git branch -D`) without the user's explicit approval. Stash or commit first if work could be lost.
- Before pushing, pull or rebase onto the latest base branch and re-run tests.
- For pull requests, use `gh pr create` with a title in the same style and a body that explains what changed, why, and how it was tested. Check CI with `gh pr checks`.
- When resolving conflicts, understand both sides before choosing; run the tests after resolving.
