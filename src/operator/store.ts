import fs from 'node:fs/promises';
import path from 'node:path';
import type { InterventionOutcome, InterventionRequest } from './types.js';

const DIR = 'operator/interventions';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The seam this implements: automation pauses by writing its state to disk and blocking, a human
 * takes over the *same* live (headful) browser window directly -- no session transfer needed,
 * it's the same OS-level window -- and a separate operator process (a different terminal, in
 * practice) signals resume by resolving this same record. "Who is in control" is exactly this
 * record's status: pending means automation is paused and the human owns the window; resolved
 * means control has been handed back.
 */
export async function createIntervention(input: {
  source: InterventionRequest['source'];
  subject: string;
  step: number;
  reason: string;
  currentUrl: string;
  screenshotPng?: Buffer;
}): Promise<InterventionRequest> {
  await fs.mkdir(DIR, { recursive: true });
  const id = `iv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  let screenshotFile: string | undefined;
  if (input.screenshotPng) {
    screenshotFile = path.join(DIR, `${id}.png`);
    await fs.writeFile(screenshotFile, input.screenshotPng);
  }

  const record: InterventionRequest = {
    id,
    createdAt: new Date().toISOString(),
    source: input.source,
    subject: input.subject,
    step: input.step,
    reason: input.reason,
    currentUrl: input.currentUrl,
    screenshotFile,
    status: 'pending',
  };
  await fs.writeFile(recordPath(id), JSON.stringify(record, null, 2));
  return record;
}

export async function getIntervention(id: string): Promise<InterventionRequest> {
  return JSON.parse(await fs.readFile(recordPath(id), 'utf8')) as InterventionRequest;
}

export async function resolveIntervention(
  id: string,
  outcome: InterventionOutcome,
  note?: string,
): Promise<InterventionRequest> {
  const record = await getIntervention(id);
  const updated: InterventionRequest = {
    ...record,
    status: 'resolved',
    resolvedAt: new Date().toISOString(),
    outcome,
    note,
  };
  await fs.writeFile(recordPath(id), JSON.stringify(updated, null, 2));
  return updated;
}

export async function listInterventions(): Promise<InterventionRequest[]> {
  await fs.mkdir(DIR, { recursive: true });
  const files = (await fs.readdir(DIR)).filter((f) => f.endsWith('.json'));
  return Promise.all(files.map((f) => fs.readFile(path.join(DIR, f), 'utf8').then((s) => JSON.parse(s))));
}

/** Blocks (polling) until a human resolves the intervention, or the wait itself times out --
 *  in which case it resolves as 'abandoned' so the caller always gets a terminal outcome. */
export async function waitForResume(
  id: string,
  opts: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<InterventionRequest> {
  const pollIntervalMs = opts.pollIntervalMs ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const record = await getIntervention(id);
    if (record.status === 'resolved') return record;
    await sleep(pollIntervalMs);
  }
  return resolveIntervention(id, 'abandoned', 'Timed out waiting for a human operator.');
}

function recordPath(id: string): string {
  return path.join(DIR, `${id}.json`);
}
