import { redirect } from "next/navigation";
import { AdminDashboard, LoginHome } from "@/app/page";
import { hasInternalAccess } from "@/lib/auth";
import { cookies } from "next/headers";

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

  const cookieStore = await cookies();
  const studentReturn = safeStudentFichaReturn(cookieStore.get("skbc_student_ficha_return")?.value);
  if (studentReturn) redirect(studentReturn);

  return <LoginHome error={params.error} />;
}

function safeStudentFichaReturn(value?: string) {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    return /^\/ficha\/[A-Za-z0-9_-]+$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
