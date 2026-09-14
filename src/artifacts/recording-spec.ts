import type { Checkpoint, JsonSchemaLike } from './schema.js';

/**
 * What a human reviewer declares, after reading a discovery transcript, to turn it into a
 * capability: which steps belong in the reusable flow (deliberately excluding incidental ones
 * like login -- see the spec files for why), which of their literal values become per-invocation
 * inputs, and which extracted values become outputs. This is the "reviewable" half of the
 * artifact pipeline: recording is not fully automatic, curation is the point.
 */
export interface RecordingSpecField extends JsonSchemaLike {
  name: string;
  /** Discovery-transcript step index whose literal value this input/output binds to. */
  fromStep: number;
}

export interface RecordingSpec {
  id: string;
  version: number;
  name: string;
  description: string;
  target: { baseUrl: string };
  /** Discovery-transcript step indices to include, in order. Steps not listed (e.g. login) are
   *  treated as a precondition of invoking the capability, not part of it. */
  stepIndices: number[];
  inputs: RecordingSpecField[];
  outputs: RecordingSpecField[];
  checkpoint: Checkpoint;
}
