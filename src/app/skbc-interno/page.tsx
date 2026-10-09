import { redirect } from "next/navigation";
import { AdminDashboard, LoginHome } from "@/app/page";
import { hasInternalAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function InternalLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const [isAuthed, params] = await Promise.all([hasInternalAccess(), searchParams]);
  const returnTo = params.returnTo === "/tesoreria" ? params.returnTo : undefined;

  if (isAuthed) {
    if (returnTo) redirect(returnTo);
    return <AdminDashboard />;
  }

  return <LoginHome error={params.error} returnTo={returnTo} />;
}
