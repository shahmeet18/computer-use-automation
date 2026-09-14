import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DiscoveryRunResult } from '../agent/types.js';
import { recordArtifact } from './recorder.js';
import type { RecordingSpec } from './recording-spec.js';

const transcript: DiscoveryRunResult = {
  status: 'success',
  summary: 'test',
  outputs: {},
  steps: [
    {
      index: 0,
      timestamp: '2026-01-01T00:00:00.000Z',
      snapshotUrl: 'http://x/search',
      action: { type: 'type', ref: 'e1', text: '12345' },
      element: { ref: 'e1', role: 'textbox', name: 'Member ID' },
      result: { ok: true, action: { type: 'type', ref: 'e1', text: '12345' } },
    },
    {
      index: 1,
      timestamp: '2026-01-01T00:00:01.000Z',
      snapshotUrl: 'http://x/search?memberId=12345',
      action: { type: 'click', ref: 'e2' },
      element: { ref: 'e2', role: 'link', name: 'View member 12345' },
      result: { ok: true, action: { type: 'click', ref: 'e2' } },
    },
  ],
  policyBlocks: [],
  model: 'test-model',
  goal: 'test goal',
  startUrl: 'http://x/search',
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T00:00:02.000Z',
};

const spec: RecordingSpec = {
  id: 'test-cap',
  version: 1,
  name: 'Test',
  description: 'test',
  target: { baseUrl: 'http://x', entryPath: '/search' },
  stepIndices: [0, 1],
  inputs: [{ name: 'memberId', type: 'string', description: 'id', fromStep: 0 }],
  outputs: [],
  checkpoint: { type: 'text_present', text: 'ok' },
  businessOutcomes: [],
  riskyStepIndices: [],
};

test('recordArtifact templatizes a later step name that embeds an earlier input value', () => {
  const capability = recordArtifact(transcript, spec, 'evidence/test.json');
  const step1 = capability.steps[1];
  assert.equal(step1.action.type, 'click');
  if (step1.action.type === 'click') {
    const roleStrategy = step1.action.locator.strategies.find((s) => s.kind === 'role');
    assert.equal(roleStrategy && roleStrategy.kind === 'role' ? roleStrategy.name : undefined, 'View member {{memberId}}');
  }
});

test('recordArtifact binds a type action with a declared input to a ValueSource input', () => {
  const capability = recordArtifact(transcript, spec, 'evidence/test.json');
  const step0 = capability.steps[0];
  assert.equal(step0.action.type, 'type');
  if (step0.action.type === 'type') {
    assert.deepEqual(step0.action.value, { kind: 'input', input: 'memberId' });
  }
});

test('recordArtifact leaves an untemplated literal for a type action with no declared input', () => {
  const noInputSpec: RecordingSpec = { ...spec, inputs: [] };
  const capability = recordArtifact(transcript, noInputSpec, 'evidence/test.json');
  const step0 = capability.steps[0];
  assert.equal(step0.action.type, 'type');
  if (step0.action.type === 'type') {
    assert.deepEqual(step0.action.value, { kind: 'literal', literal: '12345' });
  }
});

test('recordArtifact throws when the spec references a step not in the transcript', () => {
  const badSpec: RecordingSpec = { ...spec, stepIndices: [0, 99] };
  assert.throws(() => recordArtifact(transcript, badSpec, 'evidence/test.json'));
});
