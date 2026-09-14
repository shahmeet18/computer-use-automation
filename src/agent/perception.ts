import type { Page } from 'playwright';
import type { AriaNode, PageSnapshot, PerceivedElement } from './types.js';

/**
 * Perceives the current page as a compact, ref-addressable snapshot.
 *
 * Uses Playwright's `ariaSnapshotJSON({ mode: 'ai' })`, which assigns a
 * stable-for-this-snapshot `ref` (e.g. "e16") to each accessibility-tree
 * node and can be resolved back to a live element via the `aria-ref=`
 * locator engine. This is the same mechanism Playwright's own MCP server
 * uses for AI-driven browser control, so we reuse it instead of
 * reimplementing accessible-name computation and disambiguation ourselves.
 *
 * Refs are only valid for the snapshot they came from -- re-perceive after
 * every action that may change the page.
 */
export async function perceive(page: Page): Promise<PageSnapshot> {
  const roots = (await page.ariaSnapshotJSON({ mode: 'ai' })) as unknown as AriaNode[];
  const elements = new Map<string, PerceivedElement>();
  const lines = roots.map((root) => {
    flatten(root, elements);
    return renderText(root);
  });

  return {
    url: page.url(),
    title: await page.title(),
    text: lines.join('\n'),
    elements,
  };
}

/** Convenience lookup for scripted/manual flows and tests -- not used by the LLM loop. */
export function findRefByRoleName(
  snapshot: PageSnapshot,
  role: string,
  name: string,
): string | undefined {
  for (const el of snapshot.elements.values()) {
    if (el.role === role && (el.name ?? '') === name) return el.ref;
  }
  return undefined;
}

/** Convenience lookup by role alone, for roles that carry text content instead of a name. */
export function findRefByRole(snapshot: PageSnapshot, role: string): string | undefined {
  for (const el of snapshot.elements.values()) {
    if (el.role === role) return el.ref;
  }
  return undefined;
}

function flatten(node: AriaNode, elements: Map<string, PerceivedElement>): void {
  if (node.ref) {
    elements.set(node.ref, {
      ref: node.ref,
      role: node.role,
      name: node.name,
      text: node.text,
      value: node.value,
    });
  }
  for (const child of node.children ?? []) {
    flatten(child, elements);
  }
}

function renderText(node: AriaNode, depth = 0): string {
  const indent = '  '.repeat(depth);
  const name = node.name ? ` "${node.name}"` : '';
  const value = node.value !== undefined ? ` (value: ${node.value})` : '';
  const ref = node.ref ? ` [ref=${node.ref}]` : '';
  const line = `${indent}- ${node.role}${name}${value}${ref}`;
  const children = (node.children ?? []).map((child) => renderText(child, depth + 1));
  return [line, ...children].join('\n');
}
