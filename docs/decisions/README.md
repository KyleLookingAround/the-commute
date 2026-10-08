# Decision records

Short records of decisions that shape the code or the way of working, so later changes know what they must keep and why.

- One decision per file: `ADR-YYYY-MM-DD-short-slug.md`, dated the day it was made, with **Status**, **Context**, **Options considered**, **Decision** and **Consequences**.
- A record is approved when the PR that adds it is merged. Until then it's a proposal.
- Don't rewrite an approved record. To change course, add a new one and mark the old one `Superseded` with a link to its replacement.
- Write one when a change sets a rule other changes must follow, rules out an obvious alternative, or would surprise someone reading the code later.

| Record | Decision |
| --- | --- |
| [ADR-2026-10-08-runbook-from-overgrow](ADR-2026-10-08-runbook-from-overgrow.md) | The runbook comes from Overgrow and Final Call, trimmed to a new game |
| [ADR-2026-10-08-layers-and-seeded-sim](ADR-2026-10-08-layers-and-seeded-sim.md) | Four layers, a pure seeded sim, and a bot from the first line |
| [ADR-2026-10-08-no-save-compatibility-before-release](ADR-2026-10-08-no-save-compatibility-before-release.md) | No save compatibility before the first release |
| [ADR-2026-10-08-network-and-kits](ADR-2026-10-08-network-and-kits.md) | The line is a corridor in real coordinates; stations are data kits with upgrade-gated parts |
