"use client";

import { useEffect } from "react";

const TRACKING_WINDOW_MS = 10 * 60 * 1000;

export function FichaAccessTracker({ token }: { token: string }) {
  useEffect(() => {
    const key = `skbc-ficha-access:${token}`;
    const lastTracked = Number(window.sessionStorage.getItem(key) ?? 0);
    if (Date.now() - lastTracked < TRACKING_WINDOW_MS) return;

    window.sessionStorage.setItem(key, String(Date.now()));
    void fetch("/api/ficha/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      keepalive: true
    });
  }, [token]);

  return null;
}
