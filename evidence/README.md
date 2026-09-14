# Evidence index

The saved capability artifact this evidence corresponds to is
[`capabilities/open-sub-account.v1.json`](../capabilities/open-sub-account.v1.json), recorded from
`discovery-open-sub-account/` below. Every `result.json` here has passed through the redaction
layer (`src/safety/redaction.ts`); `evidence/tmp/` (gitignored) is scratch space for runs made
while developing/verifying and isn't part of this curated set.

| Folder | What it shows |
|---|---|
| `discovery-open-sub-account/` | The required real LLM-driven discovery run: goal "log in, look up member 12345, open a new checking sub-account with a $250 deposit, confirm it, and read back the confirmation message" completed in 12 steps via OpenRouter/Claude, no scripted actions. This is the transcript `capabilities/open-sub-account.v1.json` was recorded from. |
| `discovery-policy-block-example/` | A real discovery run where the goal explicitly asked the agent to also navigate to an external site. The model actually attempted the `navigate` call; the safety allowlist blocked it (`policyBlocks` in the transcript); the model adapted and completed the rest of the goal. |
| `discovery-max-steps-exceeded-example/` | A genuine discovery failure (`--max-steps 3`, too few to finish) with the richer failure signal: `failure.png` screenshot + `failure.html` DOM snapshot captured at the point it gave up. |
| `replay-success-example/` | Deterministic replay of the capability against a member (23456) never used during recording — proves the auto-templatized locator (`"View member {{memberId}}"`) generalizes rather than only replaying the original recording. |
| `replay-business-outcome-example/` | Replay with `memberId=99999`: the declared `member_not_found` business outcome, detected and reported cleanly rather than surfacing as a crash. |
| `replay-failure-example/` | A genuine hard failure, not simulated: `accountType=gold` (not a real option) makes Playwright's own `selectOption` retry and time out. `failure.png` shows the form still sitting on the unchanged "Savings" default, which is exactly what makes the screenshot useful for debugging. |
| `replay-escalation-manual-handoff/` | Human-in-the-loop escalation and handoff, verified end-to-end: replay pauses at the risky "Confirm" step (`intervention.json` + `intervention-screenshot.png`), a *separate* Playwright client connects over CDP to the exact same running browser and clicks Confirm itself (standing in for a human), resolves the intervention as `manual`, and the paused replay resumes and completes (`demo-output.txt`). Reproduce with `npm run operator:demo-handoff`. |

Together these cover the full replay result taxonomy (`success` / `business_outcome` / `failure` /
`blocked`-then-resumed) and both required real-run categories (one discovery run, multiple replay
runs, including an error/exceptional state) called for in the assignment's deliverables section.
