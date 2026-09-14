import type { ToolSpec } from './llm.js';
import type { AgentAction } from './types.js';

export const TOOLS: ToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'click',
      description: 'Click the element with the given ref.',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'string', description: 'Element ref from the latest snapshot, e.g. "e16"' } },
        required: ['ref'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'type',
      description: 'Type text into the textbox with the given ref, replacing its current value.',
      parameters: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['ref', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'select',
      description: 'Choose an option (by its underlying value, not its visible label) in the combobox with the given ref.',
      parameters: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['ref', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'extract',
      description: 'Read and return the text content of the element with the given ref. Use this to capture output data the goal asks for.',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'string' } },
        required: ['ref'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Navigate the browser directly to a URL.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait_for',
      description: 'Wait until the given text appears on the page (e.g. after a slow action).',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          timeoutMs: { type: 'number' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description:
        'Stop the run. Use status "success" once the goal is fully accomplished, including any requested outputs. Use status "stuck" if you cannot safely or reliably proceed (e.g. repeated failures, an action outside what you were asked to do, or something requiring a human decision) -- explain why in summary.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['success', 'stuck'] },
          summary: { type: 'string' },
          outputs: {
            type: 'object',
            description: 'Any data the goal asked you to extract/report back.',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['status', 'summary'],
      },
    },
  },
];

export function toAgentAction(
  name: string,
  args: Record<string, unknown>,
): AgentAction {
  switch (name) {
    case 'click':
      return { type: 'click', ref: String(args.ref) };
    case 'type':
      return { type: 'type', ref: String(args.ref), text: String(args.text ?? '') };
    case 'select':
      return { type: 'select', ref: String(args.ref), value: String(args.value ?? '') };
    case 'extract':
      return { type: 'extract', ref: String(args.ref) };
    case 'navigate':
      return { type: 'navigate', url: String(args.url) };
    case 'wait_for':
      return {
        type: 'wait_for',
        text: String(args.text ?? ''),
        timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
      };
    default:
      throw new Error(`Unknown tool "${name}"`);
  }
}
