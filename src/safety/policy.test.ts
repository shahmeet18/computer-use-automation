import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAction, isActionTypeAllowed, isOriginAllowed, type Policy } from './policy.js';

const policy: Policy = {
  allowedOrigins: ['http://localhost:4000'],
  allowedActionTypes: ['click', 'type', 'navigate'],
};

test('isOriginAllowed accepts an allowlisted origin', () => {
  assert.equal(isOriginAllowed('http://localhost:4000/search?memberId=1', policy), true);
});

test('isOriginAllowed rejects an origin not on the list', () => {
  assert.equal(isOriginAllowed('https://example.com/', policy), false);
});

test('isOriginAllowed rejects a garbage URL rather than throwing', () => {
  assert.equal(isOriginAllowed('not-a-url', policy), false);
});

test('isActionTypeAllowed rejects an action type not on the list', () => {
  assert.equal(isActionTypeAllowed('select', policy), false);
});

test('checkAction allows an in-policy navigate', () => {
  const result = checkAction({ type: 'navigate', url: 'http://localhost:4000/search' }, policy);
  assert.equal(result.allowed, true);
});

test('checkAction blocks navigation to an out-of-policy origin', () => {
  const result = checkAction({ type: 'navigate', url: 'https://example.com/' }, policy);
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.match(result.reason, /outside the allowed origins/);
});

test('checkAction blocks an action type not on the list', () => {
  const result = checkAction({ type: 'select' }, policy);
  assert.equal(result.allowed, false);
});
