import { LogOut, PackageCheck, PlusCircle, Ruler, ShoppingBag } from "lucide-react";
import { redirect } from "next/navigation";
import { createBeltOrderLineAction, logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Member = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
};

type BeltLine = {
  id: string;
  exam_title: string | null;
  program: string | null;
  grade: string | null;
  student_name: string | null;
  item: string;
  color: string | null;
  size: string | null;
  quantity: number;
  notes: string | null;
  created_at: string;
  members: {
    legacy_id: string | null;
    display_name: string;
    class: "kids" | "adults";
  } | null;
};

type SummaryLine = {
  item: string;
  color: string;
  size: string;
  quantity: number;
};

export default async function PedidosCinturonesPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  const [{ data: members, error: membersError }, { data: lines, error: linesError }] = await Promise.all([
    supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade")
      .eq("status", "active")
      .order("class", { ascending: true })
      .order("display_name", { ascending: true })
      .returns<Member[]>(),
    supabase
      .from("belt_order_lines")
      .select("id,exam_title,program,grade,student_name,item,color,size,quantity,notes,created_at,members(legacy_id,display_name,class)")
      .order("created_at", { ascending: false })
      .limit(120)
      .returns<BeltLine[]>()
  ]);

  if (membersError) throw membersError;
  if (linesError) throw linesError;

  const summary = buildSummary(lines ?? []);
  const totalItems = summary.reduce((sum, line) => sum + line.quantity, 0);
  const totalLines = (lines ?? []).length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/kenshis">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/cursos">Cursos</a>
          <a href="/pedidos-cinturones" aria-current="page">Cinturones</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings">Rankings</a>
          <a href="/auditoria">Auditoria</a>
          <a href="/importacion">Importacion</a>
          <a href="/novedades">Novedades</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Replica de LINEAS_PEDIDO y RESUMEN_PEDIDO</p>
            <h1>Pedido de cinturones</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved === "belt" ? <p className="save-ok">Linea de pedido guardada.</p> : null}
        {params.error === "belt" ? <p className="form-error">No se pudo guardar la linea de pedido.</p> : null}

        <section className="grid stats compact" aria-label="Resumen pedido">
          <article className="card">
            <ShoppingBag aria-hidden="true" size={19} />
            <h2>Lineas</h2>
            <div className="metric">{totalLines}</div>
          </article>
          <article className="card">
            <PackageCheck aria-hidden="true" size={19} />
            <h2>Unidades</h2>
            <div className="metric">{totalItems}</div>
          </article>
          <article className="card">
            <Ruler aria-hidden="true" size={19} />
            <h2>Variantes</h2>
            <div className="metric">{summary.length}</div>
          </article>
          <article className="card">
            <PlusCircle aria-hidden="true" size={19} />
            <h2>Destino</h2>
            <div className="metric small">Nuevo</div>
          </article>
        </section>

        <section className="split-section">
          <article className="card">
            <h2>Anadir linea</h2>
            <form action={createBeltOrderLineAction} className="quick-form">
              <label>
                Kenshi
                <select name="memberId">
                  <option value="">Sin vincular / escribir nombre</option>
                  {(members ?? []).map((member) => (
                    <option value={member.id} key={member.id}>
                      {member.display_name} · {member.class === "kids" ? "Ninos" : "Adultos"} · {member.grade ?? "Sin grado"}
                    </option>
                  ))}
                </select>
              </label>
              <label>Nombre manual<input name="studentName" placeholder="Solo si no eliges kenshi" /></label>
              <label>Examen<input name="examTitle" placeholder="Examen julio, curso, pedido general..." /></label>
              <label>Programa<input name="program" placeholder="Adultos / Ninos" /></label>
              <label>Grado<input name="grade" placeholder="Grado objetivo" /></label>
              <label>Articulo<input name="item" defaultValue="Cinturon" required /></label>
              <label>Color<input name="color" placeholder="Blanco, verde, marron..." required /></label>
              <label>Medida<input name="size" placeholder="2, 3, 4, 5..." required /></label>
              <label>Cantidad<input name="quantity" type="number" min="1" defaultValue="1" required /></label>
              <label className="wide">Notas<textarea name="notes" rows={3} /></label>
              <button type="submit">Guardar linea</button>
            </form>
          </article>
          <article>
            <h2 className="section-title">Resumen pedido</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Articulo</th><th>Color</th><th>Medida</th><th>Total</th></tr></thead>
                <tbody>
                  {summary.length ? summary.map((line) => (
                    <tr key={`${line.item}-${line.color}-${line.size}`}>
                      <td data-label="Articulo">{line.item}</td>
                      <td data-label="Color">{line.color}</td>
                      <td data-label="Medida">{line.size}</td>
                      <td data-label="Total"><strong>{line.quantity}</strong></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="muted">Sin lineas de pedido.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <h2 className="section-title">Lineas recientes</h2>
        <section className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Alumno</th><th>Examen</th><th>Articulo</th><th>Color</th><th>Medida</th><th>Cantidad</th><th>Notas</th></tr>
            </thead>
            <tbody>
              {(lines ?? []).length ? (lines ?? []).map((line) => (
                <tr key={line.id}>
                  <td data-label="Fecha">{line.created_at.slice(0, 10)}</td>
                  <td data-label="Alumno">
                    {line.members?.legacy_id ? <a className="text-link" href={`/kenshis/${line.members.legacy_id}`}>{line.members.display_name}</a> : <strong>{line.student_name ?? "-"}</strong>}
                  </td>
                  <td data-label="Examen">{line.exam_title ?? "-"}</td>
                  <td data-label="Articulo">{line.item}</td>
                  <td data-label="Color">{line.color ?? "-"}</td>
                  <td data-label="Medida">{line.size ?? "-"}</td>
                  <td data-label="Cantidad"><strong>{line.quantity}</strong></td>
                  <td data-label="Notas">{line.notes ?? "-"}</td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="muted">No hay lineas registradas.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function buildSummary(lines: BeltLine[]): SummaryLine[] {
  const map = new Map<string, SummaryLine>();
  lines.forEach((line) => {
    const item = line.item || "Cinturon";
    const color = line.color || "Sin color";
    const size = line.size || "Sin medida";
    const key = `${item}::${color}::${size}`;
    const current = map.get(key) ?? { item, color, size, quantity: 0 };
    current.quantity += line.quantity || 1;
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => a.item.localeCompare(b.item) || a.color.localeCompare(b.color) || a.size.localeCompare(b.size));
}
