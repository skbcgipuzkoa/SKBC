import { redirect } from "next/navigation";
import { hasInternalAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams: _searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const isAuthed = await hasInternalAccess();

  if (isAuthed) {
    redirect("/");
  }

  redirect("/");
}
