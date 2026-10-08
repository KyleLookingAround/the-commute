# Start here

Setup the owner does once; everything else sessions do themselves (`CLAUDE.md`).

1. **Pages.** Settings → Pages → Source: GitHub Actions. Done on 8 October 2026.
2. **Lockfile.** On a machine with npm: `npm install`, commit `package-lock.json`, then change `npm install` back to `npm ci` in `.github/workflows/checks.yml` and `deploy.yml` (the comment marks the lines) and `cache: npm` back onto the setup-node steps.
3. **Ruleset.** Settings → Rules → Rulesets → New branch ruleset for `main`: require a pull request before merging, require status checks to pass with `check` and `Description check` required, block force pushes. Then Settings → General → "Allow auto-merge" on and "Allow squash merging" the only merge method. Until this is done, sessions merge by hand once checks are green.
4. **Labels.** `needs-owner`, `balance`, `bug`, `enhancement` (the templates use them).
5. **Hooks on your own clone.** `git config core.hooksPath .githooks` (the session-start hook does it for web sessions).

## First prompts

The first session in Claude Code, with a compiler to hand:

```
Read CLAUDE.md, then docs/decisions/ADR-2026-10-08-runbook-from-overgrow.md. The TypeScript trigger in that record has fired: convert src/ to TypeScript strict (noUncheckedIndexedAccess, verbatimModuleSyntax) with Vite, keeping node:test for the sim by running the tests through tsx or by keeping the sim's test entry as .mjs importing the built sim. Keep tools/rules.mjs working on .ts files. Run npm run check and npm run shots before opening the PR. Follow the feature playbook.
```

Then the roadmap's "Next up" items, one brief each (`docs/briefs/TEMPLATE.md`), starting with colour, sky and the time-of-day control.
