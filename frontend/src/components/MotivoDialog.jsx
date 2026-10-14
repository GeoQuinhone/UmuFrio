import React, { useEffect, useRef, useState } from "react";

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
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

// Modal simples para coletar um texto obrigatório antes de confirmar uma
// ação (ponto 19: motivo do atendimento não realizado). Reaproveita a
// mesma casca visual do ConfirmDialog, mas com um campo de texto livre.
function MotivoDialog({ title, message, placeholder, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    const returnFocusTo = document.activeElement;
    dialogRef.current?.querySelector("[data-dialog-initial-focus]")?.focus();
    return () => {
      if (returnFocusTo?.isConnected && typeof returnFocusTo.focus === "function") {
        returnFocusTo.focus();
      }
    };
  }, []);

  function confirmar() {
    if (!motivo.trim()) {
      setErro("Informe o motivo.");
      return;
    }
    onConfirm(motivo.trim());
  }

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
        className="confirm-dialog confirm-dialog-danger confirm-dialog-motivo"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="motivo-dialog-title"
        aria-describedby="motivo-dialog-message"
        tabIndex="-1"
        onKeyDown={(event) => dialogKeyDown(event, dialogRef.current, onCancel)}
      >
        <h2 id="motivo-dialog-title">{title}</h2>
        <p id="motivo-dialog-message">{message}</p>
        <textarea
          className="input confirm-dialog-textarea"
          data-dialog-initial-focus
          value={motivo}
          onChange={(event) => {
            setMotivo(event.target.value);
            if (erro) setErro("");
          }}
          placeholder={placeholder}
          rows={3}
        />
        {erro && (
          <span className="field-error confirm-dialog-textarea-error">{erro}</span>
        )}
        <div className="confirm-dialog-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn-danger" onClick={confirmar}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

// Hook que abre o modal e resolve uma Promise<string|null> com o motivo
// digitado (ou null se cancelado). Uso: const motivo = await pedirMotivo(...)
export function useMotivoDialog() {
  const [pending, setPending] = useState(null);

  function pedirMotivo(message, options = {}) {
    return new Promise((resolve) => {
      setPending({
        title: options.title || "Informe o motivo",
        message,
        placeholder: options.placeholder || "Descreva o motivo...",
        confirmLabel: options.confirmLabel || "Confirmar",
        cancelLabel: options.cancelLabel || "Cancelar",
        resolve,
      });
    });
  }

  function responder(resultado) {
    pending?.resolve(resultado);
    setPending(null);
  }

  const motivoElement = pending ? (
    <MotivoDialog
      title={pending.title}
      message={pending.message}
      placeholder={pending.placeholder}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      onConfirm={(motivo) => responder(motivo)}
      onCancel={() => responder(null)}
    />
  ) : null;

  return { pedirMotivo, motivoElement };
}

export default MotivoDialog;
