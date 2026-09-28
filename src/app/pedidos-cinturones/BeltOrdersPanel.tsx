import { CheckCircle2, PackageCheck, Ruler, ShoppingBag, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { ConfirmSubmitButton } from "@/app/components/ConfirmSubmitButton";
import { SubmitButton } from "@/app/components/SubmitButton";
import { createBeltOrderLineAction, deleteExamBeltOrderAction, updateExamBeltOrderAction } from "@/app/actions";
import { allGrades } from "@/lib/grades";
import { isPendingBeltSize, pendingBeltSize } from "@/lib/exam-belt-orders";

export type BeltMember = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
};

export type BeltOrderLine = {
  id: string;
  exam_id: string | null;
  exam_title: string | null;
  grade: string | null;
  student_name: string | null;
  item: string;
  color: string | null;
  size: string | null;
  quantity: number;
  status: "pending" | "ordered" | "received" | "delivered";
  requested_on: string | null;
  notes: string | null;
  created_at: string;
  members: { legacy_id: string | null; display_name: string; class: "kids" | "adults" } | null;
};

export function BeltOrdersPanel({ members, lines, params }: { members: BeltMember[]; lines: BeltOrderLine[]; params: { status?: string; q?: string; error?: string } }) {
  const filtered = filterLines(lines, params);
  const pendingMeasure = lines.filter((line) => line.status === "pending" && isPendingBeltSize(line.size)).length;
  const ready = lines.filter((line) => line.status === "pending" && !isPendingBeltSize(line.size)).length;
  const ordered = lines.filter((line) => line.status === "ordered").length;
  const received = lines.filter((line) => line.status === "received").length;
  const delivered = lines.filter((line) => line.status === "delivered").length;

  return <div className="exam-belt-panel">
    <section className="material-section-heading belt-heading">
      <div><p className="eyebrow">Gestion interna</p><h2>Cinturones de examen</h2><p>Los aprobados se anaden automaticamente con el color de su grado objetivo. Solo queda indicar la medida antes de realizar el pedido.</p></div>
      <span className="tag">{lines.length} registros</span>
    </section>

    {params.error === "belt-measure" ? <p className="form-error">Indica la medida antes de marcar el cinturon como pedido, recibido o entregado.</p> : null}

    <section className="belt-metrics" aria-label="Resumen de cinturones">
      <BeltMetric icon={<Ruler size={19} />} label="Pendientes de medida" value={pendingMeasure} attention={pendingMeasure > 0} />
      <BeltMetric icon={<CheckCircle2 size={19} />} label="Listos para pedir" value={ready} />
      <BeltMetric icon={<ShoppingBag size={19} />} label="Pedidos" value={ordered} />
      <BeltMetric icon={<PackageCheck size={19} />} label="Recibidos" value={received} />
      <BeltMetric icon={<Truck size={19} />} label="Entregados" value={delivered} />
    </section>

    <details className="card belt-manual-create">
      <summary className="section-heading-row"><div><h3>Anadir cinturon manual</h3><p className="muted">Solo para excepciones que no procedan de un aprobado registrado.</p></div><span className="tag">Abrir</span></summary>
      <form action={createBeltOrderLineAction} className="quick-form">
        <label>Alumno<select name="memberId"><option value="">Sin vincular / escribir nombre</option>{members.map((member) => <option value={member.id} key={member.id}>{member.display_name} - {member.class === "kids" ? "Ninos" : "Adultos"}</option>)}</select></label>
        <label>Nombre manual<input name="studentName" placeholder="Solo si no existe como alumno" /></label>
        <label>Grado objetivo<select name="grade" required defaultValue=""><option value="" disabled>Seleccionar grado</option>{allGrades.map((grade) => <option key={grade}>{grade}</option>)}</select></label>
        <label>Color<input name="color" placeholder="Se calcula si se deja vacio" /></label>
        <label>Medida<input name="size" placeholder={pendingBeltSize} /></label>
        <label>Cantidad<input name="quantity" type="number" min="1" defaultValue="1" required /></label>
        <label className="wide">Observaciones<textarea name="notes" rows={2} /></label>
        <SubmitButton pendingLabel="Guardando cinturon...">Guardar cinturon</SubmitButton>
      </form>
    </details>

    <form className="filters belt-filters" action="/pedidos-cinturones">
      <input type="hidden" name="tab" value="belts" />
      <label>Buscar<input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Alumno, grado, color o medida" /></label>
      <label>Estado<select name="status" defaultValue={params.status ?? ""}><option value="">Todos</option><option value="measure">Pendientes de medida</option><option value="ready">Listos para pedir</option><option value="ordered">Pedidos</option><option value="received">Recibidos</option><option value="delivered">Entregados</option></select></label>
      <button type="submit">Filtrar</button>
    </form>

    <section className="belt-order-list">
      {filtered.length ? filtered.map((line) => <details className={isPendingBeltSize(line.size) && line.status === "pending" ? "belt-order-card needs-measure" : "belt-order-card"} key={line.id}>
        <summary>
          <span className="belt-person"><strong>{line.members?.display_name ?? line.student_name ?? "Sin nombre"}</strong><small>{line.exam_title ?? "Alta manual"} · {line.requested_on ?? line.created_at.slice(0, 10)}</small></span>
          <span><strong>{line.grade ?? "Sin grado"}</strong><small>{line.color ?? "Sin color"}</small></span>
          <span><strong>{line.size || pendingBeltSize}</strong><small>{line.quantity} unidad{line.quantity === 1 ? "" : "es"}</small></span>
          <span className={`belt-status belt-${line.status}`}>{workflowLabel(line)}</span>
        </summary>
        <form action={updateExamBeltOrderAction} className="belt-edit-form">
          <input type="hidden" name="lineId" value={line.id} />
          <label>Grado objetivo<select name="grade" defaultValue={line.grade ?? ""} required>{allGrades.map((grade) => <option key={grade}>{grade}</option>)}</select></label>
          <label>Color<input name="color" defaultValue={line.color ?? ""} /></label>
          <label>Medida<input name="size" defaultValue={line.size ?? pendingBeltSize} required /></label>
          <label>Cantidad<input name="quantity" type="number" min="1" defaultValue={line.quantity} required /></label>
          <label>Estado<select name="status" defaultValue={line.status}><option value="pending">Pendiente / listo</option><option value="ordered">Pedido</option><option value="received">Recibido</option><option value="delivered">Entregado</option></select></label>
          <label className="wide">Observaciones<textarea name="notes" rows={2} defaultValue={line.notes ?? ""} /></label>
          <div className="form-actions wide"><SubmitButton pendingLabel="Guardando...">Guardar cambios</SubmitButton></div>
        </form>
        <div className="belt-record-meta"><span>Origen: {line.exam_id ? "aprobado automatico" : "alta manual"}</span>{line.exam_id ? <span>Vinculado al examen</span> : null}</div>
        <form action={deleteExamBeltOrderAction} className="danger-inline-form"><input type="hidden" name="lineId" value={line.id} /><ConfirmSubmitButton message={`Se eliminara el cinturon de ${line.members?.display_name ?? line.student_name ?? "este alumno"}. ¿Continuar?`}>Eliminar cinturon</ConfirmSubmitButton></form>
      </details>) : <div className="card material-empty"><strong>No hay cinturones en este filtro</strong><span>Los nuevos aprobados apareceran aqui automaticamente.</span></div>}
    </section>
  </div>;
}

function BeltMetric({ icon, label, value, attention = false }: { icon: ReactNode; label: string; value: number; attention?: boolean }) {
  return <article className={attention ? "card attention-card" : "card"}><span>{icon}{label}</span><strong>{value}</strong></article>;
}

function workflowLabel(line: BeltOrderLine) {
  if (line.status === "pending") return isPendingBeltSize(line.size) ? "Falta medida" : "Listo para pedir";
  if (line.status === "ordered") return "Pedido";
  if (line.status === "received") return "Recibido";
  return "Entregado";
}

function filterLines(lines: BeltOrderLine[], params: { status?: string; q?: string }) {
  const query = normalize(params.q);
  return lines.filter((line) => {
    if (params.status === "measure" && !(line.status === "pending" && isPendingBeltSize(line.size))) return false;
    if (params.status === "ready" && !(line.status === "pending" && !isPendingBeltSize(line.size))) return false;
    if (["ordered", "received", "delivered"].includes(params.status ?? "") && line.status !== params.status) return false;
    if (!query) return true;
    return [line.members?.display_name, line.student_name, line.grade, line.color, line.size, line.notes].some((value) => normalize(value).includes(query));
  });
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleLowerCase("es");
}
