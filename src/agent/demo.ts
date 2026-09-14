/**
 * Manual verification harness for the perception/action layer, with no LLM
 * involved: a hand-scripted sequence of perceive() -> performAction() calls
 * that walks the full target-app flow purely through refs resolved from
 * accessibility snapshots. Run with the target app already up:
 *
 *   npm run dev:target-app        (terminal 1)
 *   npm run dev:perception-demo   (terminal 2)
 */
import { chromium } from 'playwright';
import { performAction } from './actions.js';
import { findRefByRole, findRefByRoleName, perceive } from './perception.js';
import type { PageSnapshot } from './types.js';

const baseUrl = `http://localhost:${process.env.TARGET_APP_PORT ?? 4000}`;

function requireRef(snapshot: PageSnapshot, role: string, name: string): string {
  const ref = findRefByRoleName(snapshot, role, name);
  if (!ref) {
    throw new Error(`Could not find ${role} "${name}" in snapshot of ${snapshot.url}`);
  }
  return ref;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${baseUrl}/login`);
  let snapshot = await perceive(page);
  console.log(`\n=== ${snapshot.url} ===\n${snapshot.text}\n`);

  await performAction(page, snapshot, {
    type: 'type',
    ref: requireRef(snapshot, 'textbox', 'Username'),
    text: 'operator',
  });
  await performAction(page, snapshot, {
    type: 'type',
    ref: requireRef(snapshot, 'textbox', 'Password'),
    text: 'password123',
  });
  await performAction(page, snapshot, {
    type: 'click',
    ref: requireRef(snapshot, 'button', 'Log In'),
  });

  snapshot = await perceive(page);
  console.log(`=== ${snapshot.url} ===`);
  await performAction(page, snapshot, {
    type: 'type',
    ref: requireRef(snapshot, 'textbox', 'Member ID'),
    text: '12345',
  });
  await performAction(page, snapshot, {
    type: 'click',
    ref: requireRef(snapshot, 'button', 'Search'),
  });

  snapshot = await perceive(page);
  console.log(`=== ${snapshot.url} ===`);
  await performAction(page, snapshot, {
    type: 'click',
    ref: requireRef(snapshot, 'link', 'View member 12345'),
  });

  snapshot = await perceive(page);
  console.log(`=== ${snapshot.url} (member detail) ===`);
  await performAction(page, snapshot, {
    type: 'click',
    ref: requireRef(snapshot, 'link', 'Open Sub-Account'),
  });

  snapshot = await perceive(page);
  console.log(`=== ${snapshot.url} (new sub-account form) ===`);
  await performAction(page, snapshot, {
    type: 'select',
    ref: requireRef(snapshot, 'combobox', 'Account Type'),
    value: 'savings',
  });
  await performAction(page, snapshot, {
    type: 'type',
    ref: requireRef(snapshot, 'textbox', 'Initial Deposit'),
    text: '100',
  });
  await performAction(page, snapshot, {
    type: 'click',
    ref: requireRef(snapshot, 'button', 'Continue'),
  });

  snapshot = await perceive(page);
  console.log(`=== ${snapshot.url} (confirm) ===`);
  await performAction(page, snapshot, {
    type: 'click',
    ref: requireRef(snapshot, 'button', 'Confirm'),
  });

  snapshot = await perceive(page);
  console.log(`=== ${snapshot.url} (success) ===\n${snapshot.text}\n`);
  const statusRef = findRefByRole(snapshot, 'status');
  if (!statusRef) throw new Error(`Could not find a "status" element in ${snapshot.url}`);
  const result = await performAction(page, snapshot, { type: 'extract', ref: statusRef });
  console.log('Extracted status text:', result.ok ? result.extractedText : result.error);

  await browser.close();

  if (!result.ok || !result.extractedText?.includes('created')) {
    throw new Error('Demo did not reach a successful sub-account creation.');
  }
  console.log('\nPerception/action demo completed successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
