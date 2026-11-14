import { SidebarNav } from "@/app/components/SidebarNav";
import { KenshiList, type KenshiSearchParams } from "@/app/components/KenshiList";
import { hasInternalAccess } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function KenshisPage({ searchParams }: { searchParams: Promise<KenshiSearchParams> }) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  return (
    <div className="shell">
      <SidebarNav current="/kenshis" />
      <main className="main"><KenshiList searchParams={searchParams} /></main>
    </div>
  );
}
