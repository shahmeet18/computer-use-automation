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
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import type { Capability } from '../artifacts/schema.js';
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

  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage();

  console.log(`Capability: ${capability.id} v${capability.version}`);
  console.log(`Inputs: ${JSON.stringify(inputs)}`);
  if (simulateTimeout) console.log('Simulating an expired session on the first navigation.');

  const result = await replay({
    page,
    capability,
    inputs,
    startUrl,
    session: buildSession(capability.target.baseUrl),
  });

  await browser.close();

  console.log(`\nStatus: ${result.status}`);
  if (result.status === 'success') {
    console.log(`Outputs: ${JSON.stringify(result.outputs, null, 2)}`);
  } else if (result.status === 'business_outcome') {
    console.log(`Outcome: ${result.outcome}`);
    console.log(`Detail: ${result.detail}`);
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

  const outDir = path.join('evidence', 'tmp');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `replay-${capability.id}-${Date.now()}.json`);
  await fs.writeFile(outFile, JSON.stringify({ capability: capability.id, inputs, result }, null, 2));
  console.log(`\nFull result written to ${outFile}`);

  if (result.status === 'failure') process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
