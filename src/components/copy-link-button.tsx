"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export function CopyLinkButton({ value, label = "Copiar link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button className="copy-link-button" type="button" onClick={copyLink}>
      <Copy aria-hidden="true" size={16} />
      {copied ? "Copiado" : label}
    </button>
  );
}
