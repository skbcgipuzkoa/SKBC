import type { AdultGakkaPlan } from "@/lib/adult-exam-gakka";
import { saveAdultWrittenGakkaSelectionAction } from "@/app/examenes/written-gakka-actions";

export function WrittenGakkaPlan({ eventId, plans, selected, locked }: { eventId: string; plans: AdultGakkaPlan[]; selected: Record<string, string[]>; locked: boolean }) {
  return <section className="card" id="gakka-escrito"><h2>Gakka escrito · preparación fuera del examen físico</h2>
    <p>Todos los escritos se preparan en casa y quedan fuera de la evaluación física. Entrega los trabajos marcados como previos antes del examen, en el plazo indicado por el profesor; trae los demás el día del examen.</p>
    {locked ? <p className="info-banner">Consulta de los temas guardados. La selección está bloqueada porque el examen ya tiene evaluación o revisión, o está cerrado.</p> : null}
    {plans.map((plan) => {
      const chosen = plan.choiceWritten.filter((topic) => (selected[plan.grade] ?? []).includes(topic.key));
      const pending = plan.choiceCount > 0 && chosen.length !== plan.choiceCount;
      const assigned = [...plan.requiredWritten, ...chosen];
      const request = [
        `Preparación escrita para ${plan.grade}`,
        ...(assigned.length || plan.choiceWritten.length ? ["Prepara los trabajos en casa. Entrega los previos antes del examen, en el plazo indicado por el profesor, y trae los restantes el día del examen. Se entregan fuera de la evaluación física."] : []),
        ...assigned.map((topic) => `- ${topic.name} (${topic.timing === "advance" ? "entrega previa" : "traer el día del examen"})`),
        ...(pending ? [`Pendiente: el profesor debe elegir ${plan.choiceCount} temas del banco. Los demás temas del banco no están asignados.`] : []),
        ...(!assigned.length && !plan.choiceWritten.length ? ["No hay trabajos escritos locales asignados en este grado."] : []),
        ...plan.externalNotes.map((note) => `${note.name}: ${note.summary}`),
      ].join("\n");
      return <article key={plan.grade} style={{ borderTop: "1px solid #d9e3ef", padding: "18px 0", minWidth: 0 }}>
        <h3>{plan.grade}</h3>
        {plan.requiredWritten.length ? <><h4>Trabajos escritos obligatorios · {plan.requiredWritten.length}</h4><ul>{plan.requiredWritten.map((topic) => <li key={topic.key}><strong>{topic.name}</strong><small style={{ display: "block" }}>Fuente: {topic.timing === "advance" ? "entrega previa" : topic.timing === "exam-day" ? "día del examen" : "evaluación externa"}.</small></li>)}</ul></> : <p>No hay trabajos escritos obligatorios locales para este grado.</p>}
        {plan.choiceWritten.length ? <form action={saveAdultWrittenGakkaSelectionAction}>
          <input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="grade" value={plan.grade} />
          <fieldset disabled={locked} style={{ minWidth: 0 }}><legend>Banco de temas · elegir exactamente {plan.choiceCount} de {plan.choiceWritten.length}</legend>
            <p>Los temas del banco no son todos obligatorios. Puedes dejar la selección vacía para decidir después.</p>
            {plan.choiceWritten.map((topic) => <label key={topic.key} className="check-row" style={{ minHeight: 44 }}><input type="checkbox" name="topicKeys" value={topic.key} defaultChecked={chosen.some((item) => item.key === topic.key)} /><span>{topic.name}</span></label>)}
            {!locked ? <button type="submit" style={{ minHeight: 44, whiteSpace: "normal" }}>Guardar selección de {plan.grade}</button> : null}
          </fieldset><p className={pending ? "muted" : "save-ok"}>{pending ? `Pendiente de elegir ${plan.choiceCount} temas. La vista previa utiliza solo los temas guardados.` : `${chosen.length} temas seleccionados y guardados.`}</p>
        </form> : null}
        {plan.oral.length ? <details><summary style={{ minHeight: 44 }}>Contenido oral · se conserva en su evaluación correspondiente</summary><ul>{plan.oral.map((topic) => <li key={topic.key}>{topic.name}</li>)}</ul></details> : null}
        {plan.externalNotes.map((note) => <p key={note.key} className="muted"><strong>{note.name}</strong> · {note.summary}</p>)}
        <details><summary style={{ minHeight: 44 }}>Texto para solicitar al alumnado · no envía mensajes</summary><label style={{ display: "grid", gap: 8 }}>Vista previa de los requisitos guardados<textarea readOnly value={request} rows={Math.min(15, Math.max(5, assigned.length + 4))} style={{ width: "100%", boxSizing: "border-box" }} /></label></details>
      </article>;
    })}
  </section>;
}
