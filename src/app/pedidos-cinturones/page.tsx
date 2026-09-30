import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { SidebarNav } from "@/app/components/SidebarNav";
import { BeltOrdersPanel, type BeltMember, type BeltOrderLine } from "@/app/pedidos-cinturones/BeltOrdersPanel";
import { MaterialOrdersDashboard, type MaterialOrdersDashboardProps } from "@/components/material-orders-dashboard";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceCampaignStatus, selectManagementCampaign } from "@/lib/web-orders/campaigns";
import { createWebOrdersClient } from "@/lib/web-orders/client";
import { getSupplierSummary, listAllFamilyPayments, listCampaignFamilyPayments, listCampaignOrders, listCatalog, type CampaignOrder } from "@/lib/web-orders/repository";
import type { WebOrderCampaign, WebOrderCommunication } from "@/lib/web-orders/types";
import { redirect } from "next/navigation";
import { safeClassReturnPath } from "@/lib/class-return";

export default async function PedidosPage({ searchParams }: {
  searchParams: Promise<{ saved?: string; error?: string; status?: string; q?: string; campaign?: string; tab?: string; returnTo?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const params = await searchParams;
  const returnTo = safeClassReturnPath(params.returnTo);
  const materialData = await loadMaterialDashboardData(params.campaign);
  const supabase = createAdminClient();
  const [{ data: members, error: membersError }, { data: lines, error: linesError }] = await Promise.all([
    supabase.from("members").select("id,legacy_id,display_name,class,grade").eq("status", "active").order("class").order("display_name").returns<BeltMember[]>(),
    supabase.from("belt_order_lines")
      .select("id,exam_id,exam_title,grade,student_name,item,color,size,quantity,status,requested_on,notes,created_at,members(legacy_id,display_name,class)")
      .ilike("item", "%cintur%")
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<BeltOrderLine[]>()
  ]);

  if (membersError) throw membersError;
  if (linesError) throw linesError;

  return <div className="shell">
    <SidebarNav current="/pedidos-cinturones" />
    <main className="main">
      <div className="topbar">
        <div><p className="eyebrow">Pedidos del club</p><h1>Pedidos</h1></div>
        <form action={logoutAction}><button className="icon-button" type="submit" title="Salir" aria-label="Salir"><LogOut aria-hidden="true" size={18} /></button></form>
      </div>
      {returnTo ? <a className="class-return-banner" href={returnTo}>Volver a la clase</a> : null}
      {params.saved ? <p className="save-ok">Cambios guardados correctamente.</p> : null}
      {params.error && params.error !== "belt-measure" ? <p className="form-error">No se pudo guardar el cambio.</p> : null}
      <MaterialOrdersDashboard {...materialData} returnTo={returnTo} initialTab={params.tab === "payments" ? "payments" : params.tab === "belts" || params.saved || params.error || params.status || params.q ? "belts" : undefined}>
        <BeltOrdersPanel members={members ?? []} lines={lines ?? []} params={params} />
      </MaterialOrdersDashboard>
    </main>
  </div>;
}

async function loadMaterialDashboardData(selectedCampaignId?: string): Promise<Omit<MaterialOrdersDashboardProps, "children">> {
  try {
    const client = createWebOrdersClient();
    const [campaignResult, catalog, allFamilyPayments] = await Promise.all([
      client.from("skbc_order_campaigns").select("*").order("period_start", { ascending: false }),
      listCatalog(),
      listAllFamilyPayments()
    ]);
    if (campaignResult.error) throw campaignResult.error;

    const rawCampaigns = (campaignResult.data ?? []) as WebOrderCampaign[];
    const campaigns = rawCampaigns.map((campaign) => advanceCampaignStatus(campaign));
    const selectedCampaign = selectManagementCampaign(rawCampaigns, selectedCampaignId);
    const [currentOrders, supplierSummary, familyPayments] = selectedCampaign
      ? await Promise.all([listCampaignOrders(selectedCampaign.id), getSupplierSummary(selectedCampaign.id), listCampaignFamilyPayments(selectedCampaign.id)])
      : [[], [], []];
    const historyCampaignIds = campaigns.filter((campaign) => campaign.status === "closed").map((campaign) => campaign.id);
    const historyResult = historyCampaignIds.length
      ? await client.from("skbc_merch_orders").select("*, items:skbc_merch_order_items(*)").in("campaign_id", historyCampaignIds).order("created_at", { ascending: true })
      : { data: [], error: null };
    if (historyResult.error) throw historyResult.error;

    const orderIds = currentOrders.map((order) => order.id);
    const communicationResult = orderIds.length
      ? await client.from("skbc_order_communications").select("*").in("order_id", orderIds).order("created_at", { ascending: true })
      : { data: [], error: null };
    if (communicationResult.error) throw communicationResult.error;

    return {
      campaign: selectedCampaign,
      campaigns,
      orders: currentOrders,
      historyOrders: (historyResult.data ?? []) as CampaignOrder[],
      supplierSummary,
      catalog,
      communications: (communicationResult.data ?? []) as WebOrderCommunication[],
      familyPayments,
      allFamilyPayments
    };
  } catch (error) {
    console.error("Unable to load material orders dashboard.", error);
    return {
      campaign: null,
      campaigns: [],
      orders: [],
      historyOrders: [],
      supplierSummary: [],
      catalog: [],
      communications: [],
      familyPayments: [],
      allFamilyPayments: [],
      loadError: "Revisa la conexion privada con la base de datos de pedidos de la web."
    };
  }
}
