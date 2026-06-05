import { KeyboardEvent } from 'react';

/**
 * Props that make a non-button element (div, td, span) behave like a button for
 * keyboard and screen-reader users. Spread onto the element in place of a bare
 * `onClick`:
 *
 *   <div {...clickable(() => toggle())}>…</div>
 *
 * Adds role="button", makes it focusable, and activates on Enter/Space — the
 * keyboard contract users expect from a button. Prefer a real <button> when the
 * layout allows; use this for table cells / complex layouts where a <button>
 * would fight the existing styling.
 */
export function clickable(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
