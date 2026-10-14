import React, { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

function dialogKeyDown(event, dialog, onCancel) {
  if (event.key === "Escape") {
    event.preventDefault();
    onCancel();
    return;
  }
  if (event.key !== "Tab" || !dialog) return;

  const focusable = Array.from(
    dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (
    event.shiftKey &&
    (document.activeElement === first ||
      document.activeElement === dialog ||
      !dialog.contains(document.activeElement))
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last ||
      document.activeElement === dialog ||
      !dialog.contains(document.activeElement))
  ) {
    event.preventDefault();
    first.focus();
  }
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const returnFocusTo = document.activeElement;
    dialogRef.current?.querySelector("[data-dialog-initial-focus]")?.focus();

    return () => {
      if (returnFocusTo?.isConnected && typeof returnFocusTo.focus === "function") {
        returnFocusTo.focus();
      }
    };
  }, []);

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className={`confirm-dialog${danger ? " confirm-dialog-danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        tabIndex="-1"
        onKeyDown={(event) => dialogKeyDown(event, dialogRef.current, onCancel)}
      >
        <div className="confirm-dialog-icon" aria-hidden="true">
          <Icon name={danger ? "alertTriangle" : "check"} size={22} />
        </div>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="btn-ghost"
            data-dialog-initial-focus
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

// Hook que substitui window.confirm por um modal visual acessível.
// Uso: const { confirm, confirmElement } = useConfirm();
//      const ok = await confirm("Excluir este item?", { danger: true });
//      ...renderizar {confirmElement} em algum ponto do JSX da página.
export function useConfirm() {
  const [pending, setPending] = useState(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setPending({
        title: options.title || "Confirmar ação",
        message,
        confirmLabel: options.confirmLabel || "Confirmar",
        cancelLabel: options.cancelLabel || "Cancelar",
        danger: options.danger ?? true,
        resolve,
      });
    });
  }, []);

  function responder(resultado) {
    pending?.resolve(resultado);
    setPending(null);
  }

  const confirmElement = pending ? (
    <ConfirmDialog
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      danger={pending.danger}
      onConfirm={() => responder(true)}
      onCancel={() => responder(false)}
    />
  ) : null;

  return { confirm, confirmElement };
}

export default ConfirmDialog;
