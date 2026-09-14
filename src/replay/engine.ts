import type { Page } from 'playwright';
import type { BusinessOutcome, Capability, CapabilityStep } from '../artifacts/schema.js';
import { createIntervention, waitForResume } from '../operator/store.js';
import { checkAction, loadPolicy } from '../safety/policy.js';
import { resolveLocator, substitute } from './locator.js';
import type { ReplayResult, SessionConfig, StepLog } from './types.js';

export interface ReplayOptions {
  page: Page;
  capability: Capability;
  inputs: Record<string, string>;
  /** URL to navigate to for the very first attempt -- lets a caller inject a demo condition
   *  (e.g. "?simulateTimeout=1") without poisoning the clean retry-after-reauth navigation. */
  startUrl?: string;
  session?: SessionConfig;
  maxSessionRetries?: number;
  /** Source step indices a human has explicitly approved for this invocation -- steps flagged
   *  requiresConfirmation are blocked unless listed here. Empty/omitted by default: risky steps
   *  are conservatively refused, not silently executed. */
  approvedStepIndices?: number[];
  /** When true, a blocked risky step or a hard step failure pauses and raises an intervention
   *  instead of ending the run -- requires a headed browser so a human can actually use it. */
  escalate?: boolean;
}

export async function replay(opts: ReplayOptions): Promise<ReplayResult> {
  const startUrl = opts.startUrl ?? opts.capability.target.baseUrl + opts.capability.target.entryPath;
  return attempt(opts, startUrl, opts.maxSessionRetries ?? 1);
}

async function attempt(opts: ReplayOptions, startUrl: string, sessionRetriesLeft: number): Promise<ReplayResult> {
  const { page, capability, inputs } = opts;
  const log: StepLog[] = [];
  const outputs: Record<string, string> = {};
  const approved = new Set(opts.approvedStepIndices ?? []);
  const policy = loadPolicy();

  await page.goto(startUrl);

  for (const step of capability.steps) {
    if (step.requiresConfirmation && !approved.has(step.sourceStepIndex)) {
      const gate = await handleBlockedStep(page, capability, step, opts, log);
      if (!gate.ok) return gate.result;
      if (gate.executeNow) approved.add(step.sourceStepIndex); // fall through to execute below
      else continue; // operator handled it manually; move to next step
    }

    const policyCheck = checkAction(step.action, policy);
    if (!policyCheck.allowed) {
      return {
        status: 'failure',
        failedStep: step.sourceStepIndex,
        expected: 'an action permitted by safety policy',
        observed: policyCheck.reason,
        error: `Blocked by policy: ${policyCheck.reason}`,
        log,
      };
    }

    if (opts.session?.isLoginUrl(page.url())) {
      if (sessionRetriesLeft <= 0) {
        return {
          status: 'failure',
          failedStep: step.sourceStepIndex,
          expected: 'an authenticated session',
          observed: `redirected to ${page.url()}`,
          error: 'Session expired and recovery retries were exhausted.',
          log,
        };
      }
      await opts.session.reauthenticate(page);
      const cleanStartUrl = capability.target.baseUrl + capability.target.entryPath;
      return attempt(opts, cleanStartUrl, sessionRetriesLeft - 1);
    }

    const stepOutcome = await executeStep(page, step, inputs, outputs);
    log.push(stepOutcome.log);
    if (!stepOutcome.ok) {
      const handled = await handleFailedStep(page, capability, step, inputs, outputs, opts, log, stepOutcome);
      if (!handled.ok) return handled.result;
    }

    const outcome = await detectBusinessOutcome(page, capability.businessOutcomes);
    if (outcome) {
      return { status: 'business_outcome', outcome: outcome.id, detail: outcome.description, log };
    }
  }

  const pageText = await page.locator('body').innerText();
  if (!pageText.includes(capability.checkpoint.text)) {
    return {
      status: 'failure',
      failedStep: null,
      expected: `page contains checkpoint text "${capability.checkpoint.text}"`,
      observed: 'checkpoint text not found after all steps executed',
      error: 'Checkpoint verification failed.',
      log,
    };
  }

  return { status: 'success', outputs, log };
}

async function detectBusinessOutcome(
  page: Page,
  outcomes: BusinessOutcome[],
): Promise<BusinessOutcome | undefined> {
  if (outcomes.length === 0) return undefined;
  const pageText = await page.locator('body').innerText();
  return outcomes.find((o) => pageText.includes(o.trigger.text));
}

type StepExecution =
  | { ok: true; log: StepLog }
  | { ok: false; log: StepLog; expected: string; observed: string; error: string };

type BlockGateResult = { ok: true; executeNow: boolean } | { ok: false; result: ReplayResult };
type FailureGateResult = { ok: true } | { ok: false; result: ReplayResult };

/**
 * A risky step was reached without prior approval. Without escalation this just blocks as
 * before. With escalation, pause and let a human either approve it (we execute it here, right
 * after) or do it manually in the live browser (we skip it and move on).
 */
async function handleBlockedStep(
  page: Page,
  capability: Capability,
  step: CapabilityStep,
  opts: ReplayOptions,
  log: StepLog[],
): Promise<BlockGateResult> {
  const blockedReason =
    'This step is flagged requiresConfirmation (risky/irreversible) and was not in the ' +
    'approved step list for this invocation.';

  if (!opts.escalate) {
    return {
      ok: false,
      result: { status: 'blocked', step: step.sourceStepIndex, description: step.description, reason: blockedReason, log },
    };
  }

  const screenshotPng = await page.screenshot({ fullPage: true }).catch(() => undefined);
  const intervention = await createIntervention({
    source: 'replay',
    subject: capability.id,
    step: step.sourceStepIndex,
    reason: `${blockedReason} (${step.description})`,
    currentUrl: page.url(),
    screenshotPng,
  });
  console.log(`\n>>> Replay paused: step ${step.sourceStepIndex} ("${step.description}") needs human confirmation.`);
  console.log(`>>> Intervention ${intervention.id} raised. The browser window is open -- act there if needed.`);
  console.log(
    `>>> From another terminal: npm run operator -- resolve --id ${intervention.id} --outcome approved|manual|abandoned [--note "..."]\n`,
  );

  const resolution = await waitForResume(intervention.id);
  if (resolution.outcome === 'abandoned') {
    return {
      ok: false,
      result: {
        status: 'blocked',
        step: step.sourceStepIndex,
        description: step.description,
        reason: `${blockedReason} Escalated and abandoned by operator${resolution.note ? `: ${resolution.note}` : ''}.`,
        log,
      },
    };
  }
  if (resolution.outcome === 'approved') {
    return { ok: true, executeNow: true };
  }
  // 'manual' (or 'retry', treated the same here): operator says they've handled it themselves.
  log.push({
    sourceStepIndex: step.sourceStepIndex,
    description: step.description,
    ok: true,
    detail: `Completed manually by operator${resolution.note ? ` (${resolution.note})` : ''}`,
  });
  return { ok: true, executeNow: false };
}

/**
 * A step threw a hard error. Without escalation this ends the run as a failure. With escalation,
 * pause and let a human retry the same step, do it manually, or abandon.
 */
async function handleFailedStep(
  page: Page,
  capability: Capability,
  step: CapabilityStep,
  inputs: Record<string, string>,
  outputs: Record<string, string>,
  opts: ReplayOptions,
  log: StepLog[],
  stepOutcome: Extract<StepExecution, { ok: false }>,
): Promise<FailureGateResult> {
  const asFailure = (error: string): ReplayResult => ({
    status: 'failure',
    failedStep: step.sourceStepIndex,
    expected: stepOutcome.expected,
    observed: stepOutcome.observed,
    error,
    log,
  });

  if (!opts.escalate) {
    return { ok: false, result: asFailure(stepOutcome.error) };
  }

  const screenshotPng = await page.screenshot({ fullPage: true }).catch(() => undefined);
  const intervention = await createIntervention({
    source: 'replay',
    subject: capability.id,
    step: step.sourceStepIndex,
    reason: stepOutcome.error,
    currentUrl: page.url(),
    screenshotPng,
  });
  console.log(`\n>>> Replay paused: step ${step.sourceStepIndex} ("${step.description}") failed: ${stepOutcome.error}`);
  console.log(`>>> Intervention ${intervention.id} raised. The browser window is open -- act there if needed.`);
  console.log(
    `>>> From another terminal: npm run operator -- resolve --id ${intervention.id} --outcome retry|manual|abandoned [--note "..."]\n`,
  );

  const resolution = await waitForResume(intervention.id);
  if (resolution.outcome === 'abandoned') {
    return {
      ok: false,
      result: asFailure(`${stepOutcome.error} Escalated and abandoned by operator${resolution.note ? `: ${resolution.note}` : ''}.`),
    };
  }
  if (resolution.outcome === 'retry') {
    const retry = await executeStep(page, step, inputs, outputs);
    log.push(retry.log);
    if (!retry.ok) {
      return { ok: false, result: asFailure(`Retry after operator intervention also failed: ${retry.error}`) };
    }
    return { ok: true };
  }
  // 'manual' (or 'approved', treated the same here): operator says they've handled it themselves.
  log.push({
    sourceStepIndex: step.sourceStepIndex,
    description: step.description,
    ok: true,
    detail: `Completed manually by operator${resolution.note ? ` (${resolution.note})` : ''}`,
  });
  return { ok: true };
}

async function executeStep(
  page: Page,
  step: CapabilityStep,
  inputs: Record<string, string>,
  outputs: Record<string, string>,
): Promise<StepExecution> {
  const { action } = step;
  const base = { sourceStepIndex: step.sourceStepIndex, description: step.description };

  try {
    switch (action.type) {
      case 'click': {
        const resolved = await resolveLocator(page, action.locator, inputs);
        if (!resolved) return notFound(base, action.locator);
        await resolved.locator.click();
        return { ok: true, log: { ...base, ok: true, strategyUsed: resolved.strategy } };
      }
      case 'type': {
        const resolved = await resolveLocator(page, action.locator, inputs);
        if (!resolved) return notFound(base, action.locator);
        const value = action.value.kind === 'input' ? (inputs[action.value.input] ?? '') : action.value.literal;
        await resolved.locator.fill(value);
        return { ok: true, log: { ...base, ok: true, strategyUsed: resolved.strategy } };
      }
      case 'select': {
        const resolved = await resolveLocator(page, action.locator, inputs);
        if (!resolved) return notFound(base, action.locator);
        const value = action.value.kind === 'input' ? (inputs[action.value.input] ?? '') : action.value.literal;
        await resolved.locator.selectOption(value);
        return { ok: true, log: { ...base, ok: true, strategyUsed: resolved.strategy } };
      }
      case 'extract': {
        const resolved = await resolveLocator(page, action.locator, inputs);
        if (!resolved) return notFound(base, action.locator);
        const text = (await resolved.locator.innerText()).trim();
        outputs[action.output] = text;
        return { ok: true, log: { ...base, ok: true, strategyUsed: resolved.strategy, detail: text } };
      }
      case 'navigate': {
        await page.goto(substitute(action.url, inputs));
        return { ok: true, log: { ...base, ok: true } };
      }
      case 'wait_for': {
        await page
          .getByText(substitute(action.text, inputs))
          .first()
          .waitFor({ timeout: action.timeoutMs ?? 5000 });
        return { ok: true, log: { ...base, ok: true } };
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      log: { ...base, ok: false, detail: error },
      expected: `"${step.description}" to succeed`,
      observed: 'an error was thrown while executing the step',
      error,
    };
  }
}

function notFound(
  base: { sourceStepIndex: number; description: string },
  locator: { strategies: unknown[] },
): StepExecution {
  return {
    ok: false,
    log: { ...base, ok: false, detail: 'no locator strategy matched' },
    expected: `"${base.description}" -- one of ${locator.strategies.length} locator strategies to match exactly one element`,
    observed: 'no strategy matched any element on the page',
    error: `Step ${base.sourceStepIndex}: could not resolve any locator strategy.`,
  };
}
