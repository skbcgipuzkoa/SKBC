"use client";

import { useEffect } from "react";
import { FichaActivityTracker } from "@/components/ficha-activity-tracker";

const TRACKING_WINDOW_MS = 10 * 60 * 1000;

export function FichaAccessTracker({ token }: { token: string }) {
  useEffect(() => {
    const key = `skbc-ficha-access:${token}`;
    let lastTracked = 0;
    try { lastTracked = Number(window.sessionStorage.getItem(key) ?? 0); } catch { /* Optional storage. */ }
    if (Date.now() - lastTracked < TRACKING_WINDOW_MS) return;

    try { window.sessionStorage.setItem(key, String(Date.now())); } catch { /* Optional storage. */ }
    void fetch("/api/ficha/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      keepalive: true
    }).catch(() => {});
  }, [token]);

  return <FichaActivityTracker token={token} />;
}
