/** A single node from Playwright's AI-mode ARIA snapshot tree. */
export interface AriaNode {
  role: string;
  name?: string;
  /** Text content, present when the node is a leaf/only-child (e.g. a paragraph). */
  text?: string;
  ref?: string;
  value?: string | number;
  level?: number;
  children?: AriaNode[];
  [key: string]: unknown;
}

/** A flattened, agent-addressable element from the current page snapshot. */
export interface PerceivedElement {
  ref: string;
  role: string;
  name?: string;
  text?: string;
  value?: string | number;
}

/** Result of perceiving the current page state. */
export interface PageSnapshot {
  url: string;
  title: string;
  /** Compact indented text tree (role, name, ref) for the LLM prompt. */
  text: string;
  /** Every addressable element keyed by its snapshot-scoped ref, e.g. "e16". */
  elements: Map<string, PerceivedElement>;
}

export type AgentAction =
  | { type: 'click'; ref: string }
  | { type: 'type'; ref: string; text: string }
  | { type: 'select'; ref: string; value: string }
  | { type: 'extract'; ref: string }
  | { type: 'navigate'; url: string }
  | { type: 'wait_for'; text: string; timeoutMs?: number };

export type ActionResult =
  | { ok: true; action: AgentAction; extractedText?: string }
  | { ok: false; action: AgentAction; error: string };

export type DiscoveryStatus = 'success' | 'stuck' | 'max_steps_exceeded' | 'timeout' | 'error';

export interface DiscoveryStep {
  index: number;
  timestamp: string;
  snapshotUrl: string;
  action: AgentAction;
  /** The perceived element the action's ref resolved to, when the action targets one -- this
   *  (role + accessible name), not the ephemeral ref, is what the artifact recorder turns into a
   *  durable locator. */
  element?: PerceivedElement;
  result: ActionResult;
}

export interface DiscoveryRunResult {
  status: DiscoveryStatus;
  summary: string;
  outputs: Record<string, string>;
  steps: DiscoveryStep[];
  model: string;
  goal: string;
  startUrl: string;
  startedAt: string;
  endedAt: string;
}
