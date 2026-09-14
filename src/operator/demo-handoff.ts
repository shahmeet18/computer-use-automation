/**
 * Reproducible proof of the human-in-the-loop handoff mechanism: replay pauses at a risky step,
 * a *separate* Playwright client connects over CDP to the exact same running browser instance
 * (standing in for a human sitting down at the same visible window) and performs the click
 * itself, then signals resume -- and the paused automation picks up and finishes.
 *
 *   npm run dev:target-app          (terminal 1)
 *   npm run operator:demo-handoff   (terminal 2)
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import type { Capability } from '../artifacts/schema.js';
import { replay } from '../replay/engine.js';
import type { SessionConfig } from '../replay/types.js';
import { listInterventions, resolveIntervention } from './store.js';

const CDP_PORT = 9333;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSession(baseUrl: string): SessionConfig {
  return {
    isLoginUrl: (url) => url.includes('/login'),
    async reauthenticate(page) {
      await page.goto(`${baseUrl}/login`);
      await page.getByRole('textbox', { name: 'Username' }).fill('operator');
      await page.getByRole('textbox', { name: 'Password' }).fill('password123');
      await page.getByRole('button', { name: 'Log In' }).click();
      await page.waitForURL('**/search');
    },
  };
}

async function main() {
  const capability = JSON.parse(
    await fs.readFile('capabilities/open-sub-account.v1.json', 'utf8'),
  ) as Capability;

  const browser = await chromium.launch({ headless: false, args: [`--remote-debugging-port=${CDP_PORT}`] });
  const page = await browser.newPage();

  console.log('Starting replay with escalation (will pause before the risky "Confirm" step)...');
  const replayPromise = replay({
    page,
    capability,
    inputs: { memberId: '45678', accountType: 'checking', initialDeposit: '75' },
    session: buildSession(capability.target.baseUrl),
    escalate: true,
  });

  let intervention;
  for (let i = 0; i < 30; i++) {
    const pending = (await listInterventions()).filter((r) => r.status === 'pending');
    if (pending.length > 0) {
      intervention = pending[pending.length - 1];
      break;
    }
    await sleep(500);
  }
  if (!intervention) throw new Error('No intervention appeared within timeout.');
  console.log(`Intervention raised: ${intervention.id} -- ${intervention.reason}`);

  // The "human": a separate client attached to the SAME running browser, not a fresh one.
  const humanClient = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  const humanPage = humanClient.contexts()[0].pages()[0];
  console.log(`Human client attached to the same live page: ${humanPage.url()}`);
  await humanPage.getByRole('button', { name: 'Confirm' }).click();
  console.log('Human clicked Confirm directly in the live session.');
  await humanClient.close(); // detaches the CDP client only; the shared browser stays open

  await resolveIntervention(intervention.id, 'manual', 'Clicked Confirm myself after reviewing the deposit amount.');
  console.log('Resolved intervention as manual. Waiting for replay to resume and finish...');

  const result = await replayPromise;
  await browser.close();

  console.log(`\nFinal replay result status: ${result.status}`);
  console.log(JSON.stringify(result, null, 2));

  if (result.status !== 'success') {
    throw new Error(`Expected success, got ${result.status}`);
  }
  console.log('\nPASS: manual handoff verified end-to-end on the same live session.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
