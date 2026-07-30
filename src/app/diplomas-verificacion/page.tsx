import Link from "next/link";
import { redirect } from "next/navigation";
import { hasInternalAccess } from "@/lib/auth";
import { verifyDiplomaSetup } from "@/lib/diplomas";

export default async function DiplomaVerificationPage() {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  let result:
    | { ok: true; fileName: string; url: string }
    | { ok: false; error: string };

  try {
    const diploma = await verifyDiplomaSetup();
    result = { ok: true, fileName: diploma.fileName, url: diploma.url };
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof Error ? error.message : String(error || "Error desconocido.")
    };
  }

  return (
    <main className="page-shell">
      <p className="eyebrow">Verificacion interna</p>
      <h1>Diplomas</h1>
      <section className="panel">
        {result.ok ? (
          <>
            <h2>Diploma de prueba creado</h2>
            <p className="muted">Esta prueba no crea examen real ni modifica ningun kenshi. Solo genera un PDF de prueba en Drive.</p>
            <p>{result.fileName}</p>
            <a className="primary-link" href={result.url} target="_blank" rel="noreferrer">
              Abrir PDF en Drive
            </a>
          </>
        ) : (
          <>
            <h2>No se ha podido generar el diploma</h2>
            <p className="error-text">{result.error}</p>
          </>
        )}
      </section>
      <Link className="back-link" href="/examenes">
        Volver a examenes
      </Link>
    </main>
  );
}
