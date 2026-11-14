import type { CSSProperties } from "react";
import { KenshiList, type KenshiSearchParams } from "@/app/components/KenshiList";
import { PortalBackLink } from "@/app/portal/back-link";
import { requireDojo } from "@/lib/dojo-access";

export default async function DojoKenshisPage({ params, searchParams }: {
  params: Promise<{ dojo: string }>;
  searchParams: Promise<KenshiSearchParams>;
}) {
  const { dojo } = await requireDojo((await params).dojo);
  return (
    <main className="main" style={{ "--brand": dojo.accent_color } as CSSProperties}>
      <PortalBackLink href={`/portal/${dojo.slug}`} label={`Volver a ${dojo.name}`} />
      <KenshiList searchParams={searchParams} portal={{ slug: dojo.slug, name: dojo.name, archived: Boolean(dojo.archived_at) }} />
    </main>
  );
}
