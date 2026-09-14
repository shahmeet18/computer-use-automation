import type { Page } from 'playwright';
import type { ActionResult, AgentAction, PageSnapshot } from './types.js';

/**
 * Executes one action against the live page, resolving `ref`s from the
 * snapshot they were perceived in via Playwright's `aria-ref=` locator
 * engine. This is the same primitive both the LLM discovery loop (Milestone
 * 3) and, eventually, the deterministic replay engine's live-session
 * fallback will call -- perception and action are decoupled from any
 * decision-making.
 */
export async function performAction(
  page: Page,
  snapshot: PageSnapshot,
  action: AgentAction,
): Promise<ActionResult> {
  try {
    switch (action.type) {
      case 'click':
        await resolveRef(page, snapshot, action.ref).click();
        return { ok: true, action };

      case 'type':
        await resolveRef(page, snapshot, action.ref).fill(action.text);
        return { ok: true, action };

      case 'select':
        await resolveRef(page, snapshot, action.ref).selectOption(action.value);
        return { ok: true, action };

      case 'extract': {
        const extractedText = (await resolveRef(page, snapshot, action.ref).innerText()).trim();
        return { ok: true, action, extractedText };
      }

      case 'navigate':
        await page.goto(action.url);
        return { ok: true, action };

      case 'wait_for':
        await page
          .getByText(action.text)
          .first()
          .waitFor({ timeout: action.timeoutMs ?? 5000 });
        return { ok: true, action };
    }
  } catch (err) {
    return { ok: false, action, error: err instanceof Error ? err.message : String(err) };
  }
}

function resolveRef(page: Page, snapshot: PageSnapshot, ref: string) {
  if (!snapshot.elements.has(ref)) {
    throw new Error(
      `Unknown ref "${ref}": not present in the current snapshot. Re-perceive before acting.`,
    );
  }
  return page.locator(`aria-ref=${ref}`);
}
