import axe from 'axe-core';

/** The WCAG 2.1 A and AA rules, as the end-to-end suite runs them. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Contrast needs a real layout engine and frames a real browser; the end-to-end suite checks both. */
const OPTIONS = {
  iframes: false,
  runOnly: { type: 'tag' as const, values: WCAG_TAGS },
  rules: { 'color-contrast': { enabled: false } },
};

/** The IDs of the axe violations in an element (case U-12). */
export async function axeViolations(element: Element): Promise<string[]> {
  const results = await axe.run(element, OPTIONS);
  return results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
}
