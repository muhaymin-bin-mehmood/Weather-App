import { useEffect, useId, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Native <dialog> with showModal(): focus is trapped, Escape cancels and the
 * rest of the page is inert. We restore focus to whatever opened it.
 */
export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      cancelRef.current?.focus(); // safe default: the non-destructive action
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onClose = () => {
      const target = returnFocus.current;
      if (target && document.contains(target)) target.focus();
    };
    const onCancelEvent = (e: Event) => {
      e.preventDefault();
      onCancel();
    };
    dialog.addEventListener('close', onClose);
    dialog.addEventListener('cancel', onCancelEvent);
    return () => {
      dialog.removeEventListener('close', onClose);
      dialog.removeEventListener('cancel', onCancelEvent);
    };
  }, [onCancel]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={body ? bodyId : undefined}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself) cancels.
        if (e.target === ref.current) onCancel();
      }}
    >
      <div className="dialog-body">
        <h2 id={titleId}>{title}</h2>
        {body ? <p id={bodyId}>{body}</p> : null}
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button button-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
