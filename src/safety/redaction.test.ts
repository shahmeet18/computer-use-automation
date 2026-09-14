import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactDeep } from './redaction.js';

test('redactDeep replaces a known secret value anywhere in a nested structure', () => {
  const input = {
    steps: [{ action: { type: 'type', text: 'hunter2' } }, { action: { type: 'click' } }],
  };
  const result = redactDeep(input, ['hunter2']);
  assert.equal(result.steps[0].action.text, '[REDACTED]');
});

test('redactDeep scrubs SSN-shaped text even without a declared secret', () => {
  const result = redactDeep('SSN on file: 123-45-6789');
  assert.equal(result, 'SSN on file: [REDACTED]');
});

test('redactDeep scrubs long digit runs that look like a card number', () => {
  const result = redactDeep('card 4111 1111 1111 1111 on file');
  assert.equal(result, 'card [REDACTED] on file');
});

test('redactDeep leaves ordinary text and non-string values untouched', () => {
  const input = { memberId: '12345', ok: true, count: 3 };
  assert.deepEqual(redactDeep(input), input);
});
