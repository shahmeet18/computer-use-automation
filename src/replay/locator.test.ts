import assert from 'node:assert/strict';
import { test } from 'node:test';
import { substitute } from './locator.js';

test('substitute replaces a known placeholder with its bound value', () => {
  assert.equal(substitute('View member {{memberId}}', { memberId: '12345' }), 'View member 12345');
});

test('substitute replaces multiple distinct placeholders', () => {
  assert.equal(
    substitute('{{greeting}}, {{memberId}}', { greeting: 'Hello', memberId: '99' }),
    'Hello, 99',
  );
});

test('substitute leaves an unbound placeholder as empty string rather than throwing', () => {
  assert.equal(substitute('Hello {{name}}', {}), 'Hello ');
});

test('substitute leaves text without placeholders untouched', () => {
  assert.equal(substitute('Search', { memberId: '12345' }), 'Search');
});
