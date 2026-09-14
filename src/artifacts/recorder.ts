import type { DiscoveryRunResult, DiscoveryStep, PerceivedElement } from '../agent/types.js';
import type { RecordingSpec, RecordingSpecField } from './recording-spec.js';
import type { Capability, CapabilityAction, CapabilityStep, LocatorDescriptor } from './schema.js';

export function recordArtifact(
  transcript: DiscoveryRunResult,
  spec: RecordingSpec,
  discoveryRunFile: string,
): Capability {
  const stepsByIndex = new Map(transcript.steps.map((s) => [s.index, s]));
  const inputByStep = new Map(spec.inputs.map((i) => [i.fromStep, i]));
  const outputByStep = new Map(spec.outputs.map((o) => [o.fromStep, o]));
  const templatize = buildTemplatizer(transcript, spec.inputs);

  const riskyStepIndices = new Set(spec.riskyStepIndices);
  const steps: CapabilityStep[] = spec.stepIndices.map((index) => {
    const discoveryStep = stepsByIndex.get(index);
    if (!discoveryStep) {
      throw new Error(`Recording spec "${spec.id}" references step ${index}, not in the transcript`);
    }
    const step = toCapabilityStep(discoveryStep, inputByStep.get(index), outputByStep.get(index), templatize);
    return riskyStepIndices.has(index) ? { ...step, requiresConfirmation: true } : step;
  });

  return {
    id: spec.id,
    version: spec.version,
    name: spec.name,
    description: spec.description,
    target: spec.target,
    inputSchema: toSchema(spec.inputs),
    outputSchema: toSchema(spec.outputs),
    steps,
    checkpoint: spec.checkpoint,
    businessOutcomes: spec.businessOutcomes,
    provenance: {
      discoveryRunFile,
      model: transcript.model,
      sourceGoal: transcript.goal,
      recordedAt: new Date().toISOString(),
    },
  };
}

function toSchema(fields: RecordingSpecField[]): Capability['inputSchema'] {
  return Object.fromEntries(
    fields.map(({ name, fromStep: _fromStep, ...schema }) => [name, schema]),
  );
}

function toCapabilityStep(
  discoveryStep: DiscoveryStep,
  input: RecordingSpecField | undefined,
  output: RecordingSpecField | undefined,
  templatize: (raw: string) => string,
): CapabilityStep {
  const { action, element } = discoveryStep;
  const locator = element ? toLocatorDescriptor(element, templatize) : undefined;

  const capabilityAction: CapabilityAction = (() => {
    switch (action.type) {
      case 'click':
        return { type: 'click', locator: requireLocator(locator, discoveryStep) };
      case 'type':
        return {
          type: 'type',
          locator: requireLocator(locator, discoveryStep),
          value: input ? { kind: 'input', input: input.name } : { kind: 'literal', literal: action.text },
        };
      case 'select':
        return {
          type: 'select',
          locator: requireLocator(locator, discoveryStep),
          value: input ? { kind: 'input', input: input.name } : { kind: 'literal', literal: action.value },
        };
      case 'extract':
        if (!output) {
          throw new Error(
            `Step ${discoveryStep.index}: extract action has no declared output in the recording spec`,
          );
        }
        return { type: 'extract', locator: requireLocator(locator, discoveryStep), output: output.name };
      case 'navigate':
        return { type: 'navigate', url: action.url };
      case 'wait_for':
        return { type: 'wait_for', text: action.text, timeoutMs: action.timeoutMs };
    }
  })();

  return {
    sourceStepIndex: discoveryStep.index,
    description: describeStep(action.type, element),
    action: capabilityAction,
  };
}

function requireLocator(
  locator: LocatorDescriptor | undefined,
  step: DiscoveryStep,
): LocatorDescriptor {
  if (!locator) {
    throw new Error(`Step ${step.index} (${step.action.type}): no perceived element to build a locator from`);
  }
  return locator;
}

function toLocatorDescriptor(
  element: PerceivedElement,
  templatize: (raw: string) => string,
): LocatorDescriptor {
  const name = element.name ? templatize(element.name) : undefined;
  const strategies: LocatorDescriptor['strategies'] = [{ kind: 'role', role: element.role, name }];
  if (name) strategies.push({ kind: 'text', text: name });
  return { strategies };
}

function describeStep(actionType: string, element: PerceivedElement | undefined): string {
  const target = element ? `${element.role}${element.name ? ` "${element.name}"` : ''}` : 'the page';
  switch (actionType) {
    case 'click':
      return `Click ${target}`;
    case 'type':
      return `Type into ${target}`;
    case 'select':
      return `Choose an option in ${target}`;
    case 'extract':
      return `Read the text of ${target}`;
    case 'navigate':
      return 'Navigate directly to a URL';
    case 'wait_for':
      return 'Wait for expected text to appear';
    default:
      return `Perform ${actionType}`;
  }
}

/** Value typed/selected at a given discovery step, for building the substring templatizer. */
function literalValueAt(transcript: DiscoveryRunResult, stepIndex: number): string | undefined {
  const step = transcript.steps.find((s) => s.index === stepIndex);
  if (!step) return undefined;
  if (step.action.type === 'type') return step.action.text;
  if (step.action.type === 'select') return step.action.value;
  return undefined;
}

/**
 * Any recorded input's literal value that shows up verbatim inside a later step's accessible
 * name (e.g. a "View member 12345" link, once memberId=12345 is an input) gets replaced with a
 * {{memberId}} placeholder, so the locator generalizes instead of being pinned to one recording.
 */
function buildTemplatizer(
  transcript: DiscoveryRunResult,
  inputs: RecordingSpecField[],
): (raw: string) => string {
  const replacements = inputs
    .map((input): [string, string] | undefined => {
      const literal = literalValueAt(transcript, input.fromStep);
      return literal ? [literal, `{{${input.name}}}`] : undefined;
    })
    .filter((r): r is [string, string] => r !== undefined)
    .sort((a, b) => b[0].length - a[0].length);

  return (raw: string) => replacements.reduce((acc, [literal, placeholder]) => acc.split(literal).join(placeholder), raw);
}
