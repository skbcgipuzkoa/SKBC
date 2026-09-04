import { redirect } from "next/navigation";
import { LoginHome } from "@/app/page";
import { hasInternalAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [isAuthed, params] = await Promise.all([hasInternalAccess(), searchParams]);

  if (isAuthed) {
    redirect("/");
  }

  return <LoginHome error={params.error} />;
}
