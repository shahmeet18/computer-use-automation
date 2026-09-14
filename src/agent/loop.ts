import type { Page } from 'playwright';
import { chat, type ChatMessage } from './llm.js';
import { perceive } from './perception.js';
import { performAction } from './actions.js';
import { TOOLS, toAgentAction } from './tools.js';
import type { DiscoveryRunResult, DiscoveryStatus, DiscoveryStep, PageSnapshot } from './types.js';
import { checkAction, loadPolicy } from '../safety/policy.js';

const SYSTEM_PROMPT = `You are an automation agent operating a legacy back-office banking application on behalf of a bank employee.

You do not see a screenshot. Instead, after every action you are given a snapshot of the page as an
accessibility tree: each line is "- role \\"accessible name\\" [ref=eN]". Refs are only valid for the
snapshot you were just given -- always act on refs from the most recent snapshot, never one from
earlier in the conversation.

Rules:
- Call exactly one tool per turn.
- Prefer the simplest reliable path to the goal. Do not take actions unrelated to the stated goal.
- If a page shows a validation error, permission error, or "not found" message, treat that as
  information, not necessarily a failure -- reason about whether it means the goal cannot be
  completed as stated.
- If you are repeatedly failing, about to take an action you were not asked to take, or the
  situation requires a human judgment call, call "finish" with status "stuck" and explain why.
- When the goal is fully accomplished, call "finish" with status "success", a short summary, and
  an "outputs" object containing any data the goal asked you to read back.`;

export interface RunDiscoveryOptions {
  page: Page;
  goal: string;
  startUrl: string;
  /** Extra key/value context the agent may need (e.g. login credentials for this mock app). */
  context?: Record<string, string>;
  maxSteps?: number;
  timeoutMs?: number;
}

export async function runDiscovery(opts: RunDiscoveryOptions): Promise<DiscoveryRunResult> {
  const maxSteps = opts.maxSteps ?? 20;
  const timeoutMs = opts.timeoutMs ?? 3 * 60_000;
  const deadline = Date.now() + timeoutMs;
  const model = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.5';
  const startedAt = new Date().toISOString();
  const steps: DiscoveryStep[] = [];
  const policyBlocks: DiscoveryRunResult['policyBlocks'] = [];

  const finalize = (status: DiscoveryStatus, summary: string, outputs: Record<string, string>): DiscoveryRunResult => ({
    status,
    summary,
    outputs,
    steps,
    policyBlocks,
    model,
    goal: opts.goal,
    startUrl: opts.startUrl,
    startedAt,
    endedAt: new Date().toISOString(),
  });

  await opts.page.goto(opts.startUrl);
  let snapshot = await perceive(opts.page);

  const contextLines = Object.entries(opts.context ?? {})
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `Goal: ${opts.goal}`,
        contextLines ? `\nAvailable context:\n${contextLines}` : '',
        `\nCurrent page: ${snapshot.url}\n${snapshot.text}`,
      ].join(''),
    },
  ];

  for (let i = 0; i < maxSteps; i++) {
    if (Date.now() > deadline) {
      return finalize('timeout', `Exceeded the ${timeoutMs}ms time budget after ${i} steps.`, {});
    }

    let assistantMessage: ChatMessage;
    try {
      assistantMessage = await chat(messages, TOOLS);
    } catch (err) {
      return finalize('error', `LLM call failed: ${err instanceof Error ? err.message : String(err)}`, {});
    }
    messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      messages.push({
        role: 'user',
        content: 'You must call exactly one of the provided tools (no plain-text replies).',
      });
      continue;
    }

    const [primary, ...extras] = toolCalls;
    for (const extra of extras) {
      messages.push({
        role: 'tool',
        tool_call_id: extra.id,
        content: 'Ignored: only one tool call is processed per turn.',
      });
    }

    let args: Record<string, unknown>;
    try {
      args = primary.function.arguments ? JSON.parse(primary.function.arguments) : {};
    } catch {
      messages.push({
        role: 'tool',
        tool_call_id: primary.id,
        content: 'Error: arguments were not valid JSON. Try again.',
      });
      continue;
    }

    if (primary.function.name === 'finish') {
      const status = args.status === 'success' ? 'success' : 'stuck';
      const summary = String(args.summary ?? '');
      const outputs = (args.outputs as Record<string, string> | undefined) ?? {};
      return finalize(status, summary, outputs);
    }

    let action;
    try {
      action = toAgentAction(primary.function.name, args);
    } catch (err) {
      messages.push({
        role: 'tool',
        tool_call_id: primary.id,
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const policyCheck = checkAction(action, loadPolicy());
    if (!policyCheck.allowed) {
      policyBlocks.push({ turn: i, action, reason: policyCheck.reason });
      messages.push({
        role: 'tool',
        tool_call_id: primary.id,
        content: `Blocked by policy: ${policyCheck.reason} Choose a different action.`,
      });
      continue;
    }

    const result = await performAction(opts.page, snapshot, action);
    const element = 'ref' in action ? snapshot.elements.get(action.ref) : undefined;
    steps.push({
      index: i,
      timestamp: new Date().toISOString(),
      snapshotUrl: snapshot.url,
      action,
      element,
      result,
    });

    snapshot = await perceive(opts.page);
    messages.push({
      role: 'tool',
      tool_call_id: primary.id,
      content: JSON.stringify(describeOutcome(result, snapshot)),
    });
  }

  return finalize('max_steps_exceeded', `Stopped after ${maxSteps} steps without reaching the goal.`, {});
}

function describeOutcome(
  result: DiscoveryStep['result'],
  snapshot: PageSnapshot,
): Record<string, unknown> {
  return {
    actionOk: result.ok,
    ...(result.ok
      ? { extractedText: result.extractedText }
      : { error: result.error }),
    page: { url: snapshot.url, title: snapshot.title, snapshot: snapshot.text },
  };
}
