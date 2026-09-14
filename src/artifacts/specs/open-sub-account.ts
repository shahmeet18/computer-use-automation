import type { RecordingSpec } from '../recording-spec.js';

/**
 * Recorded from a discovery transcript whose goal was: "Log in, look up member 12345, open a new
 * CHECKING sub-account for them with a 250 dollar initial deposit, confirm it, and read back the
 * confirmation message." Steps 0-2 (login) are deliberately excluded: authentication/session
 * establishment is a cross-cutting concern owned by the replay host for a given tenant session,
 * not baked into each capability -- and login credentials must never be persisted inside a
 * versioned, reviewable artifact file.
 */
export const openSubAccountSpec: RecordingSpec = {
  id: 'open-sub-account',
  version: 1,
  name: 'Open Sub-Account',
  description:
    'Looks up a member by ID and opens a new sub-account (savings or checking) with a given ' +
    'initial deposit, confirms it, and reports back the confirmation message. Precondition: the ' +
    'caller already has an authenticated session against the target app.',
  target: { baseUrl: 'http://localhost:4000' },
  stepIndices: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  inputs: [
    {
      name: 'memberId',
      type: 'string',
      description: 'Member ID to search for and open the sub-account under',
      fromStep: 3,
    },
    {
      name: 'accountType',
      type: 'string',
      description: 'Sub-account type to open',
      enum: ['savings', 'checking'],
      fromStep: 7,
    },
    {
      name: 'initialDeposit',
      type: 'string',
      description: 'Initial deposit amount in whole/decimal dollars (minimum $25)',
      fromStep: 8,
    },
  ],
  outputs: [
    {
      name: 'confirmationMessage',
      type: 'string',
      description: 'Raw confirmation text shown after the sub-account is created',
      fromStep: 11,
    },
  ],
  checkpoint: { type: 'text_present', text: 'New sub-account' },
};
