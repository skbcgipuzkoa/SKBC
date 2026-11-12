"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { syncClassPhotosAction } from "@/app/clases/photo-actions";
import { CLASS_PHOTO_ALBUM_LIMIT } from "@/lib/class-photo-limits";

export function ClassPhotoSyncButton({ classId }: { classId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function sync() {
    setBusy(true);
    let added = 0;
    let blocked = 0;
    let remaining = true;
    let full = false;
    try {
      for (let pass = 0; remaining && pass < CLASS_PHOTO_ALBUM_LIMIT; pass++) {
        const result = await syncClassPhotosAction(classId);
        added += result.added;
        blocked += result.blocked;
        remaining = result.pending;
        full = result.limitReached;
        setStatus(`Sincronizando · ${added} fotos añadidas.`);
      }
      setStatus([
        `Sincronización terminada · ${added} fotos nuevas publicadas.`,
        blocked ? `Drive no permitió leer ${blocked} fotos compatibles.` : "",
        full ? `El álbum ha alcanzado el límite de ${CLASS_PHOTO_ALBUM_LIMIT} fotos.` : "",
        remaining ? "Quedan fotos por revisar. Pulsa el botón para continuar." : ""
      ].filter(Boolean).join(" "));
    } catch {
      setStatus(`Se publicaron ${added} fotos antes de que se interrumpiera la sincronización. Pulsa el botón para continuar.`);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return <div>
    <button type="button" className="secondary-button" disabled={busy} onClick={sync}>
      {busy ? "Sincronizando fotos de Drive…" : "Sincronizar fotos de Drive ahora"}
    </button>
    <p role="status">{status}</p>
  </div>;
}
