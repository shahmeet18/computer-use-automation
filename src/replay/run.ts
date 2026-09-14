/**
 * CLI to deterministically replay a saved capability artifact -- no LLM.
 *
 *   npm run dev:target-app                     (terminal 1)
 *   npm run replay -- --capability capabilities/open-sub-account.v1.json \
 *     --input memberId=12345 --input accountType=checking --input initialDeposit=300
 *
 * Exercise the declared business outcomes with the same capability:
 *   --input memberId=99999   (member_not_found)
 *   --input memberId=00000   (permission_denied)
 *   --input initialDeposit=abc  (validation_error)
 *
 * Demonstrate session recovery:
 *   --simulate-timeout
 *
 * Demonstrate the risky-step gate: the "Confirm" step is flagged requiresConfirmation, so a
 * plain run stops with status "blocked" before it. Approve it explicitly to let replay through:
 *   --approve 10
 *
 * Human-in-the-loop escalation: pass --escalate --headed so a blocked risky step or a hard
 * failure pauses the run and raises an intervention instead of ending it. From another terminal:
 *   npm run operator -- list
 *   npm run operator -- resolve --id <id> --outcome approved|retry|manual|abandoned [--note "..."]
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import type { Capability } from '../artifacts/schema.js';
import { writeEvidence } from '../evidence/writer.js';
import { replay } from './engine.js';
import type { SessionConfig } from './types.js';

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function multiArg(flag: string): string[] {
  return process.argv.flatMap((a, i) => (a === flag ? [process.argv[i + 1]] : []));
}

function buildSession(baseUrl: string): SessionConfig {
  return {
    isLoginUrl: (url) => url.includes('/login'),
    async reauthenticate(page: Page) {
      await page.goto(`${baseUrl}/login`);
      await page.getByRole('textbox', { name: 'Username' }).fill('operator');
      await page.getByRole('textbox', { name: 'Password' }).fill('password123');
      await page.getByRole('button', { name: 'Log In' }).click();
      await page.waitForURL('**/search');
    },
  };
}

async function main() {
  const capabilityPath = arg('--capability');
  if (!capabilityPath) {
    console.error(
      'Usage: npm run replay -- --capability <path> [--input key=value ...] [--simulate-timeout] [--headed]',
    );
    process.exit(1);
  }

  const capability = JSON.parse(await fs.readFile(capabilityPath, 'utf8')) as Capability;
  const inputs = Object.fromEntries(
    multiArg('--input').map((kv) => {
      const idx = kv.indexOf('=');
      return [kv.slice(0, idx), kv.slice(idx + 1)];
    }),
  );

  const missing = Object.keys(capability.inputSchema).filter((k) => !(k in inputs));
  if (missing.length > 0) {
    console.error(`Missing required input(s): ${missing.join(', ')}`);
    process.exit(1);
  }

  const headed = process.argv.includes('--headed');
  const simulateTimeout = process.argv.includes('--simulate-timeout');
  const startUrl = `${capability.target.baseUrl}${capability.target.entryPath}${simulateTimeout ? '?simulateTimeout=1' : ''}`;
  const approvedStepIndices = multiArg('--approve').map(Number);
  const escalate = process.argv.includes('--escalate');
  if (escalate && !headed) {
    console.warn('Warning: --escalate without --headed means there is no visible window for a human to use.');
  }

  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage();

  console.log(`Capability: ${capability.id} v${capability.version}`);
  console.log(`Inputs: ${JSON.stringify(inputs)}`);
  if (simulateTimeout) console.log('Simulating an expired session on the first navigation.');
  if (approvedStepIndices.length > 0) console.log(`Approved risky steps: ${approvedStepIndices.join(', ')}`);

  const result = await replay({
    page,
    capability,
    inputs,
    startUrl,
    session: buildSession(capability.target.baseUrl),
    approvedStepIndices,
    escalate,
  });

  let screenshotPng: Buffer | undefined;
  let domSnapshotHtml: string | undefined;
  if (result.status === 'failure') {
    screenshotPng = await page.screenshot({ fullPage: true });
    domSnapshotHtml = await page.content();
  }

  await browser.close();

  console.log(`\nStatus: ${result.status}`);
  if (result.status === 'success') {
    console.log(`Outputs: ${JSON.stringify(result.outputs, null, 2)}`);
  } else if (result.status === 'business_outcome') {
    console.log(`Outcome: ${result.outcome}`);
    console.log(`Detail: ${result.detail}`);
  } else if (result.status === 'blocked') {
    console.log(`Blocked step: ${result.step} (${result.description})`);
    console.log(`Reason: ${result.reason}`);
  } else {
    console.log(`Failed step: ${result.failedStep}`);
    console.log(`Expected: ${result.expected}`);
    console.log(`Observed: ${result.observed}`);
    console.log(`Error: ${result.error}`);
  }
  console.log(`\nStep log:`);
  for (const s of result.log) {
    console.log(
      `  [${s.ok ? 'ok' : 'FAIL'}] step ${s.sourceStepIndex}: ${s.description}` +
        (s.strategyUsed ? ` (via ${s.strategyUsed.kind})` : '') +
        (s.detail ? ` -- ${s.detail}` : ''),
    );
  }

  const dir = await writeEvidence({
    kind: 'replay',
    label: capability.id,
    data: { capability: capability.id, inputs, result },
    screenshotPng,
    domSnapshotHtml,
  });
  console.log(`\nEvidence written to ${dir}/`);

  if (result.status === 'failure') process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
