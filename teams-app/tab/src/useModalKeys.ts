import { useEffect, useRef } from 'react';

// Escape did nothing on any of our three overlays, and Tab walked straight out of
// them: after about thirty presses the focus ring was sitting on a deal tab behind a
// 45%-black backdrop, where it could be reached by keyboard but not clicked. This app
// is embedded in Teams, where Escape closes every dialog, so a user who presses it and
// sees nothing happen clicks the backdrop instead -- which on the intake form is the
// discard path.
//
// Returns a ref to put on the panel element. Bind it alongside role="dialog" and
// aria-modal="true" so assistive technology also treats the page behind as inert.
// `active` exists because one caller renders its overlay conditionally from inside a
// component that is always mounted; hooks cannot be, so the flag is.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalKeys(onClose: () => void, active = true) {
  const ref = useRef<HTMLElement | null>(null);
  // onClose is read through a ref so the listener does not need re-binding every
  // render; the intake form's close path depends on state that changes on every
  // keystroke, and re-binding on each one would drop keys.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const panel = ref.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first || panel).focus();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const el = ref.current;
      if (!el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!el.contains(active)) { e.preventDefault(); firstItem.focus(); return; }
      if (e.shiftKey && active === firstItem) { e.preventDefault(); lastItem.focus(); }
      else if (!e.shiftKey && active === lastItem) { e.preventDefault(); firstItem.focus(); }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [active]);

  return ref;
}
