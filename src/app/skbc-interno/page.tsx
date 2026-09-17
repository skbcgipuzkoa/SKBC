import { redirect } from "next/navigation";
import { AdminDashboard, LoginHome } from "@/app/page";
import { hasInternalAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function InternalLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [isAuthed, params] = await Promise.all([hasInternalAccess(), searchParams]);

  if (isAuthed) {
    return <AdminDashboard />;
  }

  return <LoginHome error={params.error} />;
}
