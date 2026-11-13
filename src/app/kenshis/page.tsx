import { LogOut, Mail, Phone, Search, ShieldCheck, UserRound } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { driveImageUrl } from "@/lib/drive";
import { splitContactValues } from "@/lib/member-contacts";
import { createAdminClient } from "@/lib/supabase/admin";

const dojoLabels = { gainberri: "Gainberri", anandi: "Anandi" } as const;
type Dojo = keyof typeof dojoLabels;

type Kenshi = {
  dojo: Dojo;
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
};

type KenshiFilter = "active" | "kids" | "adults" | "inactive";

export default async function KenshisPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; class?: string; status?: string; dojo?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const params = await searchParams;
  const dojo = params.dojo === "gainberri" || params.dojo === "anandi" ? params.dojo : undefined;
  const selectedFilter: KenshiFilter = params.status === "inactive"
    ? "inactive"
    : (params.class === "kids" && dojo !== "anandi") || params.class === "adults"
      ? params.class
      : "active";
  const selectedStatus = selectedFilter === "inactive" ? "inactive" : "active";
  const searchValue = (params.q ?? "").trim();
  const listParams = new URLSearchParams();
  if (searchValue) listParams.set("q", searchValue);
  if (selectedFilter === "kids" || selectedFilter === "adults") listParams.set("class", selectedFilter);
  if (dojo) listParams.set("dojo", dojo);
  listParams.set("status", selectedStatus);
  const currentListPath = `/kenshis?${listParams.toString()}`;
  const supabase = createAdminClient();
  const activeMembers = () => {
    const query = supabase.from("members").select("id", { count: "exact", head: true }).eq("status", "active");
    return dojo ? query.eq("dojo", dojo) : query;
  };
  const [
    { count: activeCount },
    { count: activeKidsCount },
    { count: activeAdultsCount }
  ] = await Promise.all([
    activeMembers(),
    activeMembers().eq("class", "kids"),
    activeMembers().eq("class", "adults")
  ]);

  let query = supabase
    .from("members")
    .select(
      "legacy_id,ika_id,first_name,last_name,dojo,class,status,grade,family_email,guardian_phone,student_phone,photo_url,ficha_token"
    )
    .order("status", { ascending: true })
    .order("class", { ascending: true })
    .order("first_name", { ascending: true });

  if (selectedFilter === "kids" || selectedFilter === "adults") {
    query = query.eq("class", selectedFilter);
  }

  query = query.eq("status", selectedStatus);
  if (dojo) query = query.eq("dojo", dojo);

  const { data, error } = await query.returns<Kenshi[]>();
  if (error) throw error;

  const search = searchValue.toLowerCase();
  const kenshis = search
    ? data.filter((kenshi) =>
        [
          kenshi.legacy_id,
          kenshi.ika_id,
          kenshi.first_name,
          kenshi.last_name,
          kenshi.grade,
          kenshi.family_email,
          kenshi.guardian_phone,
          kenshi.student_phone
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search)
      )
    : data;

  return (
    <div className="shell">
      <SidebarNav current="/kenshis" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Datos importados desde copia legacy</p>
            <h1>Kenshis</h1>
          </div>
          <div className="top-actions">
            <a className="primary-link" href={`/kenshis/nuevo?returnTo=${encodeURIComponent(currentListPath)}`}>Nuevo kenshi</a>
            <form action={logoutAction}>
              <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
                <LogOut aria-hidden="true" size={18} />
              </button>
            </form>
          </div>
        </div>

        <div className="kenshi-filter-panel">
          <section className="grid stats compact kenshi-primary-filters" aria-label="Resumen">
            <a className={`card kenshi-filter-card${selectedFilter === "active" ? " selected" : ""}`} href={kenshiFilterHref("active", searchValue, dojo)} aria-current={selectedFilter === "active" ? "page" : undefined}>
              <ShieldCheck aria-hidden="true" size={19} />
              <h2>Activos</h2>
              <div className="metric">{activeCount ?? 0}</div>
            </a>
            {dojo !== "anandi" && <a className={`card kenshi-filter-card${selectedFilter === "kids" ? " selected" : ""}`} href={kenshiFilterHref("kids", searchValue, dojo)} aria-current={selectedFilter === "kids" ? "page" : undefined}>
              <UserRound aria-hidden="true" size={19} />
              <h2>Niños</h2>
              <div className="metric">{activeKidsCount ?? 0}</div>
            </a>}
            <a className={`card kenshi-filter-card${selectedFilter === "adults" ? " selected" : ""}`} href={kenshiFilterHref("adults", searchValue, dojo)} aria-current={selectedFilter === "adults" ? "page" : undefined}>
              <UserRound aria-hidden="true" size={19} />
              <h2>Adultos</h2>
              <div className="metric">{activeAdultsCount ?? 0}</div>
            </a>
          </section>
          <div className="kenshi-secondary-filter-row" role="group" aria-label="Filtros de dojo y estado">
            {([undefined, "gainberri", "anandi"] as const).map((option) => (
              <a key={option ?? "all"} className={`kenshi-inactive-filter${dojo === option ? " selected" : ""}`}
                href={kenshiFilterHref(option === "anandi" && selectedFilter === "kids" ? "active" : selectedFilter, searchValue, option)}
                aria-current={dojo === option ? "page" : undefined}>
                {option ? dojoLabels[option] : "Todos los dojos"}
              </a>
            ))}
            <a className={`kenshi-inactive-filter${selectedFilter === "inactive" ? " selected" : ""}`} href={kenshiFilterHref("inactive", searchValue, dojo)} aria-current={selectedFilter === "inactive" ? "page" : undefined}>
              <Search aria-hidden="true" size={16} />
              Inactivos
            </a>
          </div>
        </div>

        <form className="filters kenshi-search-form">
          <label>
            Buscar
            <input name="q" defaultValue={params.q ?? ""} placeholder="Nombre, ID, email..." />
          </label>
          {selectedFilter === "kids" || selectedFilter === "adults" ? <input name="class" type="hidden" value={selectedFilter} /> : null}
          {dojo && <input name="dojo" type="hidden" value={dojo} />}
          <input name="status" type="hidden" value={selectedStatus} />
          <span className="kenshi-result-count" aria-live="polite">{kenshis.length} {kenshis.length === 1 ? "resultado" : "resultados"}</span>
        </form>

        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID SKBC</th>
                <th>ID IKA</th>
                <th>Nombre</th>
                <th>Dojo</th>
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
                    <a className="text-link" href={`/kenshis/${kenshi.legacy_id}?returnTo=${encodeURIComponent(currentListPath)}`}>
                      {driveImageUrl(kenshi.photo_url) ? (
                        <img className="mini-avatar" src={driveImageUrl(kenshi.photo_url) ?? ""} alt="" />
                      ) : null}
                      {kenshi.first_name} {kenshi.last_name}
                    </a>
                  </td>
                  <td data-label="Dojo">{dojoLabels[kenshi.dojo]}</td>
                  <td data-label="Clase">{kenshi.class === "kids" ? "Niños" : "Adultos"}</td>
                  <td data-label="Estado">
                    <span className={`pill ${kenshi.status}`}>{kenshi.status === "active" ? "Activo" : "Inactivo"}</span>
                  </td>
                  <td data-label="Grado">{kenshi.grade || <span className="muted">Sin grado</span>}</td>
                  <td data-label="Contacto">
                    <ContactPills
                      email={kenshi.family_email}
                      phone={kenshi.class === "kids"
                        ? kenshi.guardian_phone || kenshi.student_phone
                        : kenshi.student_phone || kenshi.guardian_phone}
                    />
                  </td>
                  <td data-label="Ficha">
                    <span className="link-stack">
                      {kenshi.ficha_token ? <a className="text-link" href={`/ficha/${kenshi.ficha_token}?admin=1&returnTo=${encodeURIComponent(currentListPath)}`} target="_blank" rel="noopener noreferrer external">Ficha</a> : null}
                      {!kenshi.ficha_token ? <span className="muted">-</span> : null}
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

function kenshiFilterHref(filter: KenshiFilter, search: string, dojo?: Dojo) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (dojo) params.set("dojo", dojo);
  params.set("status", filter === "inactive" ? "inactive" : "active");
  if (filter === "kids" || filter === "adults") params.set("class", filter);
  return `/kenshis?${params.toString()}`;
}

function ContactPills({ email, phone }: { email: string | null; phone: string | null }) {
  const emails = splitContactValues(email, "email");
  const phones = splitContactValues(phone);
  if (!emails.length && !phones.length) return <span className="muted">-</span>;
  return (
    <span className="contact-pills">
      {emails.map((contactEmail) => (
        <a className="contact-pill email" href={`mailto:${contactEmail}`} key={contactEmail}>
          <Mail aria-hidden="true" size={13} />
          <span>{contactEmail}</span>
        </a>
      ))}
      {phones.map((contactPhone) => (
        <a className="contact-pill phone" href={`tel:${contactPhone.replace(/\s+/g, "")}`} key={contactPhone}>
          <Phone aria-hidden="true" size={13} />
          <span>{contactPhone}</span>
        </a>
      ))}
    </span>
  );
}
