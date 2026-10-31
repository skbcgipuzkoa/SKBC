"use client";
import {
  Children,
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
export type ExamNavigationStep = {
  id: string;
  title: string;
  kind: "exercise" | "cut" | "finish";
  continueLabel?: string;
};
type Adjustment = { eventStudentId: string; delta: 1 | -1; reason: string };
export function StudentExamPhoto({
  src,
  name,
}: {
  src: string | null;
  name: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src)
    return (
      <span
        className="exam-student-photo exam-student-photo-fallback"
        role="img"
        aria-label={`Sin foto de ${name}`}
      >
        {name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase() || "?"}
      </span>
    );
  return (
    <img
      className="exam-student-photo"
      src={src}
      alt={`Foto de ${name}`}
      width={72}
      height={72}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  );
}
export function ExamScoreFeedback({
  children,
  initialScore,
  initialNotes,
  name,
  studentName,
}: {
  children: ReactNode;
  initialScore: string;
  initialNotes: string;
  name: string;
  studentName: string;
}) {
  const [score, setScore] = useState(initialScore);
  const [notes, setNotes] = useState(initialNotes);
  const suggestNote = (score === "0" || score === "5") && !notes.trim();
  return (
    <div
      className="exam-score-feedback"
      onChange={(event) => {
        const target = event.target as HTMLInputElement;
        if (target.type === "radio") setScore(target.value);
      }}
    >
      {children}
      <div className="exam-group-notes">
        {suggestNote ? (
          <p className="exam-feedback-hint" role="status">
            Puedes anadir que necesita mejorar. Es opcional.
          </p>
        ) : null}
        <details open={initialNotes.trim() ? true : undefined}>
          <summary>
            {suggestNote ? "Anadir nota (opcional)" : "Observaciones"}
          </summary>
          <label>
            Observaciones de {studentName}
            <textarea
              name={name}
              rows={2}
              maxLength={4000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Que necesita aprender o mejorar..."
            />
          </label>
          <p className="muted">
            Esta nota aparecera en el informe individual del alumno.
          </p>
        </details>
      </div>
    </div>
  );
}
const PointsContext = createContext<{
  adjustments: Adjustment[];
  add: (entry: Adjustment) => void;
} | null>(null);

export function StudentPointControls({
  studentId,
  name,
}: {
  studentId: string;
  name: string;
}) {
  const points = useContext(PointsContext);
  const [delta, setDelta] = useState<1 | -1 | null>(null);
  const [reason, setReason] = useState("");
  if (!points) return null;
  const total = points.adjustments
    .filter((entry) => entry.eventStudentId === studentId)
    .reduce((sum, entry) => sum + entry.delta, 0);
  return (
    <div className="exam-student-points">
      <div className="exam-student-point-buttons">
        <button
          type="button"
          className="secondary-button"
          aria-label={`Sumar un punto a ${name}`}
          disabled={points.adjustments.length >= 100}
          onClick={() => {
            setDelta(1);
            setReason("");
          }}
        >
          +1
        </button>
        <span role="status">
          Extra: {total > 0 ? "+" : ""}
          {total}
        </span>
        <button
          type="button"
          className="secondary-button"
          aria-label={`Restar un punto a ${name}`}
          disabled={points.adjustments.length >= 100}
          onClick={() => {
            setDelta(-1);
            setReason("");
          }}
        >
          −1
        </button>
      </div>
      {delta !== null ? (
        <div className="exam-student-point-reason">
          <label>
            Motivo del {delta > 0 ? "+1" : "−1"} para {name}
            <input
              autoFocus
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!reason.trim() || points.adjustments.length >= 100}
            onClick={() => {
              points.add({
                eventStudentId: studentId,
                delta,
                reason: reason.trim(),
              });
              setDelta(null);
              setReason("");
            }}
          >
            Guardar punto
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setDelta(null)}
          >
            Cancelar
          </button>
        </div>
      ) : null}
    </div>
  );
}
export function findCompletedCutoff(
  steps: Pick<ExamNavigationStep, "id" | "kind">[],
  index: number,
  complete: Array<boolean | null>,
) {
  let cutoff = -1;
  for (let i = 0; i <= index; i++) {
    if (steps[i]?.kind !== "exercise") continue;
    if (complete[i] === null) continue;
    if (!complete[i]) break;
    cutoff = i;
  }
  return cutoff;
}
export function ExamStepNavigator({
  steps,
  children,
  students = [],
  initialAdjustments = [],
}: {
  steps: ExamNavigationStep[];
  children: ReactNode;
  students?: { id: string; name: string }[];
  initialAdjustments?: Adjustment[];
}) {
  const screens = Children.toArray(children);
  const [index, setIndex] = useState(0);
  const [completion, setCompletion] = useState({
    answered: 0,
    total: 0,
    ready: false,
  });
  const [adjustments, setAdjustments] =
    useState<Adjustment[]>(initialAdjustments);
  const [stopReason, setStopReason] = useState("");
  const [confirmCutoff, setConfirmCutoff] = useState<number | null>(null);
  const [stop, setStop] = useState<{
    cutoff: number;
    reason: string;
    from: number;
  } | null>(null);
  const [availableCutoff, setAvailableCutoff] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const screenRefs = useRef<Array<HTMLDivElement | null>>([]);
  const last = index === steps.length - 1;
  const step = steps[index];
  function screenCompletion(screenIndex: number) {
    const radios = Array.from(
      screenRefs.current[screenIndex]?.querySelectorAll<HTMLInputElement>(
        'input[type="radio"][required]',
      ) ?? [],
    );
    const groups = [...new Set(radios.map((radio) => radio.name))];
    const answered = groups.filter((name) =>
      radios.some((radio) => radio.name === name && radio.checked),
    ).length;
    return {
      answered,
      total: groups.length,
      ready: groups.length === answered,
    };
  }
  const checkCurrentStep = useCallback(() => {
    const result = screenCompletion(index);
    setCompletion(result);
    const cutoff = findCompletedCutoff(
      steps,
      index,
      steps.map((_, i) => {
        const state = screenCompletion(i);
        return state.total ? state.ready : null;
      }),
    );
    const hasNumeric = screenRefs.current
      .slice(0, cutoff + 1)
      .some((screen) =>
        Array.from(
          screen?.querySelectorAll<HTMLInputElement>(
            'input[type="radio"]:checked',
          ) ?? [],
        ).some(
          (radio) =>
            radio.value !== "skip" &&
            radio.value !== "" &&
            Number.isFinite(Number(radio.value)),
        ),
      );
    setAvailableCutoff(hasNumeric ? cutoff : -1);
    return result.ready;
  }, [index, steps]);
  useEffect(() => {
    checkCurrentStep();
  }, [checkCurrentStep]);
  useEffect(() => {
    const form = root.current?.closest("form");
    const guard = (event: Event) => {
      if (!last) event.preventDefault();
    };
    form?.addEventListener("submit", guard, true);
    return () => form?.removeEventListener("submit", guard, true);
  }, [last]);
  // Disabled fieldsets omit all later controls from native validation and FormData.
  // Unmounting their disabled state on resume restores the original uncontrolled values.
  function goTo(next: number) {
    if (next < 0 || next >= steps.length) return;
    setIndex(next);
    root.current?.scrollIntoView({ block: "start", behavior: "instant" });
    requestAnimationFrame(() =>
      screenRefs.current[next]?.focus({ preventScroll: true }),
    );
  }
  function resume() {
    if (!stop) return;
    const from = stop.from;
    setStop(null);
    setConfirmCutoff(null);
    goTo(from);
  }
  if (!step || screens.length !== steps.length)
    return (
      <p className="form-error">No se pudo preparar el recorrido del examen.</p>
    );
  return (
    <PointsContext.Provider
      value={{
        adjustments,
        add: (entry) =>
          setAdjustments((current) =>
            current.length < 100 ? [...current, entry] : current,
          ),
      }}
    >
      <div
        className="exam-step-navigator"
        ref={root}
        onChange={checkCurrentStep}
      >
        <input
          type="hidden"
          name="examAdjustments"
          value={JSON.stringify(adjustments)}
        />
        {stop ? (
          <>
            <input
              type="hidden"
              name="stopAfterItemId"
              value={steps[stop.cutoff].id}
            />
            <input type="hidden" name="stopReason" value={stop.reason} />
          </>
        ) : null}
        <div className="exam-step-progress" aria-live="polite">
          <p>
            Paso {index + 1} de {steps.length} ·{" "}
            {step.kind === "cut"
              ? "Se sientan"
              : step.kind === "finish"
                ? "Finalizar"
                : "Tecnica o ejercicio"}
          </p>
          <progress
            max={steps.length}
            value={index + 1}
            aria-label="Progreso del examen"
          />
        </div>
        <details className="card exam-session-adjustments">
          <summary>
            Puntos extra y penalizaciones ({adjustments.length})
          </summary>
          <p>
            Se suman o restan al total de puntos acumulados; no cambian las
            notas de las tecnicas. Cada punto requiere su motivo y puedes
            eliminar una entrada erronea.
          </p>
          {adjustments.length >= 100 ? (
            <p role="status">
              Limite de 100 entradas. Elimina una entrada erronea antes de
              anadir otra.
            </p>
          ) : null}
          <ul>
            {adjustments.map((entry, i) => (
              <li key={i}>
                <strong>
                  {
                    students.find(
                      (student) => student.id === entry.eventStudentId,
                    )?.name
                  }
                </strong>{" "}
                {entry.delta > 0 ? "+1" : "−1"}: {entry.reason}{" "}
                <button
                  type="button"
                  className="secondary-button"
                  aria-label={`Eliminar punto ${i + 1}`}
                  onClick={() =>
                    setAdjustments((current) =>
                      current.filter((_, entryIndex) => entryIndex !== i),
                    )
                  }
                >
                  Eliminar entrada
                </button>
              </li>
            ))}
          </ul>
        </details>
        {screens.map((screen, screenIndex) => (
          <div
            className="exam-wizard-step"
            key={steps[screenIndex].id}
            ref={(element) => {
              screenRefs.current[screenIndex] = element;
            }}
            hidden={screenIndex !== index}
            inert={screenIndex !== index}
            tabIndex={-1}
            aria-label={steps[screenIndex].title}
          >
            <fieldset
              className="exam-step-fieldset"
              disabled={Boolean(
                stop &&
                screenIndex > stop.cutoff &&
                steps[screenIndex].kind !== "finish",
              )}
            >
              {steps[screenIndex].kind === "finish" ? (
                <div className="exam-session-finish">
                  <h2>
                    {stop
                      ? "Examen terminado antes del final"
                      : "Recorrido completado"}
                  </h2>
                  {stop ? (
                    <>
                      <p>
                        Ultima actividad completada:{" "}
                        <strong>{steps[stop.cutoff].title}</strong>. Solo se
                        enviaran las actividades completas hasta aqui. Las
                        posteriores quedan fuera del recorrido y no puntuan como
                        cero.
                      </p>
                      <p>Motivo: {stop.reason}</p>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={resume}
                      >
                        Cancelar fin anticipado y continuar examen
                      </button>
                    </>
                  ) : (
                    <p>
                      Has terminado las valoraciones y los cortes. Puedes volver
                      atras para revisar antes de enviar.
                    </p>
                  )}
                </div>
              ) : null}
              {screen}
            </fieldset>
          </div>
        ))}
        {confirmCutoff !== null ? (
          <section
            className="card exam-stop-confirmation"
            aria-label="Confirmar fin anticipado"
          >
            <h2>Terminar examen aqui</h2>
            <p>
              Ultima actividad completada:{" "}
              <strong>{steps[confirmCutoff].title}</strong>. Una actividad
              parcialmente valorada queda fuera, junto con todas las
              posteriores.
            </p>
            <label>
              Motivo del fin anticipado
              <textarea
                value={stopReason}
                maxLength={1000}
                onChange={(event) => setStopReason(event.target.value)}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                disabled={!stopReason.trim()}
                onClick={() => {
                  setStop({
                    cutoff: confirmCutoff,
                    reason: stopReason.trim(),
                    from: index,
                  });
                  setConfirmCutoff(null);
                  goTo(steps.length - 1);
                }}
              >
                Confirmar y revisar envio
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirmCutoff(null)}
              >
                Seguir examinando
              </button>
            </div>
          </section>
        ) : null}
        <section className="card sticky-submit-card exam-step-controls">
          <button
            type="button"
            className="secondary-button"
            disabled={index === 0}
            onClick={() => {
              if (stop) resume();
              else goTo(index - 1);
            }}
          >
            Anterior
          </button>
          {!last ? (
            <>
              <p className="muted" role="status">
                {completion.answered}/{completion.total} kenshis valorados.
                Puedes usar Omitir.
              </p>
              <button
                type="button"
                disabled={!completion.ready}
                onClick={() => {
                  if (checkCurrentStep()) goTo(index + 1);
                }}
              >
                {step.continueLabel ?? "Continuar"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={availableCutoff < 0}
                onClick={() => {
                  checkCurrentStep();
                  setConfirmCutoff(availableCutoff);
                }}
              >
                Terminar examen aqui
              </button>
            </>
          ) : (
            <p className="muted">
              Revisa lo necesario con Anterior o envia la evaluacion.
            </p>
          )}
        </section>
      </div>
    </PointsContext.Provider>
  );
}
