/**
 * Minimal operator console -- deliberately bare (a CLI, not a co-browsing UI), per the
 * assignment's scope note. The live automation session is the actual visible browser window
 * (run with --headed); this CLI only signals resume and records what the operator decided.
 *
 *   npm run operator -- list
 *   npm run operator -- resolve --id <id> --outcome manual|retry|approved|abandoned [--note "..."]
 */
import { listInterventions, resolveIntervention } from './store.js';
import type { InterventionOutcome } from './types.js';

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const VALID_OUTCOMES: InterventionOutcome[] = ['manual', 'retry', 'approved', 'abandoned'];

async function main() {
  const command = process.argv[2];

  if (command === 'list') {
    const records = await listInterventions();
    const pending = records.filter((r) => r.status === 'pending');
    if (pending.length === 0) {
      console.log('No pending interventions.');
      return;
    }
    for (const r of pending) {
      console.log(`${r.id}  [${r.source}/${r.subject}]  step ${r.step}`);
      console.log(`  reason: ${r.reason}`);
      console.log(`  at: ${r.currentUrl}`);
      if (r.screenshotFile) console.log(`  screenshot: ${r.screenshotFile}`);
      console.log(`  created: ${r.createdAt}`);
    }
    return;
  }

  if (command === 'resolve') {
    const id = arg('--id');
    const outcome = arg('--outcome') as InterventionOutcome | undefined;
    const note = arg('--note');
    if (!id || !outcome || !VALID_OUTCOMES.includes(outcome)) {
      console.error(
        `Usage: npm run operator -- resolve --id <id> --outcome <${VALID_OUTCOMES.join('|')}> [--note "..."]`,
      );
      process.exit(1);
    }
    const updated = await resolveIntervention(id, outcome, note);
    console.log(`Resolved ${updated.id} as "${updated.outcome}"${note ? ` -- ${note}` : ''}`);
    return;
  }

  console.error('Usage: npm run operator -- list');
  console.error('       npm run operator -- resolve --id <id> --outcome <manual|retry|approved|abandoned> [--note "..."]');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
