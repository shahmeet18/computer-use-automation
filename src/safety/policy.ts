import fs from 'node:fs';

export interface Policy {
  /** Origins (scheme+host+port) the agent/replay is permitted to touch at all. */
  allowedOrigins: string[];
  /** Action types the agent/replay is permitted to perform. */
  allowedActionTypes: string[];
}

const DEFAULT_POLICY_PATH = 'safety/policy.json';

let cached: Policy | undefined;

/** Loaded once per process from safety/policy.json -- configurable without touching code. */
export function loadPolicy(path: string = DEFAULT_POLICY_PATH): Policy {
  if (cached) return cached;
  const raw = fs.readFileSync(path, 'utf8');
  cached = JSON.parse(raw) as Policy;
  return cached;
}

export function isOriginAllowed(url: string, policy: Policy): boolean {
  try {
    return policy.allowedOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

export function isActionTypeAllowed(type: string, policy: Policy): boolean {
  return policy.allowedActionTypes.includes(type);
}

export type PolicyCheck = { allowed: true } | { allowed: false; reason: string };

/** The single gate both the discovery loop and the replay engine call before acting. */
export function checkAction(
  action: { type: string; url?: string },
  policy: Policy,
): PolicyCheck {
  if (!isActionTypeAllowed(action.type, policy)) {
    return { allowed: false, reason: `Action type "${action.type}" is not in the allowed action types.` };
  }
  if (action.type === 'navigate' && action.url && !isOriginAllowed(action.url, policy)) {
    return {
      allowed: false,
      reason: `Navigating to "${action.url}" is outside the allowed origins (${policy.allowedOrigins.join(', ')}).`,
    };
  }
  return { allowed: true };
}
