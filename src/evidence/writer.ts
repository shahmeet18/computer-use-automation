import fs from 'node:fs/promises';
import path from 'node:path';
import { redactDeep } from '../safety/redaction.js';

export interface WriteEvidenceOptions {
  kind: 'discovery' | 'replay';
  /** Short, filesystem-safe label -- a capability id, or a slugified goal. */
  label: string;
  data: unknown;
  /** Known secret values (e.g. a login password) to scrub in addition to pattern-based PII. */
  secrets?: string[];
  /** A richer signal for when the run didn't end cleanly -- only pass these on failure. */
  screenshotPng?: Buffer;
  domSnapshotHtml?: string;
  /** evidence/tmp by default (gitignored scratch space); pass 'evidence' to promote a curated
   *  example into the permanent, committed record. */
  baseDir?: string;
}

/** One directory per run: result.json plus, when supplied, a failure screenshot/DOM snapshot. */
export async function writeEvidence(opts: WriteEvidenceOptions): Promise<string> {
  const baseDir = opts.baseDir ?? path.join('evidence', 'tmp');
  const dir = path.join(baseDir, `${opts.kind}-${slugify(opts.label)}-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });

  const redacted = redactDeep(opts.data, opts.secrets ?? []);
  await fs.writeFile(path.join(dir, 'result.json'), JSON.stringify(redacted, null, 2));

  if (opts.screenshotPng) {
    await fs.writeFile(path.join(dir, 'failure.png'), opts.screenshotPng);
  }
  if (opts.domSnapshotHtml) {
    await fs.writeFile(path.join(dir, 'failure.html'), redactDeep(opts.domSnapshotHtml, opts.secrets ?? []));
  }

  return dir;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}
