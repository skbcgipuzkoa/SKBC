"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Props = { children: ReactNode; className?: string; confirmMessage?: string; name?: string; value?: string; disabled?: boolean };

const STEPS = [
  { id: "attendance", label: "Guardando asistencias" },
  { id: "technical", label: "Guardando el plan tecnico" },
  { id: "profiles", label: "Actualizando fichas e historiales" },
  { id: "rankings", label: "Recalculando rankings y examenes" },
  { id: "finalizing", label: "Finalizando el cierre" }
];

type ProgressPayload = { current_step?: string; completed_steps?: string[]; status?: string; error_message?: string | null };

export function ClosingClassButton({ children, className, confirmMessage, name, value, disabled = false }: Props) {
  const { pending } = useFormStatus();
  const [requestedClose, setRequestedClose] = useState(false);
  const [progressId] = useState(() => crypto.randomUUID());
  const [progress, setProgress] = useState<ProgressPayload>({ current_step: "attendance", completed_steps: [] });

  useEffect(() => {
    if (!requestedClose) return;
    let cancelled = false;
    const readProgress = async () => {
      try {
        const response = await fetch(`/api/class-closure-progress/${progressId}`, { cache: "no-store" });
        if (!cancelled && response.ok) setProgress(await response.json());
      } catch {
        // The close request remains authoritative; polling retries until navigation.
      }
    };
    void readProgress();
    const timer = window.setInterval(readProgress, 700);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [progressId, requestedClose]);

  return (
    <>
      <button className={className} type="submit" name={name} value={value} disabled={disabled || pending} aria-busy={requestedClose}
        onClick={(event) => {
          if (!pending && confirmMessage && !window.confirm(confirmMessage)) { event.preventDefault(); return; }
          setRequestedClose(true);
        }}>
        {requestedClose ? "Cerrando clase..." : children}
      </button>
      <input type="hidden" name="closureProgressId" value={progressId} />
      {requestedClose ? (
        <div className="class-closing-overlay" role="alert" aria-live="assertive">
          <div className="class-closing-dialog">
            <span className="class-closing-spinner" aria-hidden="true" />
            <h2>Cerrando clase</h2>
            <p>Esta accion puede tardar varios minutos.</p>
            <p>Confirmare cuando este cerrada en esta misma ventana. Por favor, ten paciencia.</p>
            <ol className="class-closing-progress" aria-label="Progreso real del cierre">
              {STEPS.map((step) => {
                const completed = progress.completed_steps?.includes(step.id);
                const active = progress.current_step === step.id && progress.status !== "failed";
                return <li className={completed ? "done" : active ? "active" : "waiting"} key={step.id}>
                  <span aria-hidden="true" /><strong>{step.label}</strong>
                  <small>{completed ? "Completado" : active ? "Procesando..." : "Pendiente"}</small>
                </li>;
              })}
            </ol>
            {progress.status === "failed" ? <p className="form-error">El cierre se ha detenido: {progress.error_message || "revisa la clase desde administracion."}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
