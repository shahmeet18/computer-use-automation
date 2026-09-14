# Design Write-Up

## 1. Architecture

A single TypeScript/Node process, no services or queues — the task is one target app end to end,
and building scaling infrastructure for a single-tenant proof of concept would add complexity with
no payoff. Six modules, each with one job: `target-app` (the mock legacy bank app being automated), `agent`
(perception, action, and the LLM discovery loop), `artifacts` (the capability schema and
recorder), `replay` (the deterministic execution engine), `safety` (policy and redaction), and
`operator` (escalation).

Perception is Playwright's `ariaSnapshotJSON({mode:'ai'})` plus its `aria-ref=` locator engine —
the same primitive behind Playwright's own MCP server. It gives every element a stable-for-this-
snapshot `ref`, resolved via role + accessible name rather than raw DOM/CSS, which is what keeps
working on table-based, test-id-free markup. This was a deliberate choice over screenshot+vision:
it's cheaper, faster, and the target environment (legacy enterprise apps) still renders standard
HTML controls even when styled badly, so semantic locators remain available.

The LLM is accessed through OpenRouter, so the model is a config string
(`OPENROUTER_MODEL`), not a code dependency — "your call" on model choice stays genuinely free
for as long as the deployment needs it to.

Two functions are the entire surface between "how we perceive/act on a page" and everything else:
`perceive()` and `performAction()`. The LLM loop, the artifact schema, and the replay engine only
ever see `PageSnapshot` / `PerceivedElement` / `AgentAction` — never a `Page` object directly
except inside those two functions and the replay engine's own locator resolver. That seam is what
makes the heterogeneity story in §4 credible instead of aspirational.

## 2. Artifact schema

A `Capability` is versioned JSON: `inputSchema`/`outputSchema` (typed, per-field description),
ordered `steps[]`, a `checkpoint`, declared `businessOutcomes[]`, and `provenance` back to the
discovery run it came from. Each step carries a human-readable `description` (so a reviewer or a
calling agent understands what it does without parsing locator internals) and a `LocatorDescriptor`:
a **ranked list** of strategies (role+name, then plain text) rather than one selector — replay
tries them in order and records which one resolved, which is both the mechanism and the drift
signal discussed in §3.

The single most important schema decision is **automatic locator templating**. Recording once
against member 12345 produces a step whose accessible name is literally "View member 12345" — if
that were stored verbatim, the artifact would only ever work for member 12345, defeating the
premise of a reusable capability. The recorder detects when an already-declared input's recorded
value appears verbatim inside a *later* step's element name and replaces it with a `{{memberId}}`
placeholder, resolved from the caller's actual input at replay time. Verified this generalizes for
real: replayed the recorded artifact against a member never used during recording and it worked.

Recording is **human-curated, not automatic**: a `RecordingSpec` is how a person, after reading a
discovery transcript, declares which steps belong in the reusable capability, which of their
values become typed inputs/outputs, which page states are known business outcomes, and which
steps are risky. Login is deliberately **excluded** from every recorded capability — session
establishment is the replay host's job, not a per-capability concern, and credentials must never
be persisted into a versioned, checked-into-git artifact file.

## 3. Determinism & error handling

Replay executes a capability's steps directly against Playwright, no LLM in the loop. Determinism
comes from three things: the same ranked-locator resolution every time (first strategy that
matches ≥1 element wins, deterministically — no model judgment involved); explicit checkpoint
verification after all steps, instead of assuming the last click worked; and business outcomes
checked after *every* step, so a known non-happy-path page state is classified immediately rather
than falling through and producing a confusing failure three steps later.

The result is a discriminated union: `success` (with typed outputs), `business_outcome` (id +
description — "no such member" is data, not a crash), `failure` (which step, what was expected,
what was actually observed, the raw error), or `blocked` (a risky step withheld). Business outcomes
are **declared per capability**, not inferred, because only the person who recorded it has actually
seen the app's real error states — this is also why the taxonomy doesn't collapse "no such member"
and "the server threw a 500" into the same bucket, which is one of the most common design mistakes
in systems like this.

Session expiry is handled as its own recoverable class: if replay is unexpectedly redirected to a
login-like URL, it re-authenticates once and retries the *entire capability* from a clean start
URL. Retrying the whole idempotent operation after re-auth was chosen over trying to resume
mid-step because the mock app has no "redirect back to where you were" semantics — a real app that
did support that could resume more precisely, but the simple version generalizes to any capability
with zero extra per-capability logic.

Locator drift (the "secondarily, UI drift" case) surfaces as a **signal, not a failure**: each step
log records which ranked strategy actually resolved. A run that succeeds via the fallback `text`
strategy instead of the primary `role+name` one still returns `success`, but that log entry is a
concrete, actionable flag that the artifact should be reviewed before it degrades further.

All of this was verified against real runtime conditions produced by the actual mock app, not
fabricated: member-not-found, permission-denied, a validation error, a simulated session timeout
with real recovery, and one genuine hard failure (an invalid `accountType` value that made
Playwright's own `selectOption` time out) — see `/evidence/`.

## 4. Heterogeneity & multi-tenant

**Surface abstraction.** Because `perceive()`/`performAction()` are the only code that touches
Playwright, porting to a worse-behaved legacy web app needs no change above that seam — at most a
new `LocatorStrategy` kind (e.g. a coordinate/bounding-box fallback for elements with no
accessible role at all; the type is already a discriminated union, so this is additive). Porting to
a **desktop app** means reimplementing `perceive()`/`performAction()` against an OS accessibility
API (Windows UI Automation, macOS AX, or AT-SPI on Linux) — all of which expose the same
role-plus-name concept `ariaSnapshotJSON` already gave us — while the `Capability` schema and the
entire replay engine stay untouched. The seam is exactly two functions and nowhere else.

**Multi-tenant reuse.** The schema already separates "what varies per call" (`inputSchema`,
resolved at invocation time) from "what's structural" (locators, checkpoint, business outcomes).
The natural third axis for a system with many institutions on the same vendor product — not built,
see §7 — is "what varies per tenant": a
`overrides: Record<tenantId, Partial<LocatorDescriptor>>` keyed by step, letting one artifact serve
every tenant on the same vendor product's version while a tenant whose instance is skinned or
relabeled differently gets a small, explicit override instead of a full re-recording. This slots
directly into the existing ranked-strategy resolution — an override would just be inserted at the
front of that list for a given tenant.

**Drift/version detection across tenants.** The same locator-drift signal from §3 is the detection
mechanism here too: if a given tenant's replays consistently resolve via a fallback strategy rather
than the primary one, that's a per-tenant signal the underlying app version or configuration
differs there, worth flagging for review before a real break happens.

None of the override/desktop machinery is implemented — deliberately: without real tenants or a
real desktop target to validate against, building it now would be speculative. What's real is that
nothing in `Capability`, `LocatorDescriptor`, or the replay engine assumes one tenant or one
surface type.

## 5. Escalation & handoff

**Detecting stuck.** Two triggers, both signals the system already produces rather than new
detectors bolted on: the LLM's own explicit `finish(status:'stuck')` call during discovery, when it
judges there's no safe path forward; and, during replay, either a step flagged
`requiresConfirmation` being reached unattended, or a step throwing a genuine error that isn't a
declared business outcome.

**Taking control.** The automation session is a real, visible (headed) Playwright browser window —
not a screenshot feed, not a fresh session. A human takes over by clicking directly into that OS
window. This was verified concretely, not just asserted: `src/operator/demo-handoff.ts` connects a
**second, independent Playwright client over CDP to the exact same running browser instance**,
performs a click as a stand-in for a human, and the paused automation resumes and finishes — proof
the "same live session" claim actually holds.

**Signal resume / who's in control.** An `InterventionRequest` (file-backed: reason, screenshot,
current URL, status) is the coordination point between the paused process and an operator acting
from a different terminal. Its `status` field *is* the answer to "who's in control": `pending` =
the human owns the window; `resolved` = control is back with automation. The paused process blocks
on `waitForResume()`, polling with a timeout that itself resolves to `abandoned` so a run can never
hang forever.

**Resume semantics** differ by outcome, verified live for both: `approved` executes the risky step
programmatically now (the human decided it's fine, do it); `manual` assumes the human already
performed the equivalent action, so execution continues from the next step without repeating it;
`retry` re-attempts the same step (a transient hard failure); `abandoned` always ends cleanly.
Discovery resumption is genuine continuation, not "let the human finish by hand": after resume, the
loop re-perceives the page and the LLM keeps deciding, so a human can unblock one dead end and hand
the rest back.

**Scope cut, by design:** the operator "console" is a two-command CLI
(`list`/`resolve`), not a co-browsing UI. A real product would put an HTTP API and a small page
with a live screenshot and a resume button on top of exactly the same `InterventionRequest` model —
the control-transfer model doesn't change, only the surface does.

## 6. Safety

**Allowlist.** `safety/policy.json` (allowed origins + action types) is enforced through one
function, `checkAction()`, called identically from the discovery loop (before every model-chosen
action) and the replay engine (before every step) — one policy, one enforcement point. Verified
live rather than only unit-tested: a discovery goal explicitly asked the agent to also visit an
external site; the model actually attempted the `navigate` call, policy blocked it, and the model
adapted and finished the rest of the goal. The block is recorded on the transcript
(`policyBlocks`), so the guardrail leaves evidence of itself instead of silently vanishing.

**Risky/irreversible handling.** Capability steps carry a per-step `requiresConfirmation` flag,
declared by whoever recorded the capability (they know which step is the point of no return) —
`open-sub-account`'s "Confirm" click (the POST that actually creates the account) is flagged;
"Continue" (a review screen) is not. Unattended replay refuses these by default; they only execute
with an explicit per-invocation approval. Conservative-by-default was chosen over "warn and
proceed" because the domain is regulated financial transactions.

**Redaction.** `redactDeep()` walks every field of anything about to be written to disk — discovery
transcripts, replay results, evidence — scrubbing declared secret values (login credentials) plus
pattern-based PII (SSN- and card-number-shaped digit runs) as a safety net beyond what's explicitly
declared. The stronger version of "don't persist secrets" is applied to the artifact itself: login
is excluded from recorded capabilities entirely (§2), not redacted after the fact.

**Limits.** The allowlist is origin-level, not route-level — a route-level policy (e.g. deny `POST
/sub-account/confirm` outright, so irreversible actions can *only* ever go through the
`requiresConfirmation` gate rather than relying on a human remembering to flag every risky step at
recording time) is a natural next layer. PII redaction is pattern-based and will miss shapes it
doesn't recognize (a bare name, for instance). `requiresConfirmation` is a static, recorder-time
judgment; it isn't re-evaluated if a capability's steps change shape after drift.

## 7. Cuts

- **Screenshot/coordinate perception fallback** — designed for (`LocatorStrategy` is already a
  discriminated union; a `coordinates` kind is additive) but not built, since the mock app didn't
  need it.
- **CSS/XPath as a third locator tier** — role+name and text-match covered every real scenario
  here; a low-risk addition if a real app ever defeats both.
- **Multi-tenant overrides and a desktop-surface implementation** — designed for (§4), not built:
  without real tenants or a real desktop target to validate against, building it now would be
  speculative rather than useful.
- **Discovery escalation only on the explicit `stuck` signal**, not `timeout`/`max_steps_exceeded`/
  `error` — same mechanism, just not wired to every exit path yet.
- **Route-level allowlist** — only origin-level exists today (§6).
- **No screen recording** — the CDP-verified handoff demo plus committed screenshots/DOM snapshots
  serve the same evidentiary purpose without the overhead of video capture.
- **Extra features beyond the core** (an agent-facing capability catalog API, codegen from an
  artifact, confidence scoring/approval gating, assisted LLM recovery on replay failure,
  cross-tenant canonicalization, multi-run stability testing) were not attempted. Time went into
  making every core capability — the agent loop, the artifact, replay, safety, evidence, and
  escalation — real and independently verified rather than adding an extra feature on top of a
  thinner core.
