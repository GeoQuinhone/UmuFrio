// Comportamento comum dos diálogos: Esc fecha e o Tab fica preso dentro do
// diálogo (acessibilidade). Mesma lógica usada em ConfirmDialog/MotivoDialog.
export function dialogKeyDown(event, dialog, onClose) {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
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
  const foraDoDialogo = !dialog.contains(document.activeElement);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog || foraDoDialogo)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog || foraDoDialogo)) {
    event.preventDefault();
    first.focus();
  }
}
