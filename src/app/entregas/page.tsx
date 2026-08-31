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

type Member = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
};

type Delivery = {
  campaign_id: string;
  member_id: string;
  delivered_at: string | null;
};

export default async function EntregasPage({
  searchParams
}: {
  searchParams: Promise<{ campaign?: string; saved?: string; error?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/");

  const params = await searchParams;
  const supabase = createAdminClient();
  const [{ data: campaigns, error: campaignError }, { data: members, error: membersError }, { data: deliveries, error: deliveriesError }] = await Promise.all([
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
      .from("distribution_deliveries")
      .select("campaign_id,member_id,delivered_at")
      .returns<Delivery[]>()
  ]);

  if (campaignError || membersError || deliveriesError) throw campaignError ?? membersError ?? deliveriesError;

  const allCampaigns = campaigns ?? [];
  const allMembers = members ?? [];
  const deliveredKeys = new Set((deliveries ?? []).map((item) => `${item.campaign_id}:${item.member_id}`));
  const selectedCampaignId = params.campaign ?? allCampaigns.find((campaign) => campaign.active)?.id ?? allCampaigns[0]?.id;
  const selectedCampaign = allCampaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const campaignMembers = selectedCampaign ? filterMembersForCampaign(allMembers, selectedCampaign.audience) : [];
  const deliveredCount = selectedCampaign ? campaignMembers.filter((member) => deliveredKeys.has(`${selectedCampaign.id}:${member.id}`)).length : 0;
  const pendingCount = Math.max(campaignMembers.length - deliveredCount, 0);
  const activeCampaigns = allCampaigns.filter((campaign) => campaign.active).length;

  return (
    <div className="shell">
      <SidebarNav current="/entregas" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Control interno de reparto</p>
            <h1>Entregas</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved ? <p className="save-ok">Cambios guardados.</p> : null}
        {params.error ? <p className="form-error">No se ha podido guardar la entrega.</p> : null}

        <section className="grid stats compact" aria-label="Resumen entregas">
          <article className="card">
            <Gift aria-hidden="true" size={19} />
            <h2>Campanas activas</h2>
            <div className="metric">{activeCampaigns}</div>
          </article>
          <article className="card">
            <Users aria-hidden="true" size={19} />
            <h2>Destinatarios</h2>
            <div className="metric">{campaignMembers.length}</div>
          </article>
          <article className="card">
            <PackageCheck aria-hidden="true" size={19} />
            <h2>Entregados</h2>
            <div className="metric">{deliveredCount}</div>
          </article>
          <article className={pendingCount ? "card pending-card" : "card ok-card"}>
            <PackageCheck aria-hidden="true" size={19} />
            <h2>Faltan</h2>
            <div className="metric">{pendingCount}</div>
          </article>
        </section>

        <section className="split-section">
          <article className="card">
            <h2>Nueva entrega</h2>
            <form action={createDistributionCampaignAction} className="form-grid">
              <label>Articulo<input name="title" placeholder="Regalo de Japon, carnet, camiseta..." required /></label>
              <label>
                Para
                <select name="audience" defaultValue="all">
                  <option value="all">Todo el club</option>
                  <option value="kids">Solo ninos</option>
                  <option value="adults">Solo adultos</option>
                </select>
              </label>
              <label className="full-width">Notas<textarea name="notes" placeholder="Detalles internos opcionales" /></label>
              <button type="submit">Crear control de entrega</button>
            </form>
          </article>

          <article className="card">
            <h2>Campanas</h2>
            <div className="stack-list compact-stack">
              {allCampaigns.length ? allCampaigns.map((campaign) => {
                const targetMembers = filterMembersForCampaign(allMembers, campaign.audience);
                const count = targetMembers.filter((member) => deliveredKeys.has(`${campaign.id}:${member.id}`)).length;
                const missing = Math.max(targetMembers.length - count, 0);
                return (
                  <a className={campaign.id === selectedCampaign?.id ? "delivery-campaign selected" : "delivery-campaign"} href={`/entregas?campaign=${campaign.id}`} key={campaign.id}>
                    <span>
                      <strong>{campaign.title}</strong>
                      <small>{audienceLabel(campaign.audience)} · {count}/{targetMembers.length} entregados</small>
                    </span>
                    <b className={missing ? "pending" : "done"}>{missing ? `Faltan ${missing}` : "Completo"}</b>
                  </a>
                );
              }) : <p className="muted">Crea una campana para empezar.</p>}
            </div>
          </article>
        </section>

        {selectedCampaign ? (
          <section className="card">
            <details className="advanced-details" open>
              <summary>
                <span>{selectedCampaign.title}</span>
                <b>{pendingCount ? `Faltan ${pendingCount}` : "Todo entregado"}</b>
              </summary>

              <form action={updateDistributionCampaignAction} className="form-grid compact-form">
                <input type="hidden" name="campaignId" value={selectedCampaign.id} />
                <label>Articulo<input name="title" defaultValue={selectedCampaign.title} required /></label>
                <label>
                  Para
                  <select name="audience" defaultValue={selectedCampaign.audience}>
                    <option value="all">Todo el club</option>
                    <option value="kids">Solo ninos</option>
                    <option value="adults">Solo adultos</option>
                  </select>
                </label>
                <label className="checkbox-field"><input name="active" type="checkbox" defaultChecked={selectedCampaign.active} /> Activa</label>
                <label className="full-width">Notas<textarea name="notes" defaultValue={selectedCampaign.notes ?? ""} /></label>
                <button type="submit">Guardar campana</button>
              </form>
              <form action={deleteDistributionCampaignAction} className="delete-delivery-form">
                <input type="hidden" name="campaignId" value={selectedCampaign.id} />
                <button className="mini-action danger" type="submit">
                  Eliminar este control de entrega
                </button>
                <p className="muted">Borra la campana y sus marcas de entregado. Usalo solo para controles terminados o pruebas.</p>
              </form>

              <div className="delivery-member-grid">
                {campaignMembers.map((member) => {
                  const delivered = deliveredKeys.has(`${selectedCampaign.id}:${member.id}`);
                  return (
                    <form action={toggleDistributionDeliveryAction} key={member.id}>
                      <input type="hidden" name="campaignId" value={selectedCampaign.id} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <input type="hidden" name="delivered" value={delivered ? "0" : "1"} />
                      <button className={delivered ? "delivery-member delivered" : "delivery-member"} type="submit">
                        <span>
                          <strong>{member.display_name}</strong>
                          <small>{member.class === "kids" ? "Nino" : "Adulto"} · {member.grade ?? "Sin grado"} · ID {member.legacy_id ?? "-"}</small>
                        </span>
                        <b>{delivered ? "Entregado" : "Pendiente"}</b>
                      </button>
                    </form>
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

function audienceLabel(audience: Audience) {
  if (audience === "kids") return "Ninos";
  if (audience === "adults") return "Adultos";
  return "Todo el club";
}
