/**
 * Pattern-based scrubbing applied to every field, as a safety net beyond explicitly-known
 * secrets -- catches PII shapes even when nobody remembered to declare them.
 */
const PII_PATTERNS: RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
  /\b\d(?:[ -]?\d){12,18}\b/g, // card-number-like digit runs (13-19 digits, no dangling separator)
];

function redactPatterns(text: string): string {
  return PII_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '[REDACTED]'), text);
}

function redactKnownSecrets(text: string, secrets: string[]): string {
  return secrets.reduce((acc, secret) => (secret ? acc.split(secret).join('[REDACTED]') : acc), text);
}

/**
 * Deep-redacts every string value in an arbitrary JSON-serializable structure -- known secret
 * values (e.g. a login password) plus pattern-based PII. Used before anything (discovery
 * transcripts, replay results, recorded artifacts) is written to disk.
 */
export function redactDeep<T>(value: T, secrets: string[] = []): T {
  if (typeof value === 'string') {
    return redactPatterns(redactKnownSecrets(value, secrets)) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactDeep(v, secrets)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactDeep(v, secrets)]),
    ) as T;
  }
  return value;
}
