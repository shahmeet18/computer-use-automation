export type InterventionOutcome = 'manual' | 'retry' | 'approved' | 'abandoned';

export interface InterventionRequest {
  id: string;
  createdAt: string;
  source: 'discovery' | 'replay';
  /** Goal text (discovery) or capability id (replay) -- what was being attempted. */
  subject: string;
  /** Discovery turn index or replay sourceStepIndex we paused at. */
  step: number;
  /** Why automation stopped and asked for a human. */
  reason: string;
  currentUrl: string;
  /** Relative path to a screenshot captured at the moment of pausing, if any. */
  screenshotFile?: string;
  status: 'pending' | 'resolved';
  resolvedAt?: string;
  /** manual: operator did it by hand, automation should move on.
   *  retry: re-attempt the same step programmatically.
   *  approved: (risky steps only) go ahead and execute it programmatically now.
   *  abandoned: give up, surface the original stuck/blocked/failure result. */
  outcome?: InterventionOutcome;
  note?: string;
}
