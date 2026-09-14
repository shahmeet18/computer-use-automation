import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';

const CREDENTIALS = { username: 'operator', password: 'password123' };
const SESSION_COOKIE = 'legacy_bank_session';

const sessions = new Set<string>();

export function createSession(): string {
  const token = crypto.randomBytes(16).toString('hex');
  sessions.add(token);
  return token;
}

export function destroySession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

export function isValidCredentials(username: string, password: string): boolean {
  return username === CREDENTIALS.username && password === CREDENTIALS.password;
}

function getSessionToken(req: Request): string | undefined {
  const raw = req.headers.cookie ?? '';
  const match = raw
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return match?.split('=')[1];
}

export function setSessionCookie(res: Response, token: string): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; Path=/`);
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
}

/**
 * Requires a valid session. A `?simulateTimeout=1` query param on any
 * authenticated route simulates an expired session even if the cookie is
 * still present -- a stand-in for the "session/timeout expiry" runtime
 * condition the replay engine has to detect and recover from later.
 */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const token = getSessionToken(req);
  const simulateTimeout = req.query.simulateTimeout === '1';

  if (!token || !sessions.has(token) || simulateTimeout) {
    if (token && simulateTimeout) sessions.delete(token);
    clearSessionCookie(res);
    res.redirect('/login');
    return;
  }

  next();
}
