/**
 * CLI entry point for a real LLM-driven discovery run against the mock
 * target app. Requires OPENROUTER_API_KEY (see .env.example).
 *
 *   npm run dev:target-app                     (terminal 1)
 *   npm run agent:discover -- --goal "look up member 12345 and read their savings balance"
 *
 * Writes the run transcript as evidence via the shared writer (redacted; a screenshot + DOM
 * snapshot are captured too whenever the run doesn't end in success).
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import { writeEvidence } from '../evidence/writer.js';
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

  let screenshotPng: Buffer | undefined;
  let domSnapshotHtml: string | undefined;
  if (result.status !== 'success') {
    screenshotPng = await page.screenshot({ fullPage: true });
    domSnapshotHtml = await page.content();
  }

  await browser.close();

  console.log(`\nStatus: ${result.status}`);
  console.log(`Summary: ${result.summary}`);
  console.log(`Outputs: ${JSON.stringify(result.outputs, null, 2)}`);
  console.log(`Steps taken: ${result.steps.length}`);
  if (result.policyBlocks.length > 0) {
    console.log(`Policy blocks: ${result.policyBlocks.length}`);
  }

  const secretValues = Object.entries(context)
    .filter(([key]) => /password|secret|token/i.test(key))
    .map(([, value]) => value);

  const dir = await writeEvidence({
    kind: 'discovery',
    label: goal,
    data: result,
    secrets: secretValues,
    screenshotPng,
    domSnapshotHtml,
  });
  console.log(`\nEvidence written to ${dir}/`);

  if (result.status !== 'success') process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
