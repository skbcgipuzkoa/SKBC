import { LogOut, Search, ShieldCheck, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { driveImageUrl } from "@/lib/drive";
import { createAdminClient } from "@/lib/supabase/admin";

type Kenshi = {
  legacy_id: string | null;
  ika_id: string | null;
  first_name: string;
  last_name: string | null;
  class: "kids" | "adults";
  status: "active" | "inactive";
  grade: string | null;
  family_email: string | null;
  guardian_phone: string | null;
  student_phone: string | null;
  photo_url: string | null;
  ficha_token: string | null;
  legacy_ficha_url: string | null;
};

export default async function KenshisPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; class?: string; status?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  let query = supabase
    .from("members")
    .select(
      "legacy_id,ika_id,first_name,last_name,class,status,grade,family_email,guardian_phone,student_phone,photo_url,ficha_token,legacy_ficha_url"
    )
    .order("status", { ascending: true })
    .order("class", { ascending: true })
    .order("first_name", { ascending: true });

  if (params.class === "kids" || params.class === "adults") {
    query = query.eq("class", params.class);
  }

  if (params.status === "active" || params.status === "inactive") {
    query = query.eq("status", params.status);
  }

  const { data, error } = await query.returns<Kenshi[]>();
  if (error) throw error;

  const search = (params.q ?? "").trim().toLowerCase();
  const kenshis = search
    ? data.filter((kenshi) =>
        [
          kenshi.legacy_id,
          kenshi.ika_id,
          kenshi.first_name,
          kenshi.last_name,
          kenshi.grade,
          kenshi.family_email
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search)
      )
    : data;

  const active = data.filter((kenshi) => kenshi.status === "active").length;
  const kids = data.filter((kenshi) => kenshi.class === "kids").length;
  const adults = data.filter((kenshi) => kenshi.class === "adults").length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/">Inicio</a>
          <a href="/kenshis" aria-current="page">
            Kenshis
          </a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/cursos">Cursos</a>
          <a href="/pedidos-cinturones">Cinturones</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings">Rankings</a>
          <a href="/sistema">Sistema</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Datos importados desde copia legacy</p>
            <h1>Kenshis</h1>
          </div>
          <div className="top-actions">
            <a className="primary-link" href="/kenshis/nuevo">Nuevo kenshi</a>
            <form action={logoutAction}>
              <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
                <LogOut aria-hidden="true" size={18} />
              </button>
            </form>
          </div>
        </div>

        <section className="grid stats compact" aria-label="Resumen">
          <article className="card">
            <ShieldCheck aria-hidden="true" size={19} />
            <h2>Activos</h2>
            <div className="metric">{active}</div>
          </article>
          <article className="card">
            <UserRound aria-hidden="true" size={19} />
            <h2>Ninos</h2>
            <div className="metric">{kids}</div>
          </article>
          <article className="card">
            <UserRound aria-hidden="true" size={19} />
            <h2>Adultos</h2>
            <div className="metric">{adults}</div>
          </article>
          <article className="card">
            <Search aria-hidden="true" size={19} />
            <h2>Mostrando</h2>
            <div className="metric">{kenshis.length}</div>
          </article>
        </section>

        <form className="filters">
          <label>
            Buscar
            <input name="q" defaultValue={params.q ?? ""} placeholder="Nombre, ID, email..." />
          </label>
          <label>
            Clase
            <select name="class" defaultValue={params.class ?? ""}>
              <option value="">Todas</option>
              <option value="kids">Ninos</option>
              <option value="adults">Adultos</option>
            </select>
          </label>
          <label>
            Estado
            <select name="status" defaultValue={params.status ?? ""}>
              <option value="">Todos</option>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
          </label>
          <button type="submit">Filtrar</button>
        </form>

        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID SKBC</th>
                <th>ID IKA</th>
                <th>Nombre</th>
                <th>Clase</th>
                <th>Estado</th>
                <th>Grado</th>
                <th>Contacto</th>
                <th>Ficha</th>
              </tr>
            </thead>
            <tbody>
              {kenshis.map((kenshi) => (
                <tr key={kenshi.legacy_id}>
                  <td data-label="ID SKBC">{kenshi.legacy_id}</td>
                  <td data-label="ID IKA">{kenshi.ika_id || <span className="muted">Pendiente</span>}</td>
                  <td data-label="Nombre">
                    <a className="text-link" href={`/kenshis/${kenshi.legacy_id}`}>
                      {driveImageUrl(kenshi.photo_url) ? (
                        <img className="mini-avatar" src={driveImageUrl(kenshi.photo_url) ?? ""} alt="" />
                      ) : null}
                      {kenshi.first_name} {kenshi.last_name}
                    </a>
                  </td>
                  <td data-label="Clase">{kenshi.class === "kids" ? "Ninos" : "Adultos"}</td>
                  <td data-label="Estado">
                    <span className={`pill ${kenshi.status}`}>{kenshi.status === "active" ? "Activo" : "Inactivo"}</span>
                  </td>
                  <td data-label="Grado">{kenshi.grade || <span className="muted">Sin grado</span>}</td>
                  <td data-label="Contacto">{kenshi.family_email || kenshi.guardian_phone || kenshi.student_phone || <span className="muted">-</span>}</td>
                  <td data-label="Ficha">
                    <span className="link-stack">
                      {kenshi.ficha_token ? <a className="text-link" href={`/ficha/${kenshi.ficha_token}`} target="_blank">Nueva</a> : null}
                      {kenshi.legacy_ficha_url ? <a className="text-link" href={kenshi.legacy_ficha_url} target="_blank">Actual</a> : null}
                      {!kenshi.ficha_token && !kenshi.legacy_ficha_url ? <span className="muted">-</span> : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
