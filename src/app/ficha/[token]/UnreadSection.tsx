"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./unread-section.module.css";

export function UnreadSection({ title, meta, storageKey, version, children }: {
  title: string; meta: string; storageKey: string; version?: string; children: ReactNode;
}) {
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => {
    if (!version) return;
    const refresh = () => {
      try { setSeen(localStorage.getItem(storageKey) ?? ""); }
      catch { setSeen(""); }
    };
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [storageKey, version]);

  function markRead() {
    if (!version) return;
    setSeen(version);
    try { localStorage.setItem(storageKey, version); } catch { /* Reading still works in this visit. */ }
  }

  return <section className="ficha-section">
    <details className="ficha-foldable" onToggle={event => {
      if (event.currentTarget.open) markRead();
    }}>
      <summary>
        <span><strong>{title}</strong><small>{meta}</small></span>
        {version && seen !== null && seen !== version
          ? <b className={styles.unread}>Nueva · Sin leer</b>
          : <b>Ver detalle</b>}
      </summary>
      <div className="ficha-foldable-body">{children}</div>
    </details>
  </section>;
}
