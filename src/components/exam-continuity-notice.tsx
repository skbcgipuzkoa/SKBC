import type { ExamContinuity } from "@/lib/exam-continuity";

export function ExamContinuityNotice({ continuity, approved = true }: { continuity: ExamContinuity; approved?: boolean }) {
  return <aside className={`exam-continuity-notice${continuity.allowed ? " continuity-ready" : " continuity-pending"}`}>
    <strong>{!approved ? "Constancia necesaria para una convocatoria" : !continuity.allowed ? "Convocatoria pendiente de revalidación" : continuity.exceptionAuthorized && !continuity.complies ? "Autorización excepcional del profesor" : "Mantén tu convocatoria activa"}</strong>
    <p>Para conservar la aptitud: al menos <b>6 asistencias en 60 días</b> y <b>1 en los últimos 21 días</b>. El cómputo se pausa durante cierres oficiales y vacaciones del club.</p>
    <p>Tu situación: <b>{continuity.count60} de 6</b> en el periodo de 60 días activos y <b>{continuity.count21} de 1</b> en el de 21 días activos.</p>
    {!approved ? <p>Estos mínimos no sustituyen los demás requisitos ni la autorización del profesor. Se revisan con la fecha actual.</p> : !continuity.allowed ? <p>Necesitas recuperar la constancia o una autorización excepcional del profesor. Se conserva la convocatoria prevista{continuity.missing60 ? `; faltan ${continuity.missing60} asistencias para el mínimo de 60 días activos` : ""}{continuity.missing21 ? "; necesitas al menos una asistencia reciente" : ""}.</p> : continuity.exceptionAuthorized && !continuity.complies ? <p>El profesor ha autorizado tu participación en esta convocatoria pese a no alcanzar estos mínimos. Mantén el contacto con él para preparar el examen.</p> : <p>Sigue entrenando con regularidad. Estos periodos se revisan con la fecha actual; la aprobación de la convocatoria no deja los requisitos fijados para siempre.</p>}
  </aside>;
}
