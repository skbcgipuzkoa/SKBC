"use client";

import {
  Children,
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

export function ExamStepNavigator({
  steps,
  children,
}: {
  steps: ExamNavigationStep[];
  children: ReactNode;
}) {
  const screens = Children.toArray(children);
  const [index, setIndex] = useState(0);
  const [completion, setCompletion] = useState({
    answered: 0,
    total: 0,
    ready: false,
  });
  const root = useRef<HTMLDivElement>(null);
  const screenRefs = useRef<Array<HTMLDivElement | null>>([]);
  const last = index === steps.length - 1;
  const step = steps[index];

  const checkCurrentStep = useCallback(() => {
    const radios = Array.from(
      screenRefs.current[index]?.querySelectorAll<HTMLInputElement>(
        'input[type="radio"][required]',
      ) ?? [],
    );
    const groups = [...new Set(radios.map((radio) => radio.name))];
    const answered = groups.filter((name) =>
      radios.some((radio) => radio.name === name && radio.checked),
    ).length;
    const result = {
      answered,
      total: groups.length,
      ready: answered === groups.length,
    };
    setCompletion(result);
    return result.ready;
  }, [index]);

  useEffect(() => {
    checkCurrentStep();
  }, [checkCurrentStep]);
  useEffect(() => {
    const form = root.current?.closest("form");
    const guardSubmission = (event: Event) => {
      if (!last) event.preventDefault();
    };
    form?.addEventListener("submit", guardSubmission, true);
    return () => form?.removeEventListener("submit", guardSubmission, true);
  }, [last]);

  function goTo(next: number) {
    if (next < 0 || next >= steps.length) return;
    setIndex(next);
    root.current?.scrollIntoView({ block: "start", behavior: "instant" });
    // Focus the new screen heading after React has changed which screen is visible.
    requestAnimationFrame(() =>
      screenRefs.current[next]?.focus({ preventScroll: true }),
    );
  }

  if (!step || screens.length !== steps.length)
    return (
      <p className="form-error">No se pudo preparar el recorrido del examen.</p>
    );

  return (
    <div className="exam-step-navigator" ref={root} onChange={checkCurrentStep}>
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
          {screen}
        </div>
      ))}
      <section className="card sticky-submit-card exam-step-controls">
        <button
          type="button"
          className="secondary-button"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
        >
          Anterior
        </button>
        {!last ? (
          <>
            {completion.total > 0 ? (
              <p className="muted" role="status">
                {completion.answered}/{completion.total} kenshis valorados.
                Puedes usar Omitir.
              </p>
            ) : null}
            <button
              type="button"
              disabled={!completion.ready}
              onClick={() => {
                if (checkCurrentStep()) goTo(index + 1);
              }}
            >
              {step.continueLabel ?? "Continuar"}
            </button>
          </>
        ) : (
          <p className="muted">
            Revisa lo necesario con Anterior o envia la evaluacion.
          </p>
        )}
      </section>
    </div>
  );
}
