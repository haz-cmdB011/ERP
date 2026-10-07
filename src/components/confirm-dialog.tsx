"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

function normalizar(texto: string): string {
  return texto.trim().toLowerCase();
}

// Diálogo de confirmación propio (en vez del confirm() nativo del
// navegador, que en algunos contextos no se llega a mostrar o pasa
// desapercibido) — usado para acciones destructivas o irreversibles.
//
// Con `confirmText` la acción exige escribir ese texto (ej. el número del PM)
// antes de poder confirmarse: para lo que no se puede deshacer.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  confirmText,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmText?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <Contenido
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      destructive={destructive}
      confirmText={confirmText}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

// Se monta solo con el diálogo abierto, así lo escrito empieza vacío cada vez.
function Contenido({
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  confirmText,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  confirmText?: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [escrito, setEscrito] = useState("");
  const habilitado = !confirmText || normalizar(escrito) === normalizar(confirmText);

  const dialogo = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded bg-white p-4 shadow-lg">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-gray-700">{message}</p>
        {confirmText && (
          <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-gray-700">
            Escribe <span className="font-mono text-sm text-gray-900">{confirmText}</span> para confirmar
            <input
              autoFocus
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="rounded border border-gray-300 px-2 py-2 font-mono text-sm font-normal text-gray-900 focus:border-gray-500 focus:outline-none"
            />
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!habilitado || busy}
            className={`rounded px-3 py-2 text-sm font-medium disabled:opacity-50 ${
              destructive ? "bg-red-600 text-white" : "bg-brand-500 text-on-brand hover:bg-brand-400"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  // En un portal: así no hereda la posición de la fila o celda de tabla desde
  // donde se abre (un ancestro con transformaciones rompería el `fixed`).
  return typeof document === "undefined" ? dialogo : createPortal(dialogo, document.body);
}
