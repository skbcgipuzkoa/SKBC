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
    <a href={`/portal/${dojo.slug}`}>Volver a {dojo.name}</a>
    <h1>Nuevo kenshi</h1>
    <section className="card">
      <KenshiForm action={requestDojoKenshiAction.bind(null, dojo.slug)}
        submitLabel="Solicitar alta" adultsOnly error={Boolean((await searchParams).error)}
        initial={{ class: "adults", status: "active", freeTrialEnabled: billing.freeTrialPromotionEnabled }} />
    </section>
  </main>;
}
