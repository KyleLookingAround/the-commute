# Start here

Setup the owner does once; everything else sessions do themselves (`CLAUDE.md`).

1. **Pages.** Settings → Pages → Source: GitHub Actions. Done on 8 October 2026.
2. **Lockfile.** `package-lock.json` is committed and the workflows use `npm ci` with the npm cache. Done on 8 October 2026.
3. **Ruleset (at the first release, not before).** Settings → Rules → Rulesets → New branch ruleset for `main`: require a pull request before merging, require status checks to pass with `check` and `Description check` required, block force pushes. Then Settings → General → "Allow auto-merge" on and "Allow squash merging" the only merge method. During the prototype phase sessions push straight to `main`.
4. **Labels.** `needs-owner`, `balance`, `bug`, `enhancement` (the templates use them).
5. **Hooks on your own clone.** `git config core.hooksPath .githooks` (the session-start hook does it for web sessions).

## First prompts

The TypeScript conversion the runbook record named as the first task is done (8 October 2026): `src/` and `test/` are strict TypeScript, the build type-checks, and the tools load the sim through `tsx`.

Next: the roadmap's "Next up" items, one brief each (`docs/briefs/TEMPLATE.md`), starting with colour, sky and the time-of-day control.
