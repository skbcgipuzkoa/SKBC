"use client";

import { useMemo, useState } from "react";

type Props = {
  token: string;
};

export function CopyFichaLinkButton({ token }: Props) {
  const [copied, setCopied] = useState(false);
  const href = `/ficha/${token}`;
  const absoluteUrl = useMemo(() => {
    if (typeof window === "undefined") return href;
    return `${window.location.origin}${href}`;
  }, [href]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Copia el enlace de ficha:", absoluteUrl);
    }
  }

  return (
    <button className="mini-action ficha-copy-action" type="button" onClick={copyLink}>
      {copied ? "Link copiado" : "Copiar link de ficha"}
    </button>
  );
}
