"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  children: ReactNode;
  className?: string;
  confirmMessage?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
};

export function ClosingClassButton({ children, className, confirmMessage, name, value, disabled = false }: Props) {
  const { pending } = useFormStatus();
  const [requestedClose, setRequestedClose] = useState(false);
  const closing = pending && requestedClose;

  return (
    <>
      <button
        className={className}
        type="submit"
        name={name}
        value={value}
        disabled={disabled || pending}
        aria-busy={closing}
        onClick={(event) => {
          if (!pending && confirmMessage && !window.confirm(confirmMessage)) {
            event.preventDefault();
            return;
          }
          setRequestedClose(true);
        }}
      >
        {closing ? "Cerrando clase..." : children}
      </button>
      {closing ? (
        <div className="class-closing-overlay" role="alert" aria-live="assertive">
          <div className="class-closing-dialog">
            <span className="class-closing-spinner" aria-hidden="true" />
            <h2>Cerrando clase</h2>
            <p>Esta accion puede tardar varios minutos.</p>
            <p>Confirmare cuando este cerrada en esta misma ventana. Por favor, ten paciencia.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
