import type { AdultExamStatusPanel as AdultExamStatusPanelModel } from "@/lib/adult-exam-status-panel";

export function AdultExamStatusPanel({ panel }: { panel: AdultExamStatusPanelModel }) {
  return (
    <section
      className={`adult-exam-panel ficha-${normalizeTone(panel.semaphore)}`}
      aria-labelledby="adult-exam-status-title"
    >
      <header className="adult-exam-panel-header">
        <span className="adult-exam-light" aria-hidden="true" />
        <div>
          <span className="ficha-alert-label">Semáforo próximo examen</span>
          <h2 id="adult-exam-status-title">{panel.title}</h2>
          <p>{panel.nextExamLabel}</p>
        </div>
        {panel.reactivationNotice ? (
          <aside className="adult-exam-reactivation" aria-label={panel.reactivationNotice.title}>
            <strong>{panel.reactivationNotice.title}</strong>
            <p>{panel.reactivationNotice.detail}</p>
          </aside>
        ) : null}
      </header>

      <div className="adult-exam-criteria">
        {panel.criteria.map((criterion) => (
          <article className={`adult-exam-criterion criterion-${criterion.tone}`} key={criterion.id}>
            <div className="adult-exam-criterion-heading">
              <strong>{criterion.label}</strong>
              <span>{criterion.value}</span>
            </div>
            <div
              className="adult-exam-progress"
              role="progressbar"
              aria-label={criterion.label}
              {...progressAria(criterion.progress, criterion.value)}
            >
              <span style={{ width: `${criterion.progress ?? 0}%` }} />
            </div>
            {criterion.secondaryProgress ? (
              <div className="adult-exam-secondary-progress">
                <div>
                  <span>{criterion.secondaryProgress.label}</span>
                  <strong>{criterion.secondaryProgress.value}</strong>
                </div>
                <div
                  className="adult-exam-progress"
                  role="progressbar"
                  aria-label={criterion.secondaryProgress.label}
                  {...progressAria(criterion.secondaryProgress.progress, criterion.secondaryProgress.value)}
                >
                  <span style={{ width: `${criterion.secondaryProgress.progress ?? 0}%` }} />
                </div>
              </div>
            ) : null}
            <small>{criterion.detail}</small>
          </article>
        ))}
      </div>

      <p className="adult-exam-summary">{panel.summary}</p>
    </section>
  );
}

function normalizeTone(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["azul", "rojo", "amarillo", "verde", "gris"].includes(normalized)
    ? normalized
    : "gris";
}

function progressAria(progress: number | null, value: string) {
  return progress === null
    ? { "aria-valuetext": value }
    : {
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": progress,
        "aria-valuetext": `${value}, ${progress}%`
      };
}
