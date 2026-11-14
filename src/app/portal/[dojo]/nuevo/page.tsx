import { PortalBackLink } from "@/app/portal/back-link";
import { createDojoKenshiAction } from "@/app/actions";
import type { CSSProperties } from "react";
import { KenshiForm } from "@/components/kenshi-form";
import { getBillingSettings } from "@/lib/billing-settings";
import { requireDojo } from "@/lib/dojo-access";

export default async function NewDojoKenshi({ params, searchParams }: {
  params: Promise<{ dojo: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { dojo, db } = await requireDojo((await params).dojo, true);
  const billing = await getBillingSettings();
  const { data: groups, error } = await db.from("dojo_groups").select("member_class").eq("dojo_slug", dojo.slug);
  if (error) throw error;
  return <main className="main" style={{ "--brand": dojo.accent_color } as CSSProperties}>
    <PortalBackLink href={`/portal/${dojo.slug}/kenshis`} label="Volver a Kenshis" />
    <h1>Nuevo kenshi</h1>
    <section className="card">
      <KenshiForm action={createDojoKenshiAction.bind(null, dojo.slug)}
        submitLabel="Dar de alta" adultsOnly={!groups.some((group) => group.member_class === "kids")}
        autoTrialBilling={dojo.slug === "anandi"} error={Boolean((await searchParams).error)}
        initial={{ class: "adults", status: "active", freeTrialEnabled: billing.freeTrialPromotionEnabled }} />
    </section>
  </main>;
}
