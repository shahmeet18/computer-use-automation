import type { Locator, Page } from 'playwright';
import type { LocatorDescriptor, LocatorStrategy } from '../artifacts/schema.js';

export function substitute(template: string, inputs: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => inputs[name] ?? '');
}

/**
 * Tries each strategy in ranked order (most to least robust) and returns the first that resolves
 * to exactly one element. Recording which strategy worked is how replay surfaces locator drift.
 */
export async function resolveLocator(
  page: Page,
  descriptor: LocatorDescriptor,
  inputs: Record<string, string>,
): Promise<{ locator: Locator; strategy: LocatorStrategy } | null> {
  for (const strategy of descriptor.strategies) {
    const candidate =
      strategy.kind === 'role'
        ? strategy.name
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            page.getByRole(strategy.role as any, { name: substitute(strategy.name, inputs), exact: true })
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            page.getByRole(strategy.role as any)
        : page.getByText(substitute(strategy.text, inputs), { exact: true });

    if ((await candidate.count()) >= 1) {
      return { locator: candidate.first(), strategy };
    }
  }
  return null;
}
