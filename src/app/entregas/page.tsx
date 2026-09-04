import { Gift, LogOut, PackageCheck, Users } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { redirect } from "next/navigation";
import {
  createDistributionCampaignAction,
  deleteDistributionCampaignAction,
  logoutAction,
  toggleDistributionDeliveryAction,
  updateDistributionCampaignAction
} from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Audience = "all" | "kids" | "adults";

type Campaign = {
  id: string;
  title: string;
  audience: Audience;
  notes: string | null;
  active: boolean;
  created_at: string;
};

type CampaignItem = {
  id: string;
  campaign_id: string;
  label: string;
  position: number;
  active: boolean;
};

type Member = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
};

type DeliveryCheck = {
  item_id: string;
  member_id: string;
};

export default async function EntregasPage({
  searchParams
}: {
  searchParams: Promise<{ campaign?: string; saved?: string; error?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/");

  const params = await searchParams;
  const supabase = createAdminClient();
  const [
    { data: campaigns, error: campaignError },
    { data: members, error: membersError },
    { data: items, error: itemsError },
    { data: checks, error: checksError }
  ] = await Promise.all([
    supabase
      .from("distribution_campaigns")
      .select("id,title,audience,notes,active,created_at")
      .order("active", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<Campaign[]>(),
    supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade")
      .eq("status", "active")
      .order("class")
      .order("display_name")
      .returns<Member[]>(),
    supabase
      .from("distribution_campaign_items")
      .select("id,campaign_id,label,position,active")
      .order("position")
      .returns<CampaignItem[]>(),
    supabase
      .from("distribution_delivery_checks")
      .select("item_id,member_id")
      .returns<DeliveryCheck[]>()
  ]);

  if (campaignError || membersError || itemsError || checksError) {
    throw campaignError ?? membersError ?? itemsError ?? checksError;
  }

  const allCampaigns = campaigns ?? [];
  const allMembers = members ?? [];
  const allItems = items ?? [];
  const checkedKeys = new Set((checks ?? []).map((item) => `${item.item_id}:${item.member_id}`));
  const selectedCampaignId = params.campaign ?? allCampaigns.find((campaign) => campaign.active)?.id ?? allCampaigns[0]?.id;
  const selectedCampaign = allCampaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const campaignMembers = selectedCampaign ? filterMembersForCampaign(allMembers, selectedCampaign.audience) : [];
  const campaignItems = selectedCampaign ? activeItemsForCampaign(allItems, selectedCampaign.id) : [];
  const totalChecks = campaignMembers.length * Math.max(campaignItems.length, 1);
  const markedCount = selectedCampaign
    ? campaignMembers.reduce((total, member) => total + countMemberChecks(campaignItems, checkedKeys, member.id), 0)
    : 0;
  const pendingCount = Math.max(totalChecks - markedCount, 0);
  const activeCampaigns = allCampaigns.filter((campaign) => campaign.active).length;

  return (
    <div className="shell">
      <SidebarNav current="/entregas" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Control interno flexible</p>
            <h1>Entregas</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved ? <p className="save-ok">Cambios guardados.</p> : null}
        {params.error ? <p className="form-error">No se ha podido guardar este control.</p> : null}

        <section className="grid stats compact" aria-label="Resumen entregas">
          <article className="card">
            <Gift aria-hidden="true" size={19} />
            <h2>Controles activos</h2>
            <div className="metric">{activeCampaigns}</div>
          </article>
          <article className="card">
            <Users aria-hidden="true" size={19} />
            <h2>Destinatarios</h2>
            <div className="metric">{campaignMembers.length}</div>
          </article>
          <article className="card">
            <PackageCheck aria-hidden="true" size={19} />
            <h2>Marcas hechas</h2>
            <div className="metric">{markedCount}</div>
          </article>
          <article className={pendingCount ? "card pending-card" : "card ok-card"}>
            <PackageCheck aria-hidden="true" size={19} />
            <h2>Faltan</h2>
            <div className="metric">{pendingCount}</div>
          </article>
        </section>

        <section className="split-section">
          <article className="card">
            <h2>Nuevo control</h2>
            <form action={createDistributionCampaignAction} className="form-grid">
              <label>Nombre<input name="title" placeholder="Regalo de Japon, howa, cena, carnet..." required /></label>
              <label>
                Para
                <select name="audience" defaultValue="all">
                  <option value="all">Todo el club</option>
                  <option value="kids">Solo ninos</option>
                  <option value="adults">Solo adultos</option>
                </select>
              </label>
              <label className="full-width">
                Casillas
                <textarea name="itemLabelsText" defaultValue="Entregado" placeholder={"Entregado\nPagado\nAsiste\nHowa"} />
                <small className="field-hint">Una casilla por linea. Sirve para regalos, carnets, cenas, howas o controles puntuales.</small>
              </label>
              <label className="full-width">Notas<textarea name="notes" placeholder="Detalles internos opcionales" /></label>
              <button type="submit">Crear control</button>
            </form>
          </article>

          <article className="card">
            <h2>Controles</h2>
            <div className="stack-list compact-stack">
              {allCampaigns.length ? allCampaigns.map((campaign) => {
                const targetMembers = filterMembersForCampaign(allMembers, campaign.audience);
                const targetItems = activeItemsForCampaign(allItems, campaign.id);
                const total = targetMembers.length * Math.max(targetItems.length, 1);
                const count = targetMembers.reduce((sum, member) => sum + countMemberChecks(targetItems, checkedKeys, member.id), 0);
                const missing = Math.max(total - count, 0);
                return (
                  <a className={campaign.id === selectedCampaign?.id ? "delivery-campaign selected" : "delivery-campaign"} href={`/entregas?campaign=${campaign.id}`} key={campaign.id}>
                    <span>
                      <strong>{campaign.title}</strong>
                      <small>{audienceLabel(campaign.audience)} · {targetItems.length || 1} casilla(s) · {count}/{total} marcas</small>
                    </span>
                    <b className={missing ? "pending" : "done"}>{missing ? `Faltan ${missing}` : "Completo"}</b>
                  </a>
                );
              }) : <p className="muted">Crea un control para empezar.</p>}
            </div>
          </article>
        </section>

        {selectedCampaign ? (
          <section className="card">
            <details className="advanced-details" open>
              <summary>
                <span>{selectedCampaign.title}</span>
                <b>{pendingCount ? `Faltan ${pendingCount}` : "Todo completado"}</b>
              </summary>

              <form action={updateDistributionCampaignAction} className="form-grid compact-form">
                <input type="hidden" name="campaignId" value={selectedCampaign.id} />
                <label>Nombre<input name="title" defaultValue={selectedCampaign.title} required /></label>
                <label>
                  Para
                  <select name="audience" defaultValue={selectedCampaign.audience}>
                    <option value="all">Todo el club</option>
                    <option value="kids">Solo ninos</option>
                    <option value="adults">Solo adultos</option>
                  </select>
                </label>
                <label className="checkbox-field"><input name="active" type="checkbox" defaultChecked={selectedCampaign.active} /> Activo</label>
                <label className="full-width">
                  Casillas
                  <textarea name="itemLabelsText" defaultValue={campaignItems.map((item) => item.label).join("\n") || "Entregado"} />
                  <small className="field-hint">Una por linea. Las casillas con el mismo nombre conservan sus marcas aunque edites el control.</small>
                </label>
                <label className="full-width">Notas<textarea name="notes" defaultValue={selectedCampaign.notes ?? ""} /></label>
                <button type="submit">Guardar control</button>
              </form>
              <form action={deleteDistributionCampaignAction} className="delete-delivery-form">
                <input type="hidden" name="campaignId" value={selectedCampaign.id} />
                <button className="mini-action danger" type="submit">
                  Archivar este control
                </button>
                <p className="muted">Lo quita de activos pero conserva todas las marcas y el historial.</p>
              </form>

              <div className="delivery-member-grid">
                {campaignMembers.map((member) => {
                  const memberDone = countMemberChecks(campaignItems, checkedKeys, member.id);
                  const complete = campaignItems.length > 0 && memberDone === campaignItems.length;
                  return (
                    <div className={complete ? "delivery-member multi delivered" : "delivery-member multi"} key={member.id}>
                      <div className="delivery-member-main">
                        <span>
                          <strong>{member.display_name}</strong>
                          <small>{member.class === "kids" ? "Nino" : "Adulto"} · {member.grade ?? "Sin grado"} · ID {member.legacy_id ?? "-"}</small>
                        </span>
                        <b>{memberDone}/{campaignItems.length || 1}</b>
                      </div>
                      <div className="delivery-check-list">
                        {campaignItems.length ? campaignItems.map((item) => {
                          const checked = checkedKeys.has(`${item.id}:${member.id}`);
                          return (
                            <form action={toggleDistributionDeliveryAction} key={item.id}>
                              <input type="hidden" name="campaignId" value={selectedCampaign.id} />
                              <input type="hidden" name="itemId" value={item.id} />
                              <input type="hidden" name="memberId" value={member.id} />
                              <input type="hidden" name="checked" value={checked ? "0" : "1"} />
                              <button className={checked ? "delivery-check checked" : "delivery-check"} type="submit">
                                {checked ? "✓ " : ""}{item.label}
                              </button>
                            </form>
                          );
                        }) : <span className="delivery-check disabled">Sin casillas</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function filterMembersForCampaign(members: Member[], audience: Audience) {
  if (audience === "kids") return members.filter((member) => member.class === "kids");
  if (audience === "adults") return members.filter((member) => member.class === "adults");
  return members;
}

function activeItemsForCampaign(items: CampaignItem[], campaignId: string) {
  return items
    .filter((item) => item.campaign_id === campaignId && item.active)
    .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label, "es"));
}

function countMemberChecks(items: CampaignItem[], checkedKeys: Set<string>, memberId: string) {
  return items.filter((item) => checkedKeys.has(`${item.id}:${memberId}`)).length;
}

function audienceLabel(audience: Audience) {
  if (audience === "kids") return "Ninos";
  if (audience === "adults") return "Adultos";
  return "Todo el club";
}
