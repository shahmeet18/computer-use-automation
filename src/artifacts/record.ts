/**
 * CLI to turn a saved discovery transcript into a versioned capability artifact:
 *
 *   npm run artifacts:record -- \
 *     --spec open-sub-account \
 *     --transcript evidence/tmp/discovery-<ts>.json \
 *     --out capabilities/open-sub-account.v1.json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DiscoveryRunResult } from '../agent/types.js';
import { recordArtifact } from './recorder.js';
import { specs } from './specs/index.js';

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const specKey = arg('--spec');
  const transcriptPath = arg('--transcript');
  const outPath = arg('--out');

  if (!specKey || !transcriptPath || !outPath) {
    console.error(
      'Usage: npm run artifacts:record -- --spec <key> --transcript <path> --out <path>',
    );
    process.exit(1);
  }

  const spec = specs[specKey];
  if (!spec) {
    console.error(`Unknown spec "${specKey}". Known specs: ${Object.keys(specs).join(', ')}`);
    process.exit(1);
  }

  const transcript = JSON.parse(await fs.readFile(transcriptPath, 'utf8')) as DiscoveryRunResult;
  if (transcript.status !== 'success') {
    console.error(`Refusing to record from a transcript with status "${transcript.status}"`);
    process.exit(1);
  }

  const capability = recordArtifact(transcript, spec, transcriptPath);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(capability, null, 2));
  console.log(`Wrote capability "${capability.id}" v${capability.version} to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
