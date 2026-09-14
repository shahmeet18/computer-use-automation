# Computer-Use Automation System

A system that takes a natural-language goal against a legacy back-office application, uses an LLM
to discover how to accomplish it live ("computer use"), records the successful run as a typed,
versioned **capability artifact**, and replays that artifact **deterministically** (no LLM in the
loop) with structured error handling, safety guardrails, and human-in-the-loop escalation.

Built for interface.ai's take-home assignment — see `Computer-Use Automation System.md` for the
full brief and `REPORT.md` for the design write-up.

> Status: work in progress, built incrementally. This section is updated as each milestone lands.

## Setup

Requirements: Node.js 20+, npm.

```bash
npm install
npx playwright install chromium
cp .env.example .env   # fill in OPENROUTER_API_KEY once the discovery agent milestone lands
```

## Running the mock target app

The target app is a small self-built "legacy bank" back-office app used as the automation target
(see `REPORT.md` → Heterogeneity & multi-tenant for why this stand-in was chosen over a public
site).

```bash
npm run dev:target-app
# -> http://localhost:4000  (login: operator / password123)
```

## Demo path

_To be filled in once the discovery agent (Milestone 3) and replay engine (Milestone 5) land:
the exact command to run the agent on a goal, then replay the resulting artifact._

## Project layout

```
src/target-app/   mock legacy bank app (the automation target)
src/agent/        LLM-driven discovery loop (observe -> decide -> act)
src/artifacts/    capability artifact schema + recorder
src/replay/        deterministic replay engine
src/safety/        allowlist, risky-action policy, redaction
src/operator/      human-in-the-loop escalation / handoff console
capabilities/      saved capability artifacts (JSON)
evidence/          logs/screenshots from discovery + replay runs
```
