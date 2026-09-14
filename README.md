# Computer-Use Automation System

A system that takes a natural-language goal against a legacy back-office application, uses an LLM
to discover how to accomplish it live ("computer use"), records the successful run as a typed,
versioned **capability artifact**, and replays that artifact **deterministically** (no LLM in the
loop) with structured error handling, safety guardrails, and human-in-the-loop escalation.

Built for interface.ai's take-home assignment — see `Computer-Use Automation System.md` for the
full brief and [`REPORT.md`](./REPORT.md) for the design write-up (architecture, artifact schema,
determinism/error handling, heterogeneity/multi-tenant, escalation, safety, and cuts).

## Setup

Requirements: Node.js 20+, npm.

```bash
npm install
npx playwright install chromium
cp .env.example .env   # fill in OPENROUTER_API_KEY (https://openrouter.ai/keys) to run the discovery agent
```

`.env` is only needed for the LLM-driven discovery step (`npm run agent:discover`). The target
app, replay engine, and safety/redaction tests all run without any API key or network access.

## Running the mock target app

The target app is a small self-built "legacy bank" back-office app used as the automation target
(see `REPORT.md` → Heterogeneity & multi-tenant for why this stand-in was chosen over a public
site): server-rendered, table-based layout, no test IDs or class hooks, in-memory session and data.

```bash
npm run dev:target-app
# -> http://localhost:4000  (login: operator / password123)
```

Leave this running in one terminal for everything below.

## Demo path

**1. Run the LLM agent on a goal** (requires `OPENROUTER_API_KEY` in `.env`). Add `--headed` to
watch the browser drive itself:

```bash
npm run agent:discover -- --goal "Log in, look up member 12345, open a new checking sub-account for them with a 250 dollar initial deposit, confirm it, and read back the confirmation message." --headed
```

This prints a step-by-step summary and writes the full transcript (redacted) to a new folder under
`evidence/tmp/`, e.g. `evidence/tmp/discovery-log-in-look-up-member-12345.../result.json`, plus a
screenshot/DOM snapshot if the run didn't end in success.

**2. Turn a successful transcript into a reusable capability artifact** (substitute the path printed
by the command above; this example instead points at the transcript already committed under
`evidence/`, so it runs as-is with no discovery step required):

```bash
npm run artifacts:record -- \
  --spec open-sub-account \
  --transcript evidence/discovery-open-sub-account/result.json \
  --out capabilities/open-sub-account.v1.json
```

(A capability recorded this way is already committed at
[`capabilities/open-sub-account.v1.json`](./capabilities/open-sub-account.v1.json), so you can skip
straight to replay below without running discovery or recording first.)

**3. Replay the artifact deterministically** — no LLM, with different inputs than what was
recorded (proving the locator generalizes, not just replays the original member):

```bash
npm run replay -- --capability capabilities/open-sub-account.v1.json \
  --input memberId=23456 --input accountType=checking --input initialDeposit=300 --approve 10
```

`--approve 10` approves the one step flagged as risky/irreversible (the final "Confirm" click,
which actually creates the account) — omit it and replay stops with `status: "blocked"` instead of
executing an unattended irreversible action.

**Exercise the error/business-outcome taxonomy** with the same capability:

```bash
npm run replay -- --capability capabilities/open-sub-account.v1.json --input memberId=99999 --input accountType=checking --input initialDeposit=300           # member_not_found
npm run replay -- --capability capabilities/open-sub-account.v1.json --input memberId=00000 --input accountType=checking --input initialDeposit=300           # permission_denied
npm run replay -- --capability capabilities/open-sub-account.v1.json --input memberId=12345 --input accountType=checking --input initialDeposit=abc --approve 10   # validation_error
npm run replay -- --capability capabilities/open-sub-account.v1.json --input memberId=12345 --input accountType=checking --input initialDeposit=300 --approve 10 --simulate-timeout  # session recovery
```

**Human-in-the-loop escalation** (requires `--headed` so there's a window to take over):

```bash
npm run replay -- --capability capabilities/open-sub-account.v1.json \
  --input memberId=12345 --input accountType=checking --input initialDeposit=300 --escalate --headed
# in another terminal, once it pauses:
npm run operator -- list
npm run operator -- resolve --id <id> --outcome approved --note "reviewed and approved"
```

Or run the fully automated, reproducible proof of the handoff mechanism (a second Playwright
client connects to the *same* live browser over CDP and clicks through as a stand-in for a human):

```bash
npm run operator:demo-handoff
```

## Testing

```bash
npm run typecheck
npm test              # node:test — safety policy/redaction, locator templating, artifact recording
```

## Evidence

[`/evidence/`](./evidence/) has a curated example for every branch of the result taxonomy, each
with a `result.json` (redacted) and, where the run didn't end cleanly, a screenshot/DOM snapshot:
a real LLM discovery run, a discovery run the safety policy blocked mid-goal, a discovery failure,
a clean replay success, a declared business outcome, a genuine hard failure, and the human-handoff
demo. See [`evidence/README.md`](./evidence/README.md) for what each one shows.

## Project layout

```
src/target-app/   mock legacy bank app (the automation target)
src/agent/        perception (accessibility snapshot), actions, and the LLM discovery loop
src/artifacts/    capability artifact schema + recorder
src/replay/       deterministic replay engine + locator resolution
src/safety/       allowlist policy, redaction
src/operator/     human-in-the-loop escalation store + CLI + handoff demo
src/evidence/     shared evidence writer (used by discovery and replay CLIs)
capabilities/     saved capability artifacts (JSON)
evidence/         curated example runs (see evidence/README.md); evidence/tmp/ is scratch, gitignored
safety/policy.json  the configurable allowlist
```
