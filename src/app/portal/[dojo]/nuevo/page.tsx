import { PortalBackLink } from "@/app/portal/back-link";
import { requestDojoKenshiAction } from "@/app/actions";
import { KenshiForm } from "@/components/kenshi-form";
import { getBillingSettings } from "@/lib/billing-settings";
import { requireDojo } from "@/lib/dojo-access";

export default async function NewDojoKenshi({ params, searchParams }: {
  params: Promise<{ dojo: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { dojo } = await requireDojo((await params).dojo, true);
  const billing = await getBillingSettings();
  return <main className="main">
    <PortalBackLink href={`/portal/${dojo.slug}`} label={`Volver a ${dojo.name}`} />
    <h1>Nuevo kenshi</h1>
    <section className="card">
      <KenshiForm action={requestDojoKenshiAction.bind(null, dojo.slug)}
        submitLabel="Solicitar alta" adultsOnly autoTrialBilling={dojo.slug === "anandi"} error={Boolean((await searchParams).error)}
        initial={{ class: "adults", status: "active", freeTrialEnabled: billing.freeTrialPromotionEnabled }} />
    </section>
  </main>;
}
