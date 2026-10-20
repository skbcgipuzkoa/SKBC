"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  children: ReactNode;
  className?: string;
  confirmMessage?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  steps?: string[];
};

const DEFAULT_STEPS = [
  "Comprobando asistencias",
  "Guardando el plan tecnico",
  "Actualizando fichas de los kenshis",
  "Recalculando rankings e historiales",
  "Finalizando el cierre"
];

export function ClosingClassButton({ children, className, confirmMessage, name, value, disabled = false, steps = DEFAULT_STEPS }: Props) {
  const { pending } = useFormStatus();
  const [requestedClose, setRequestedClose] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const closing = pending && requestedClose;

  useEffect(() => {
    if (!closing) {
      setActiveStep(0);
      return;
    }

    const timer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, steps.length - 1));
    }, 1800);
    return () => window.clearInterval(timer);
  }, [closing, steps.length]);

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
            <ol className="class-closing-progress" aria-label="Progreso del cierre">
              {steps.map((step, index) => (
                <li className={index < activeStep ? "done" : index === activeStep ? "active" : "waiting"} key={step}>
                  <span aria-hidden="true" />
                  <strong>{step}</strong>
                  <small>{index < activeStep ? "Completado" : index === activeStep ? "Procesando..." : "Pendiente"}</small>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </>
  );
}
