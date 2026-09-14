/**
 * A capability artifact: a typed, versioned, replayable description of a flow recorded from a
 * successful LLM discovery run. This is the contract an AI agent invokes in production -- the
 * replay engine (Milestone 5) executes `steps` directly, with no LLM in the loop.
 */

export type LocatorStrategy =
  /** Role + accessible name, e.g. button "Search". Primary strategy: works without test-ids and
   *  survives most restyling, since it comes from semantic HTML/ARIA, not CSS. */
  | { kind: 'role'; role: string; name?: string }
  /** Plain visible text match. Fallback for when a role changes across an app version/tenant but
   *  the human-facing label does not. */
  | { kind: 'text'; text: string };

export interface LocatorDescriptor {
  /** Ranked most- to least-robust. Replay tries each in order and records which one worked --
   *  that's the drift signal referenced in the design write-up. */
  strategies: LocatorStrategy[];
}

/** Where a step's value comes from at replay time. */
export type ValueSource =
  | { kind: 'input'; input: string }
  | { kind: 'literal'; literal: string };

export type CapabilityAction =
  | { type: 'click'; locator: LocatorDescriptor }
  | { type: 'type'; locator: LocatorDescriptor; value: ValueSource }
  | { type: 'select'; locator: LocatorDescriptor; value: ValueSource }
  | { type: 'extract'; locator: LocatorDescriptor; output: string }
  | { type: 'navigate'; url: string }
  | { type: 'wait_for'; text: string; timeoutMs?: number };

export interface CapabilityStep {
  /** Index into the source discovery transcript, kept for provenance/debugging. */
  sourceStepIndex: number;
  /** Human-readable summary for review -- both a person and a calling agent should be able to
   *  understand what this step does without reading the locator internals. */
  description: string;
  action: CapabilityAction;
}

export interface JsonSchemaLike {
  type: 'string' | 'number' | 'boolean';
  description?: string;
  enum?: Array<string | number>;
}

/** Asserts we actually reached the expected state, rather than assuming the last action worked. */
export interface Checkpoint {
  type: 'text_present';
  text: string;
}

/**
 * A known, legitimate non-happy-path result the app can return -- "no such member" is an answer,
 * not a crash. Declared by whoever recorded the capability (they've seen the app's error states),
 * checked by replay after every step so it's reported as a business outcome rather than surfacing
 * as a confusing hard failure further down the flow.
 */
export interface BusinessOutcome {
  id: string;
  description: string;
  trigger: { type: 'text_present'; text: string };
}

export interface Capability {
  id: string;
  version: number;
  name: string;
  description: string;
  target: { baseUrl: string; entryPath: string };
  inputSchema: Record<string, JsonSchemaLike>;
  outputSchema: Record<string, JsonSchemaLike>;
  steps: CapabilityStep[];
  checkpoint: Checkpoint;
  businessOutcomes: BusinessOutcome[];
  provenance: {
    discoveryRunFile: string;
    model: string;
    sourceGoal: string;
    recordedAt: string;
  };
}
