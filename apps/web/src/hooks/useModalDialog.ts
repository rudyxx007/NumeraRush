import { type RefObject, useEffect } from 'react';

/**
 * Opens a `<dialog>` as a modal: the browser provides the focus trap and
 * Escape-to-close, and focus returns to the control that opened it afterwards.
 */
export function useModalDialog(
  ref: RefObject<HTMLDialogElement | null>,
  active: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!active) return;

    const node = ref.current;
    if (!node) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleCancel = (event: Event): void => {
      event.preventDefault();
      onClose();
    };

    node.addEventListener('cancel', handleCancel);
    try {
      if (!node.open) node.showModal();
    } catch {
      node.setAttribute('open', '');
    }

    return () => {
      node.removeEventListener('cancel', handleCancel);
      if (node.open) node.close();
      previous?.focus();
    };
  }, [active, onClose, ref]);
}
