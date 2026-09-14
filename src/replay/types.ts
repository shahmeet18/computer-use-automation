import type { LocatorStrategy } from '../artifacts/schema.js';

export interface StepLog {
  sourceStepIndex: number;
  description: string;
  ok: boolean;
  /** Which ranked locator strategy actually resolved -- the drift signal: if this is ever not
   *  the first strategy, the primary locator no longer matches and the artifact should be
   *  reviewed/re-recorded even though replay still succeeded via a fallback. */
  strategyUsed?: LocatorStrategy;
  detail?: string;
}

export type ReplayResult =
  | { status: 'success'; outputs: Record<string, string>; log: StepLog[] }
  | { status: 'business_outcome'; outcome: string; detail: string; log: StepLog[] }
  | {
      status: 'failure';
      failedStep: number | null;
      expected: string;
      observed: string;
      error: string;
      log: StepLog[];
    };

export interface SessionConfig {
  isLoginUrl: (url: string) => boolean;
  reauthenticate: (page: import('playwright').Page) => Promise<void>;
}
