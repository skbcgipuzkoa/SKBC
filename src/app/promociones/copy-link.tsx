"use client";

import { useState } from "react";

export function CopyPromotionLink({ url }: { url: string }) {
  const [status, setStatus] = useState("");
  return <>
    <button type="button" onClick={async () => {
      try {
        await navigator.clipboard.writeText(url);
        setStatus("Enlace copiado.");
      } catch {
        setStatus(url);
      }
    }}>Copiar enlace</button>
    {status ? <output aria-live="polite"> {status}</output> : null}
  </>;
}
