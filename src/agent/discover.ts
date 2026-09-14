/**
 * CLI entry point for a real LLM-driven discovery run against the mock
 * target app. Requires OPENROUTER_API_KEY (see .env.example).
 *
 *   npm run dev:target-app                     (terminal 1)
 *   npm run agent:discover -- --goal "look up member 12345 and read their savings balance"
 *
 * Writes the full run transcript as JSON evidence. Note: this is a rough ad hoc writer for
 * verifying the loop -- Milestone 7 formalizes evidence capture/layout. Redaction itself is the
 * shared safety/redaction.js utility, applied deep so it also catches the ActionResult's own
 * copy of each executed action.
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { redactDeep } from '../safety/redaction.js';
import { runDiscovery } from './loop.js';

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const goal = arg('--goal');
  if (!goal) {
    console.error(
      'Usage: npm run agent:discover -- --goal "<goal>" [--start-url <url>] [--headed] [--max-steps N]',
    );
    process.exit(1);
  }
  const startUrl = arg('--start-url') ?? `http://localhost:${process.env.TARGET_APP_PORT ?? 4000}/login`;
  const headed = process.argv.includes('--headed');
  const maxStepsArg = arg('--max-steps');

  const context = { username: 'operator', password: 'password123' };

  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage();

  console.log(`Goal: ${goal}`);
  console.log(`Start: ${startUrl}`);
  console.log(`Model: ${process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.5'}\n`);

  const result = await runDiscovery({
    page,
    goal,
    startUrl,
    context,
    maxSteps: maxStepsArg ? Number(maxStepsArg) : undefined,
  });

  await browser.close();

  console.log(`\nStatus: ${result.status}`);
  console.log(`Summary: ${result.summary}`);
  console.log(`Outputs: ${JSON.stringify(result.outputs, null, 2)}`);
  console.log(`Steps taken: ${result.steps.length}`);

  const secretValues = Object.entries(context)
    .filter(([key]) => /password|secret|token/i.test(key))
    .map(([, value]) => value);
  const redacted = redactDeep(result, secretValues);
  const outDir = path.join('evidence', 'tmp');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `discovery-${Date.now()}.json`);
  await fs.writeFile(outFile, JSON.stringify(redacted, null, 2));
  console.log(`\nFull transcript written to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
