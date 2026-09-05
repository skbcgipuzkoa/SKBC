import { LogOut, PackageCheck, PlusCircle, ShoppingBag, WalletCards } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { SubmitButton } from "@/app/components/SubmitButton";
import {
  createBeltOrderLineAction,
  createOrderCatalogItemAction,
  deleteOrderCatalogItemAction,
  logoutAction,
  updateBeltOrderStatusAction,
  updateOrderCatalogItemAction,
  updateOrderPaymentAction
} from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

type Member = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
};

type CatalogItem = {
  id: string;
  name: string;
  category: string;
  default_color: string | null;
  default_size: string | null;
  unit_price_cents: number;
  active: boolean;
  notes: string | null;
};

type OrderLine = {
  id: string;
  exam_title: string | null;
  student_name: string | null;
  item: string;
  color: string | null;
  size: string | null;
  quantity: number;
  status: "pending" | "ordered" | "received" | "delivered";
  payment_status: "unpaid" | "partial" | "paid";
  unit_price_cents: number | null;
  total_price_cents: number | null;
  paid_amount_cents: number | null;
  requested_on: string | null;
  ordered_on: string | null;
  received_on: string | null;
  delivered_on: string | null;
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

export default async function PedidosPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string; status?: string; payment?: string; q?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  const [{ data: members, error: membersError }, { data: catalog, error: catalogError }, { data: lines, error: linesError }] = await Promise.all([
    supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade")
      .eq("status", "active")
      .order("class", { ascending: true })
      .order("display_name", { ascending: true })
      .returns<Member[]>(),
    supabase
      .from("order_catalog_items")
      .select("id,name,category,default_color,default_size,unit_price_cents,active,notes")
      .order("category")
      .order("name")
      .returns<CatalogItem[]>(),
    supabase
      .from("belt_order_lines")
      .select("id,exam_title,student_name,item,color,size,quantity,status,payment_status,unit_price_cents,total_price_cents,paid_amount_cents,requested_on,ordered_on,received_on,delivered_on,notes,created_at,members(legacy_id,display_name,class)")
      .order("created_at", { ascending: false })
      .limit(180)
      .returns<OrderLine[]>()
  ]);

  if (membersError) throw membersError;
  if (catalogError) throw catalogError;
  if (linesError) throw linesError;

  const allLines = lines ?? [];
  const filteredLines = filterLines(allLines, params);
  const summary = buildSummary(filteredLines.filter((line) => line.status !== "delivered"));
  const totalUnits = filteredLines.reduce((sum, line) => sum + line.quantity, 0);
  const pendingMoney = filteredLines.reduce((sum, line) => sum + Math.max(0, cents(line.total_price_cents) - cents(line.paid_amount_cents)), 0);
  const pendingLines = filteredLines.filter((line) => line.status !== "delivered").length;
  const unpaidLines = filteredLines.filter((line) => line.payment_status !== "paid").length;

  return (
    <div className="shell">
      <SidebarNav current="/pedidos-cinturones" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Pedidos del club</p>
            <h1>Pedidos</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved ? <p className="save-ok">Cambios guardados correctamente.</p> : null}
        {params.error ? <p className="form-error">No se pudo guardar el cambio.</p> : null}

        <section className="grid stats compact" aria-label="Resumen pedidos">
          <article className="card">
            <ShoppingBag aria-hidden="true" size={19} />
            <h2>Pendientes</h2>
            <div className="metric">{pendingLines}</div>
          </article>
          <article className="card">
            <PackageCheck aria-hidden="true" size={19} />
            <h2>Unidades</h2>
            <div className="metric">{totalUnits}</div>
          </article>
          <article className={unpaidLines ? "card attention-card" : "card"}>
            <WalletCards aria-hidden="true" size={19} />
            <h2>Sin pagar</h2>
            <div className="metric">{unpaidLines}</div>
          </article>
          <article className="card">
            <PlusCircle aria-hidden="true" size={19} />
            <h2>Pendiente cobro</h2>
            <div className="metric small">{formatMoney(pendingMoney)}</div>
          </article>
        </section>

        <section className="split-section">
          <article className="card">
            <h2>Nuevo pedido</h2>
            <form action={createBeltOrderLineAction} className="quick-form">
              <label>
                Kenshi / familia
                <select name="memberId">
                  <option value="">Sin vincular / escribir nombre</option>
                  {(members ?? []).map((member) => (
                    <option value={member.id} key={member.id}>
                      {member.display_name} - {member.class === "kids" ? "Ninos" : "Adultos"} - {member.grade ?? "Sin grado"}
                    </option>
                  ))}
                </select>
              </label>
              <label>Nombre manual<input name="studentName" placeholder="Madre, padre o persona externa" /></label>
              <label>
                Articulo guardado
                <select name="catalogItemId">
                  <option value="">Elegir o escribir manual</option>
                  {(catalog ?? []).filter((item) => item.active).map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name} - {formatMoney(item.unit_price_cents)}
                    </option>
                  ))}
                </select>
              </label>
              <label>Articulo<input name="item" placeholder="Kimono, cinturon, camiseta, insignia..." required /></label>
              <label>Color / modelo<input name="color" placeholder="Blanco, azul SKBC, marron..." /></label>
              <label>Talla / medida<input name="size" placeholder="120, M, talla 4, 260..." /></label>
              <label>Cantidad<input name="quantity" type="number" min="1" defaultValue="1" required /></label>
              <label>Precio unidad<input name="unitPrice" inputMode="decimal" placeholder="35,00" /></label>
              <label>Pagado ahora<input name="paidAmount" inputMode="decimal" placeholder="0,00" /></label>
              <label>
                Pago
                <select name="paymentStatus" defaultValue="">
                  <option value="">Automatico</option>
                  <option value="unpaid">No pagado</option>
                  <option value="partial">Pago parcial</option>
                  <option value="paid">Pagado</option>
                </select>
              </label>
              <label>
                Estado
                <select name="status" defaultValue="pending">
                  <option value="pending">Pendiente de pedir</option>
                  <option value="ordered">Pedido a proveedor</option>
                  <option value="received">Recibido</option>
                  <option value="delivered">Entregado</option>
                </select>
              </label>
              <label>Referencia<input name="requestTitle" placeholder="Pedido dojo, pedido Navidad..." /></label>
              <label className="wide">Notas<textarea name="notes" rows={3} placeholder="Quien lo pidio, detalles, proveedor..." /></label>
              <SubmitButton pendingLabel="Guardando pedido...">Guardar pedido</SubmitButton>
            </form>
          </article>

          <article className="card">
            <h2>Crear articulo</h2>
            <form action={createOrderCatalogItemAction} className="quick-form">
              <label>Nombre<input name="name" placeholder="Kimono infantil, cinturon, camiseta..." required /></label>
              <label>Categoria<input name="category" placeholder="kimonos, cinturones, ropa, insignias..." /></label>
              <label>Color/modelo por defecto<input name="defaultColor" /></label>
              <label>Talla/medida por defecto<input name="defaultSize" /></label>
              <label>Precio unidad<input name="unitPrice" inputMode="decimal" placeholder="35,00" /></label>
              <label className="wide">Notas<textarea name="notes" rows={3} /></label>
              <SubmitButton pendingLabel="Guardando articulo...">Guardar articulo</SubmitButton>
            </form>
          </article>
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Catalogo de articulos</h2>
              <p className="muted">Edita nombre, categoria, color/modelo, talla/medida y precio. Los articulos inactivos no aparecen al crear pedidos.</p>
            </div>
          </div>
          <div className="catalog-list">
            {(catalog ?? []).length ? (catalog ?? []).map((item) => (
              <details className="catalog-item" key={item.id}>
                <summary>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.category} - {formatMoney(item.unit_price_cents)}{item.active ? "" : " - inactivo"}</small>
                  </span>
                  <b>Editar</b>
                </summary>
                <form action={updateOrderCatalogItemAction} className="quick-form">
                  <input type="hidden" name="itemId" value={item.id} />
                  <label>Nombre<input name="name" defaultValue={item.name} required /></label>
                  <label>Categoria<input name="category" defaultValue={item.category} /></label>
                  <label>Color/modelo por defecto<input name="defaultColor" defaultValue={item.default_color ?? ""} /></label>
                  <label>Talla/medida por defecto<input name="defaultSize" defaultValue={item.default_size ?? ""} /></label>
                  <label>Precio unidad<input name="unitPrice" inputMode="decimal" defaultValue={formatMoneyInput(item.unit_price_cents)} /></label>
                  <label className="check-row"><input type="checkbox" name="active" defaultChecked={item.active} /> Activo</label>
                  <label className="wide">Notas<textarea name="notes" rows={3} defaultValue={item.notes ?? ""} /></label>
                  <div className="form-actions wide">
                    <SubmitButton pendingLabel="Guardando articulo...">Guardar cambios</SubmitButton>
                  </div>
                </form>
                <form action={deleteOrderCatalogItemAction} className="danger-inline-form">
                  <input type="hidden" name="itemId" value={item.id} />
                  <SubmitButton className="danger-button" pendingLabel="Borrando...">Borrar articulo</SubmitButton>
                </form>
              </details>
            )) : (
              <p className="muted">Todavia no hay articulos creados.</p>
            )}
          </div>
        </section>

        <section className="card">
          <h2>Resumen para comprar</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Articulo</th><th>Color/modelo</th><th>Talla/medida</th><th>Total</th></tr></thead>
              <tbody>
                {summary.length ? summary.map((line) => (
                  <tr key={`${line.item}-${line.color}-${line.size}`}>
                    <td data-label="Articulo">{line.item}</td>
                    <td data-label="Color/modelo">{line.color}</td>
                    <td data-label="Talla/medida">{line.size}</td>
                    <td data-label="Total"><strong>{line.quantity}</strong></td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="muted">No hay pedidos pendientes.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <form className="filters" action="/pedidos-cinturones">
          <label>
            Buscar
            <input name="q" defaultValue={params.q ?? ""} placeholder="Alumno, articulo, talla, notas..." />
          </label>
          <label>
            Estado
            <select name="status" defaultValue={params.status ?? ""}>
              <option value="">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="ordered">Pedido</option>
              <option value="received">Recibido</option>
              <option value="delivered">Entregado</option>
            </select>
          </label>
          <label>
            Pago
            <select name="payment" defaultValue={params.payment ?? ""}>
              <option value="">Todos</option>
              <option value="unpaid">No pagado</option>
              <option value="partial">Parcial</option>
              <option value="paid">Pagado</option>
            </select>
          </label>
          <button type="submit">Filtrar</button>
        </form>

        <h2 className="section-title">Pedidos recientes</h2>
        <section className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Persona</th><th>Articulo</th><th>Cant.</th><th>Importe</th><th>Pago</th><th>Estado</th><th>Notas</th><th>Gestion</th></tr>
            </thead>
            <tbody>
              {filteredLines.length ? filteredLines.map((line) => (
                <tr key={line.id}>
                  <td data-label="Fecha">{line.requested_on ?? line.created_at.slice(0, 10)}</td>
                  <td data-label="Persona">
                    {line.members?.legacy_id ? <a className="text-link" href={`/kenshis/${line.members.legacy_id}`}>{line.members.display_name}</a> : <strong>{line.student_name ?? "-"}</strong>}
                  </td>
                  <td data-label="Articulo">
                    <strong>{line.item}</strong>
                    <div className="muted">{[line.color, line.size].filter(Boolean).join(" - ") || "Sin variante"}</div>
                  </td>
                  <td data-label="Cant.">{line.quantity}</td>
                  <td data-label="Importe">{formatMoney(cents(line.total_price_cents))}</td>
                  <td data-label="Pago"><PaymentForm line={line} /></td>
                  <td data-label="Estado"><span className={`belt-status belt-${line.status}`}>{statusLabel(line.status)}</span></td>
                  <td data-label="Notas">{line.notes ?? "-"}</td>
                  <td data-label="Gestion"><StatusActions line={line} /></td>
                </tr>
              )) : (
                <tr><td colSpan={9} className="muted">No hay pedidos registrados.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function StatusActions({ line }: { line: OrderLine }) {
  const next = nextStatus(line.status);
  if (!next) return <span className="muted">Finalizado</span>;
  return (
    <form action={updateBeltOrderStatusAction}>
      <input type="hidden" name="lineId" value={line.id} />
      <input type="hidden" name="status" value={next} />
      <SubmitButton className="mini-action selected" pendingLabel="Guardando...">Marcar {statusLabel(next)}</SubmitButton>
    </form>
  );
}

function PaymentForm({ line }: { line: OrderLine }) {
  return (
    <form action={updateOrderPaymentAction} className="inline-form">
      <input type="hidden" name="lineId" value={line.id} />
      <select name="paymentStatus" defaultValue={line.payment_status}>
        <option value="unpaid">No pagado</option>
        <option value="partial">Parcial</option>
        <option value="paid">Pagado</option>
      </select>
      <input name="paidAmount" inputMode="decimal" defaultValue={formatMoneyInput(cents(line.paid_amount_cents))} aria-label="Importe pagado" />
      <SubmitButton className="mini-action" pendingLabel="...">OK</SubmitButton>
    </form>
  );
}

function nextStatus(status: OrderLine["status"]) {
  if (status === "pending") return "ordered";
  if (status === "ordered") return "received";
  if (status === "received") return "delivered";
  return null;
}

function statusLabel(status: OrderLine["status"]) {
  if (status === "pending") return "Pendiente";
  if (status === "ordered") return "Pedido";
  if (status === "received") return "Recibido";
  return "Entregado";
}

function filterLines(lines: OrderLine[], params: { status?: string; payment?: string; q?: string }) {
  const q = normalize(params.q);
  return lines.filter((line) => {
    if (params.status && line.status !== params.status) return false;
    if (params.payment && line.payment_status !== params.payment) return false;
    if (!q) return true;
    return [line.members?.display_name, line.student_name, line.exam_title, line.item, line.color, line.size, line.notes]
      .some((value) => normalize(value).includes(q));
  });
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function buildSummary(lines: OrderLine[]): SummaryLine[] {
  const map = new Map<string, SummaryLine>();
  lines.forEach((line) => {
    const item = line.item || "Articulo";
    const color = line.color || "Sin color/modelo";
    const size = line.size || "Sin talla/medida";
    const key = `${item}::${color}::${size}`;
    const current = map.get(key) ?? { item, color, size, quantity: 0 };
    current.quantity += line.quantity || 1;
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => a.item.localeCompare(b.item) || a.color.localeCompare(b.color) || a.size.localeCompare(b.size));
}

function cents(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value / 100);
}

function formatMoneyInput(value: number) {
  return (value / 100).toFixed(2).replace(".", ",");
}
