import type { RecordingSpec } from '../recording-spec.js';
import { openSubAccountSpec } from './open-sub-account.js';

export const specs: Record<string, RecordingSpec> = {
  'open-sub-account': openSubAccountSpec,
};
